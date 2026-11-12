import { config } from 'dotenv';
import { readdirSync } from 'node:fs';
import pg from 'pg';
import { appOrigin, authConfiguration, validatePreviewDatabasePair } from '../src/lib/environment';
import { databaseFailureCode } from '../src/lib/operational-error';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

async function main() {
  if (process.env.VERCEL_ENV === 'production' || process.env.MIGRATION_TARGET !== 'preview') {
    throw new Error('This check requires MIGRATION_TARGET=preview and refuses VERCEL_ENV=production.');
  }
  validatePreviewDatabasePair();
  authConfiguration();
  console.log('Preview pooled/direct endpoint, database, role, password, TLS, Auth URL and app origin syntax: valid.');
  console.log(`Canonical app origin: ${appOrigin()}`);
  console.log('Confirm migration-preview branch and its matching Auth endpoint in Neon Console; syntax cannot establish branch ownership.');
  if (!['otp', 'link'].includes(process.env.NEON_AUTH_EMAIL_VERIFICATION_METHOD ?? '')) {
    throw new Error('Set NEON_AUTH_EMAIL_VERIFICATION_METHOD explicitly to match the branch (otp or link).');
  }
  for (const key of ['GROQ_API_KEY', 'GROQ_MODEL']) console.log(`${key}: ${process.env[key] ? 'present' : 'missing (recommendations unavailable)'}`);
  if (!process.argv.includes('--connect')) return;
  const expected = readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
    const client = new pg.Client({ connectionString: process.env[key], connectionTimeoutMillis: 10_000, query_timeout: 10_000 });
    try {
      await client.connect();
      await client.query('BEGIN READ ONLY');
      await client.query('SELECT 1');
      const exists = await client.query(`SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS present`);
      if (!exists.rows[0].present) throw Object.assign(new Error(), { code: 'P2021' });
      const result = await client.query<{ migration_name: string; applied: boolean }>('SELECT migration_name, finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied FROM public."_prisma_migrations"');
      const applied = new Set(result.rows.filter(row => row.applied).map(row => row.migration_name));
      const missing = expected.filter(name => !applied.has(name));
      if (missing.length) {
        console.log(`${key}: connected; pending/failed migrations: ${missing.join(', ')}`);
        process.exitCode = 1;
      } else console.log(`${key}: connected; all ${expected.length} repository migrations applied.`);
      await client.query('ROLLBACK');
    } catch (problem) {
      console.error(`${key}: ${databaseFailureCode(problem)}. Check credentials, network and migrations; no data was changed.`);
      process.exitCode = 1;
    } finally { await client.end().catch(() => {}); }
  }
}

main().catch(problem => {
  // Only our static validation messages are safe to display.
  console.error(problem instanceof Error ? problem.message : 'Preview configuration check failed.');
  process.exitCode = 1;
});
