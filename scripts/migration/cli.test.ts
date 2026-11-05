import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeExport } from './core';
import { createIdentityReceipt } from '../../src/lib/migration-identity';

const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
const loader = fileURLToPath(new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url));
const source = JSON.parse(readFileSync(new URL('./fixtures/old-user.json', import.meta.url), 'utf8'));

test('CLI requires explicit IDs, defaults to dry-run, rejects forged receipts and production writes before connecting', () => {
  const directory = mkdtempSync(join(tmpdir(), 'anime-cli-guards-'));
  try {
    const secret = 'synthetic-test-key-'.repeat(4);
    const databaseUrl = 'postgresql://fixture@127.0.0.1:1/not-a-real-database';
    const authBaseUrl = 'https://synthetic.neonauth.example/db/auth';
    const internalUserId = '00000000-0000-4000-8000-000000000001';
    const exported = join(directory, 'source.json');
    const receiptFile = join(directory, 'receipt.json');
    writeFileSync(exported, JSON.stringify(makeExport({ projectId: 'synthetic', uid: source.uid, path: `users/${source.uid}` }, source)));
    const receipt = createIdentityReceipt({ userId: internalUserId, authProviderId: 'synthetic-auth', email: 'fixture@example.test', emailVerified: true }, { authBaseUrl, databaseUrl, secret });
    writeFileSync(receiptFile, JSON.stringify(receipt));
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: '', NEON_AUTH_BASE_URL: authBaseUrl, MIGRATION_IDENTITY_SECRET: secret, MIGRATION_TARGET: 'preview', NODE_ENV: 'test', VERCEL_ENV: 'preview', GOOGLE_APPLICATION_CREDENTIALS: '' };
    const run = (args: string[], overrides: Partial<NodeJS.ProcessEnv> = {}) => {
      const result = spawnSync(process.execPath, ['--import', loader, cli, ...args], { cwd: directory, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 15_000 });
      if (result.error) throw result.error;
      return result;
    };
    assert.match(run([]).stderr, /--source-uid is required/);
    assert.match(run(['--source-uid', source.uid]).stderr, /--destination-user-id is required/);
    const flags = ['--source-uid', source.uid, '--destination-user-id', internalUserId, '--file', exported, '--identity-receipt', receiptFile];
    const productionEnvironments: Partial<NodeJS.ProcessEnv>[] = [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }, { MIGRATION_TARGET: 'production' }];
    for (const overrides of productionEnvironments) {
      const result = run(['import', ...flags, '--destination-backup', join(directory, 'before.json'), '--confirm-write', `${source.uid}:${internalUserId}`], overrides);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /restricted.*preview/);
      assert.ok(!result.stderr.includes('ECONNREFUSED'));
    }
    assert.match(run(['import', ...flags, '--confirm-write', 'wrong']).stderr, /must exactly match/);
    const importFlags = ['import', ...flags, '--confirm-write', `${source.uid}:${internalUserId}`, '--destination-backup', join(directory, 'before.json')];
    const missingPlan = run(importFlags);
    assert.match(missingPlan.stderr, /--dry-run-report is required/);
    assert.ok(!missingPlan.stderr.includes('ECONNREFUSED'));
    const wrongPlan = join(directory, 'wrong-plan.json');
    writeFileSync(wrongPlan, JSON.stringify({ version: 1, mode: 'dry-run', sourceUid: 'other-user', destinationUserId: internalUserId, sourceDigest: 'wrong', entries: [], profile: [], issues: [], plannedInsertAnimeIds: [] }), { mode: 0o600 });
    const mismatchedPlan = run([...importFlags, '--dry-run-report', wrongPlan]);
    assert.match(mismatchedPlan.stderr, /does not match/);
    assert.ok(!mismatchedPlan.stderr.includes('ECONNREFUSED'));
    writeFileSync(receiptFile, JSON.stringify({ ...receipt, signature: 'forged' }));
    assert.match(run(['dry-run', ...flags]).stderr, /signature is invalid/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
