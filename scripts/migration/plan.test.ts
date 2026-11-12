import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireMatchingDryRun } from './plan';

test('import requires a private prior plan for exact source UID, digest and verified destination', () => {
  const directory = mkdtempSync(join(tmpdir(), 'anime-migration-plan-'));
  const file = join(directory, 'plan.json');
  const expected = { sourceUid: 'explicit-firebase-uid', destinationUserId: 'verified-destination', sourceDigest: 'immutable-source-digest' };
  const plan = { version: 1, mode: 'dry-run', ...expected, entries: [], profile: [], issues: [], plannedInsertAnimeIds: [] };
  const write = (value: unknown) => writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  try {
    write(plan); requireMatchingDryRun(file, expected);
    for (const changed of [{ mode: 'import' }, { version: 2 }, { sourceUid: 'other' }, { destinationUserId: 'other' }, { sourceDigest: 'changed-revision' }, { entries: null }]) {
      write({ ...plan, ...changed });
      assert.throws(() => requireMatchingDryRun(file, expected), /does not match/);
    }
    write(plan); chmodSync(file, 0o644);
    assert.throws(() => requireMatchingDryRun(file, expected), /must be private/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
