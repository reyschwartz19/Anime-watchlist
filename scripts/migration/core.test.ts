import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, symlinkSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonical, compareEntry, encodeFirestore, makeExport, normalize, validateExport, type Json, type UserExport } from './core';
import { exportOneUser } from './export';
import { outsideGitPath, repositoryRoot, writePrivateJson } from './files';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
const snapshot = (name = 'old-user') => { const data = fixture(name); return makeExport({ projectId: 'synthetic-fixture-project', uid: data.uid as string, path: `users/${data.uid}` }, data); };

test('export reads exactly one explicit document and never exposes collection enumeration', async () => {
  const calls: string[] = [];
  const data = fixture('old-user');
  const result = await exportOneUser({ doc(path) { calls.push(path); return { async get() { calls.push('get'); return { exists: true, data: () => data }; } }; } }, data.uid as string, 'synthetic-fixture-project');
  assert.deepEqual(calls, ['users/firebase-old-user', 'get']);
  assert.equal(result.source.path, 'users/firebase-old-user');
  await assert.rejects(() => exportOneUser({ doc() { throw new Error('must not read'); } }, '', 'project'), /explicit Firebase UID/);
  await assert.rejects(() => exportOneUser({ doc() { throw new Error('must not read'); } }, 'bad/uid', 'project'), /explicit Firebase UID/);
});

test('old record preserves IDs, all statuses, exact epoch timestamp, duplicate favorites, progress and unknown values', () => {
  const source = normalize(snapshot());
  const first = source.entries.find(entry => entry.animeId === 457)!;
  const old = source.entries.find(entry => entry.animeId === 20)!;
  assert.equal(first.status, 'watching');
  assert.equal(first.addedAt?.getTime(), 1700000000123);
  assert.equal(first.legacyProgress, 7);
  assert.equal(old.animeId, 20);
  assert.equal(old.status, 'dropped');
  assert.equal(old.addedAt, null);
  assert.equal(old.legacyProgress, 'unknown old value');
  assert.deepEqual(source.profile.favoriteAnimes, ['Mushi-Shi', 'Cowboy Bebop', 'Mushi-Shi']);
  assert.equal(source.profile.onboarded, true);
  assert.ok(source.issues.some(issue => issue.path === 'watchlist.20.mal_id' && issue.code === 'missing-field'));
  assert.ok(source.issues.some(issue => issue.path === 'watchlist.20.addedAt' && issue.code === 'missing-field'));
  const all = fixture('old-user');
  const watchlist = all.watchlist as Record<string, Record<string, unknown>>;
  for (const [index, status] of ['watching', 'completed', 'plan_to_watch', 'dropped'].entries()) watchlist[String(index + 1)] = { mal_id: index + 1, status };
  const statuses = normalize(makeExport({ projectId: 'project', uid: all.uid as string, path: `users/${all.uid}` }, all)).entries.map(entry => entry.status);
  for (const status of ['watching', 'completed', 'plan_to_watch', 'dropped']) assert.ok(statuses.includes(status as never));
});

test('malformed entries and absent fields are reported without inventing a status, timestamp or preferences', () => {
  const source = normalize(snapshot('malformed-user'));
  assert.deepEqual(source.rejectedSourceKeys.sort(), ['20', '30', '457']);
  assert.equal(source.entries.length, 1);
  assert.equal(source.entries[0].animeId, 40);
  assert.equal(source.entries[0].addedAt, null);
  assert.deepEqual(source.entries[0].legacyProgress, { unmapped: true });
  assert.equal(source.profile.interests, undefined);
  assert.equal(source.profile.onboarded, undefined);
  assert.ok(source.issues.some(issue => issue.path === 'photoURL' && issue.code === 'missing-field'));
  assert.deepEqual(source.snapshot.document, fixture('malformed-user'));
});

