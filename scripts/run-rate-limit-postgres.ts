import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Own a fresh loopback-only cluster. Never read .env.local or a remote DB URL.
const binary = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const database = `anime_rate_limits_fixture_${process.pid}`;
const listener = createServer();
await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
const address = listener.address();
if (!address || typeof address === 'string') throw new Error('Cannot reserve a fixture port.');
const port = address.port;
await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
const directory = mkdtempSync(join(tmpdir(), 'anime-rate-limits-pg-'));
function execute(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(`${command.split('/').at(-1)} failed in the owned fixture cluster.`);
}
let started = false;
try {
  execute(join(binary, 'initdb'), ['-D', directory, '-U', 'fixture', '--auth=trust', '--no-locale', '-E', 'UTF8']);
  execute(join(binary, 'pg_ctl'), ['-D', directory, '-l', join(directory, 'server.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start']);
  started = true;
  execute(join(binary, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'fixture', database]);
  const child = spawn(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'scripts/test-rate-limits-postgres.ts'], {
    cwd: root, stdio: 'inherit', env: {
      ...process.env, DATABASE_URL: `postgresql://fixture@127.0.0.1:${port}/${database}`,
      DATABASE_URL_UNPOOLED: '', NEON_AUTH_BASE_URL: '', GOOGLE_APPLICATION_CREDENTIALS: '', ANIME_PREVIEW_FIXTURES: '0',
      USER_MUTATION_RPM: '3', USER_GENERATION_RPM: '5', USER_CATALOG_RPM: '60',
      JIKAN_RPS: '3', JIKAN_RPM: '60', JIKAN_CONCURRENCY: '2', GROQ_CONCURRENCY: '1',
      GROQ_RPM: '30', GROQ_RPD: '1000', GROQ_TPM: '8000', GROQ_TPD: '200000',
    },
  });
  const exit = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  if (exit !== 0) process.exitCode = exit;
} catch {
  console.error('The isolated rate-limit PostgreSQL checks could not complete. No remote database was used.');
  process.exitCode = 1;
} finally {
  if (started) {
    try { execute(join(binary, 'pg_ctl'), ['-D', directory, '-m', 'immediate', '-w', 'stop']); }
    catch { console.error('Owned fixture PostgreSQL cleanup failed.'); process.exitCode = 1; }
  }
  rmSync(directory, { recursive: true, force: true });
}
