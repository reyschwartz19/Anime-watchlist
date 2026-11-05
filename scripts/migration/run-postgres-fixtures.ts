import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// No destination env or local .env is read. Create and own a disposable local
// cluster, run the actual migration SQL/Prisma paths, then stop and remove it.
const binary = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin';
const directory = mkdtempSync(join(tmpdir(), 'anime-migration-pg-'));
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const database = `anime_migration_fixture_${process.pid}`;
const listener = createServer();
await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
const address = listener.address();
if (!address || typeof address === 'string') throw new Error('Cannot reserve fixture port.');
const port = address.port;
await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
const exec = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(`${command.split('/').at(-1)} failed: ${result.stderr || result.stdout || result.error?.message}`);
};
let started = false;
try {
  exec(join(binary, 'initdb'), ['-D', directory, '-U', 'fixture', '--auth=trust', '--no-locale', '-E', 'UTF8']);
  exec(join(binary, 'pg_ctl'), ['-D', directory, '-l', join(directory, 'server.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start']);
  started = true;
  exec(join(binary, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'fixture', database]);
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/migration/postgres-fixtures.ts'], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, MIGRATION_TEST_DATABASE_URL: `postgresql://fixture@127.0.0.1:${port}/${database}`, DATABASE_URL: '', DATABASE_URL_UNPOOLED: '', NEON_AUTH_BASE_URL: '', GOOGLE_APPLICATION_CREDENTIALS: '' },
  });
  const exit = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  if (exit !== 0) process.exitCode = exit;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Fixture startup failed.');
  process.exitCode = 1;
} finally {
  if (started) {
    try { exec(join(binary, 'pg_ctl'), ['-D', directory, '-m', 'immediate', '-w', 'stop']); }
    catch (error) { console.error(`Fixture cleanup failed: ${error instanceof Error ? error.message : 'unknown'}`); process.exitCode = 1; }
  }
  rmSync(directory, { recursive: true, force: true });
}