test('lossless export tags handle nanosecond timestamps, bigint, nonfinite values, bytes and reserved-tag collisions', () => {
  class Timestamp { constructor(public seconds: number, public nanoseconds: number) {} }
  const raw = { uid: 'tagged', watchlist: { '457': { mal_id: 457n, status: 'completed', addedAt: new Timestamp(1700000000, 123456789), progress: 4n, custom: { nan: NaN, inf: Infinity, bytes: Buffer.from([0, 255]), original: { $firebaseType: 'timestamp', seconds: 2 } } } } };
  const exported = makeExport({ projectId: 'project', uid: 'tagged', path: 'users/tagged' }, raw);
  const serialized = JSON.parse(JSON.stringify(exported)) as UserExport;
  assert.equal(validateExport(serialized, 'tagged').sourceDigest, exported.sourceDigest);
  const source = normalize(serialized);
  assert.equal(source.entries[0].addedAt?.getTime(), 1700000000123);
  assert.deepEqual(source.entries[0].legacyProgress, { $firebaseType: 'bigint', value: '4' });
  assert.equal(source.entries[0].animeId, 457);
  assert.ok(canonical(exported.document).includes('123456789'));
  assert.deepEqual(encodeFirestore({ $firebaseType: 'timestamp', seconds: 2 }), { $firebaseType: 'map', entries: [['$firebaseType', 'timestamp'], ['seconds', 2]] });
  assert.deepEqual(encodeFirestore(-0), { $firebaseType: 'number', value: '-0' });
  const collision = makeExport({ projectId: 'project', uid: 'tagged', path: 'users/tagged' }, { uid: 'tagged', watchlist: { '457': { mal_id: 457, status: 'watching', addedAt: { $firebaseType: 'timestamp', seconds: 2, nanoseconds: 0 } } } });
  assert.equal(normalize(collision).entries[0].addedAt, null, 'a user map cannot impersonate a serialized Firestore timestamp');
});

test('canonical digest detects edited/incomplete exports and explicit UID mismatch', () => {
  const original = snapshot();
  assert.equal(validateExport(original, 'firebase-old-user'), original);
  assert.throws(() => validateExport(original, 'other-user'), /does not match/);
  const changed = JSON.parse(JSON.stringify(original));
  changed.document.displayName = 'Edited outside exporter';
  assert.throws(() => validateExport(changed, 'firebase-old-user'), /digest mismatch/);
});

test('duplicate source IDs are rejected rather than arbitrarily merged', () => {
  const exported = makeExport({ projectId: 'project', uid: 'duplicates', path: 'users/duplicates' }, { uid: 'duplicates', watchlist: { '457': { mal_id: 457, status: 'watching' }, '00457': { mal_id: 457, status: 'completed' } } });
  const source = normalize(exported);
  assert.equal(source.entries.length, 0);
  assert.equal(source.rejectedSourceKeys.length, 2);
  assert.ok(source.issues.some(issue => issue.code === 'duplicate-anime-id'));
});

test('comparison checks IDs, statuses and preserved fields, not just totals', () => {
  const source = normalize(snapshot()).entries[0];
  const equal = { animeId: source.animeId, status: source.status, anime: source.anime, addedAt: source.addedAt, legacyRaw: source.legacyRaw, legacyProgress: source.legacyProgress!, editedAt: null, deletedAt: null };
  assert.equal(compareEntry(source, equal).result, 'equal');
  const changed = compareEntry(source, { ...equal, status: 'completed', anime: { ...source.anime, title: 'Different' }, legacyProgress: 8, editedAt: new Date(), deletedAt: new Date() });
  assert.deepEqual(changed.differences.sort(), ['anime', 'deletedAt', 'legacyProgress', 'status']);
  assert.equal(changed.destinationEdited, true);
  assert.equal(changed.destinationDeleted, true);
  assert.equal(changed.sourceStatus, source.status);
  assert.equal(changed.destinationStatus, 'completed');
  assert.ok(compareEntry({ ...source, legacyProgress: undefined }, equal).differences.includes('legacyProgress'));
});

test('backup path checks reject Git and symlink escapes; outputs never overwrite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'anime-migration-files-'));
  try {
    assert.throws(() => outsideGitPath(join(repositoryRoot, 'backup.json')), /outside the repository/);
    assert.throws(() => outsideGitPath('relative.json'), /absolute/);
    const link = join(directory, 'repo-link');
    symlinkSync(repositoryRoot, link);
    assert.throws(() => outsideGitPath(join(link, 'backup.json')), /outside the repository/);
    const otherGit = join(directory, 'other-git');
    mkdirSync(otherGit); mkdirSync(join(otherGit, '.git'));
    writeFileSync(join(otherGit, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    assert.throws(() => outsideGitPath(join(otherGit, 'backup.json')), /outside every Git/);
    const output = join(directory, 'backup.json');
    writePrivateJson(output, { synthetic: true });
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.throws(() => writePrivateJson(output, { overwritten: true }), /EEXIST/);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).synthetic, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
