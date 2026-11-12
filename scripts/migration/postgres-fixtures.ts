import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { canonical, makeExport, normalize, type Json } from './core';
import { backupDestination, importOneUser, inspectMigration } from './store';

const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('This fixture runner requires the isolated database started by run-postgres-fixtures.ts.');
const parsed = new URL(databaseUrl);
if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.startsWith('/anime_migration_fixture_') || parsed.username !== 'fixture') throw new Error('Refusing fixture writes outside the owned loopback fixture database.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 8 }) });
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
const source = (name = 'old-user') => { const data = fixture(name); return makeExport({ projectId: 'synthetic-fixture-project', uid: data.uid as string, path: `users/${data.uid}` }, data); };
let passed = 0;
async function check(name: string, run: () => Promise<void>) { await run(); passed++; console.log(`PASS ${name}`); }
async function user(label: string) {
  const created = await db.appUser.create({ data: { id: randomUUID(), authProviderId: `managed-${label}`, email: `${label}@example.invalid`, displayName: 'New login' } });
  return { userId: created.id, authProviderId: created.authProviderId, email: created.email! };
}

try {
  const connection = new Client({ connectionString: databaseUrl });
  await connection.connect();
  try {
    // This is a freshly owned, disposable database. Exercise the actual ordered
    // migration chain here; never apply these fixture commands to a Neon branch.
    const migrations = new URL('../../prisma/migrations/', import.meta.url);
    for (const directory of readdirSync(migrations, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await connection.query(readFileSync(new URL(`${directory.name}/migration.sql`, migrations), 'utf8'));
    }
  }
  finally { await connection.end(); }

  await check('read-only dry run performs no writes and plans by anime ID', async () => {
    const destination = await user('dry-run');
    const plan = await inspectMigration(db, source(), destination);
    assert.deepEqual(plan.plannedInsertAnimeIds.sort((a, b) => a - b), [20, 457]);
    assert.equal(plan.archive, 'missing');
    assert.equal(await db.libraryEntry.count({ where: { userId: destination.userId } }), 0);
    assert.equal(await db.migrationBinding.count({ where: { userId: destination.userId } }), 0);
    assert.equal((await db.appUser.findUniqueOrThrow({ where: { id: destination.userId } })).displayName, 'New login');
  });

  await check('old record imports losslessly, verifies fields and preserves unknown timestamp as null', async () => {
    const destination = await user('old-import');
    const snapshot = source();
    const result = await importOneUser(db, snapshot, destination);
    assert.equal(result.equivalent, true);
    assert.equal(result.entries.length, 2);
    assert.ok(result.entries.every(entry => entry.result === 'equal'));
    const entry = await db.libraryEntry.findUniqueOrThrow({ where: { userId_animeId: { userId: destination.userId, animeId: 457 } } });
    assert.equal(entry.addedAt?.getTime(), 1700000000123);
    assert.equal(entry.legacyProgress, 7);
    assert.equal(entry.editedAt, null);
    const old = await db.libraryEntry.findUniqueOrThrow({ where: { userId_animeId: { userId: destination.userId, animeId: 20 } } });
    assert.equal(old.addedAt, null);
    assert.equal(old.legacyProgress, 'unknown old value');
    const profile = await db.appUser.findUniqueOrThrow({ where: { id: destination.userId } });
    assert.deepEqual(profile.interests, ['Supernatural', 'Mystery']);
    assert.deepEqual(profile.favoriteAnimes, ['Mushi-Shi', 'Cowboy Bebop', 'Mushi-Shi']);
    assert.equal(profile.onboarded, true);
    const binding = await db.migrationBinding.findUniqueOrThrow({ where: { userId: destination.userId } });
    const archived = await db.migrationSnapshot.findUniqueOrThrow({ where: { bindingId_sourceDigest: { bindingId: binding.id, sourceDigest: snapshot.sourceDigest } } });
    assert.equal(canonical(archived.sourceDocument as Json), canonical(snapshot.document));
    assert.equal((await inspectMigration(db, snapshot, destination, 'verify')).equivalent, true);
    const backup = await backupDestination(db, snapshot, destination) as { destinationUserId: string; library: unknown[] };
    assert.equal(backup.destinationUserId, destination.userId);
    assert.equal(backup.library.length, 2);
  });

  await check('two users can own overlapping anime IDs and cannot steal a source binding', async () => {
    const first = await user('overlap-first');
    const second = await user('overlap-second');
    // Dedicated source UIDs avoid the binding established by the preceding test.
    const firstData = fixture('old-user'); firstData.uid = 'overlap-source-first';
    const firstSource = makeExport({ projectId: 'synthetic-fixture-project', uid: firstData.uid as string, path: `users/${firstData.uid}` }, firstData);
    const secondSource = source('overlapping-user');
    await importOneUser(db, firstSource, first);
    await importOneUser(db, secondSource, second);
    const rows = await db.libraryEntry.findMany({ where: { animeId: 457, userId: { in: [first.userId, second.userId] } } });
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.userId === first.userId)?.status, 'watching');
    assert.equal(rows.find(row => row.userId === second.userId)?.status, 'completed');
    await assert.rejects(() => importOneUser(db, firstSource, second), /already bound/);
    assert.equal((await db.libraryEntry.findUniqueOrThrow({ where: { userId_animeId: { userId: second.userId, animeId: 457 } } })).status, 'completed');
  });

  await check('repeat run is idempotent and preserves newer status, metadata, preferences and deletion tombstone', async () => {
    const destination = await user('repeat');
    const data = fixture('old-user'); data.uid = 'repeat-source';
    const snapshot = makeExport({ projectId: 'project', uid: 'repeat-source', path: 'users/repeat-source' }, data);
    await importOneUser(db, snapshot, destination);
    const firstRepeat = await importOneUser(db, snapshot, destination);
    assert.equal(firstRepeat.equivalent, true);
    assert.equal(await db.libraryEntry.count({ where: { userId: destination.userId } }), 2);
    const editedAt = new Date('2026-11-04T12:00:00Z');
    await db.libraryEntry.update({ where: { userId_animeId: { userId: destination.userId, animeId: 457 } }, data: { status: 'completed', anime: { mal_id: 457, title: 'Newer destination title' }, editedAt } });
    await db.libraryEntry.update({ where: { userId_animeId: { userId: destination.userId, animeId: 20 } }, data: { deletedAt: editedAt, editedAt } });
    await db.appUser.update({ where: { id: destination.userId }, data: { interests: ['Action'], favoriteAnimes: ['New favorite'], profileEditedAt: editedAt } });
    const retry = await importOneUser(db, snapshot, destination);
    assert.equal(retry.equivalent, false);
    assert.ok(retry.entries.find(entry => entry.animeId === 457)?.differences.includes('status'));
    assert.equal(retry.entries.find(entry => entry.animeId === 20)?.destinationDeleted, true);
    assert.equal(await db.libraryEntry.count({ where: { userId: destination.userId } }), 2);
    const current = await db.libraryEntry.findUniqueOrThrow({ where: { userId_animeId: { userId: destination.userId, animeId: 457 } } });
    assert.equal(current.status, 'completed');
    assert.deepEqual(current.anime, { mal_id: 457, title: 'Newer destination title' });
    assert.deepEqual((await db.appUser.findUniqueOrThrow({ where: { id: destination.userId } })).interests, ['Action']);
    assert.ok((await db.libraryEntry.findUniqueOrThrow({ where: { userId_animeId: { userId: destination.userId, animeId: 20 } } })).deletedAt);
    const binding = await db.migrationBinding.findUniqueOrThrow({ where: { userId: destination.userId } });
    assert.equal(await db.migrationSnapshot.count({ where: { bindingId: binding.id } }), 1);
  });

  await check('first import does not overwrite destination preferences already edited before migration', async () => {
    const destination = await user('already-edited');
    await db.appUser.update({ where: { id: destination.userId }, data: { interests: ['Sports'], onboarded: true, profileEditedAt: new Date() } });
    const data = fixture('old-user'); data.uid = 'already-edited-source';
    const result = await importOneUser(db, makeExport({ projectId: 'project', uid: data.uid as string, path: `users/${data.uid}` }, data), destination);
    assert.equal(result.equivalent, false);
    assert.equal(result.profile.find(field => field.field === 'interests')?.result, 'preserve');
    assert.deepEqual((await db.appUser.findUniqueOrThrow({ where: { id: destination.userId } })).interests, ['Sports']);
  });

  for (const point of ['binding', 'entries', 'profile'] as const) await check(`interruption after ${point} rolls back every write and retry succeeds`, async () => {
    const destination = await user(`interruption-${point}`);
    const data = fixture('old-user'); data.uid = `interrupted-source-${point}`;
    const snapshot = makeExport({ projectId: 'project', uid: data.uid as string, path: `users/${data.uid}` }, data);
    await assert.rejects(() => importOneUser(db, snapshot, destination, { failAfter: point }), /Fixture interruption/);
    assert.equal(await db.migrationBinding.count({ where: { userId: destination.userId } }), 0);
    assert.equal(await db.libraryEntry.count({ where: { userId: destination.userId } }), 0);
    assert.equal((await db.appUser.findUniqueOrThrow({ where: { id: destination.userId } })).displayName, 'New login');
    assert.equal((await importOneUser(db, snapshot, destination)).equivalent, true);
  });

  await check('concurrent repeat imports respect unique constraints and produce one snapshot', async () => {
    const destination = await user('concurrent');
    const data = fixture('old-user'); data.uid = 'concurrent-source';
    const snapshot = makeExport({ projectId: 'project', uid: data.uid as string, path: `users/${data.uid}` }, data);
    await Promise.all([importOneUser(db, snapshot, destination), importOneUser(db, snapshot, destination)]);
    assert.equal(await db.libraryEntry.count({ where: { userId: destination.userId } }), 2);
    const binding = await db.migrationBinding.findUniqueOrThrow({ where: { userId: destination.userId } });
    assert.equal(await db.migrationSnapshot.count({ where: { bindingId: binding.id } }), 1);
  });

  await check('malformed source requires explicit acceptance but all original values are archived', async () => {
    const destination = await user('malformed');
    const snapshot = source('malformed-user');
    await assert.rejects(() => importOneUser(db, snapshot, destination), /require review/);
    assert.equal(await db.libraryEntry.count({ where: { userId: destination.userId } }), 0);
    const accepted = await importOneUser(db, snapshot, destination, { acceptIssues: true });
    assert.deepEqual(accepted.rejectedSourceKeys.sort(), ['20', '30', '457']);
    assert.equal(accepted.entries.length, 1);
    const binding = await db.migrationBinding.findUniqueOrThrow({ where: { userId: destination.userId } });
    const archived = await db.migrationSnapshot.findUniqueOrThrow({ where: { bindingId_sourceDigest: { bindingId: binding.id, sourceDigest: snapshot.sourceDigest } } });
    assert.equal(canonical(archived.sourceDocument as Json), canonical(snapshot.document));
  });

  await check('same totals do not hide modified preserved fields or wrong verified destination', async () => {
    const destination = await user('compare');
    const data = fixture('old-user'); data.uid = 'comparison-source';
    const snapshot = makeExport({ projectId: 'project', uid: data.uid as string, path: `users/${data.uid}` }, data);
    await importOneUser(db, snapshot, destination);
    await db.libraryEntry.update({ where: { userId_animeId: { userId: destination.userId, animeId: 457 } }, data: { legacyProgress: 99 } });
    const report = await inspectMigration(db, snapshot, destination, 'verify');
    assert.equal(report.entries.length, 2);
    assert.equal(report.equivalent, false);
    assert.ok(report.entries.find(entry => entry.animeId === 457)?.differences.includes('legacyProgress'));
    await assert.rejects(() => inspectMigration(db, snapshot, { ...destination, authProviderId: 'wrong-provider' }), /no longer matches/);
    await assert.rejects(() => inspectMigration(db, snapshot, { ...destination, email: 'wrong@example.invalid' }), /no longer matches/);
  });

  await check('destination-only IDs are reported and source revisions cannot overwrite existing rows', async () => {
    const destination = await user('source-revision');
    const data = fixture('old-user'); data.uid = 'source-revision';
    const original = makeExport({ projectId: 'project', uid: 'source-revision', path: 'users/source-revision' }, data);
    await importOneUser(db, original, destination);
    await db.libraryEntry.create({ data: { userId: destination.userId, animeId: 99, status: 'plan_to_watch', anime: { mal_id: 99, title: 'A new destination edit' }, editedAt: new Date() } });
    const extra = await inspectMigration(db, original, destination, 'verify');
    assert.equal(extra.equivalent, false);
    assert.deepEqual(extra.destinationOnlyAnimeIds, [99]);
    (data.watchlist as Record<string, Record<string, unknown>>)['457'].status = 'completed';
    const revision = makeExport(original.source, data);
    const result = await importOneUser(db, revision, destination);
    assert.equal(result.equivalent, false);
    assert.ok(result.entries.find(entry => entry.animeId === 457)?.differences.includes('status'));
    assert.equal((await db.libraryEntry.findUniqueOrThrow({ where: { userId_animeId: { userId: destination.userId, animeId: 457 } } })).status, 'watching');
    assert.equal(await db.libraryEntry.count({ where: { userId: destination.userId } }), 3);
  });

  console.log(`PostgreSQL fixtures: ${passed} scenarios passed. Only the temporary loopback fixture database was written.`);
} finally { await db.$disconnect(); }
