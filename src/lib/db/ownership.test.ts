import assert from 'node:assert/strict';
import test, { beforeEach, afterEach, mock } from 'node:test';
import { AuthRateLimitUnavailableError } from '../operational-error';

let adapters = 0;
let transactions = 0;
let failurePhase = 'transaction-start';
let failure: unknown;
const globalDb = globalThis as unknown as { animeDb?: unknown };
const original = { ...process.env };
const logs: string[] = [];
const logger = mock.method(console, 'error', (message: unknown) => logs.push(String(message)));
mock.module('server-only', { namedExports: {} });
mock.module('../preview.ts', { namedExports: { previewEnabled: () => false } });
mock.module('../fixture-db.ts', { namedExports: { getFixtureDatabase: () => { throw new Error('Fixtures must not be used.'); } } });
mock.module('@prisma/adapter-pg', { namedExports: { PrismaPg: class {
  constructor(options: { connectionString: string }) {
    adapters++;
    assert.equal(options.connectionString, process.env.DATABASE_URL);
  }
} } });
mock.module('@prisma/client', { namedExports: { PrismaClient: class {
  async $transaction(run: (tx: unknown) => Promise<unknown>) {
    transactions++;
    if (failurePhase === 'transaction-start') throw failure;
    const result = await run({
      $queryRaw: async () => { if (failurePhase === 'advisory-lock') throw failure; return [{ now: new Date() }]; },
      rateLimitState: {
        findUnique: async () => { if (failurePhase === 'budget-read') throw failure; return null; },
        upsert: async () => { if (failurePhase === 'budget-write') throw failure; },
      },
    });
    if (failurePhase === 'transaction-commit') throw failure;
    return result;
  }
} } });
const { enforceAuthLimit } = await import('../rate-limit');

beforeEach(() => {
  delete globalDb.animeDb;
  process.env.VERCEL_ENV = 'preview';
  process.env.DATABASE_URL = 'postgresql://role:a%2fb%40c@ep-example-pooler.region.aws.neon.tech/neondb?sslmode=require';
  process.env.DATABASE_URL_UNPOOLED = 'postgresql://role:a%2Fb@c@ep-example.region.aws.neon.tech/neondb?sslmode=require';
  delete process.env.AUTH_READ_RPM;
  delete process.env.AUTH_WRITE_RPM;
  logs.length = 0; adapters = 0; transactions = 0;
  failurePhase = 'transaction-start';
  failure = { code: 'P2028', message: 'Unable to start a transaction in the given time. private-connection-url' };
});
afterEach(() => {
  delete globalDb.animeDb;
  for (const key of ['VERCEL_ENV', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'AUTH_READ_RPM', 'AUTH_WRITE_RPM']) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
});

test('real getDb rejects missing direct Preview configuration before creating a pool, with a precise safe check', async () => {
  delete process.env.DATABASE_URL_UNPOOLED;
  await assert.rejects(enforceAuthLimit('diagnostic-only', true), AuthRateLimitUnavailableError);
  assert.equal(adapters, 0); assert.equal(transactions, 0);
  const event = JSON.parse(logs[0]);
  assert.equal(event.reason, 'ENVIRONMENT_VALIDATION_FAILED');
  assert.deepEqual(event.diagnostic.environment, { key: 'DATABASE_URL_UNPOOLED', check: 'missing' });
  assert.equal(event.diagnostic.phase, 'database-initialization');
});

test('valid equivalent credentials reach the real limiter transaction and preserve its P2028 diagnosis', async () => {
  await assert.rejects(enforceAuthLimit('diagnostic-only', true), AuthRateLimitUnavailableError);
  assert.equal(adapters, 1); assert.equal(transactions, 1);
  const event = JSON.parse(logs[0]);
  assert.equal(event.reason, 'DATABASE_TRANSACTION_START_TIMEOUT');
  assert.equal(event.diagnostic.phase, 'transaction-start');
  assert.deepEqual(event.diagnostic.prismaCodes, ['P2028']);
  assert.doesNotMatch(logs.join(''), /postgresql|private|a%2f|sslmode/);
});

test('limiter diagnostic identifies lock, read, write and commit failure boundaries without bypassing protection', async () => {
  for (const phase of ['advisory-lock', 'budget-read', 'budget-write', 'transaction-commit']) {
    failurePhase = phase;
    failure = { code: '40001', message: 'private-query-and-parameters' };
    await assert.rejects(enforceAuthLimit('diagnostic-only', true), AuthRateLimitUnavailableError);
    const event = JSON.parse(logs.at(-1)!);
    assert.equal(event.diagnostic.phase, phase);
    assert.equal(event.reason, 'DATABASE_TRANSACTION_FAILED');
    assert.deepEqual(event.diagnostic.postgresCodes, ['40001']);
  }
  assert.doesNotMatch(logs.join(''), /private|parameters|diagnostic-only/);
});

test('invalid auth budget configuration is diagnosed before database initialization', async () => {
  process.env.AUTH_WRITE_RPM = 'not-an-integer';
  await assert.rejects(enforceAuthLimit('diagnostic-only', true), AuthRateLimitUnavailableError);
  assert.equal(adapters, 0);
  const event = JSON.parse(logs[0]);
  assert.deepEqual(event.diagnostic.environment, { key: 'AUTH_WRITE_RPM', check: 'positive-integer' });
  assert.equal(event.diagnostic.phase, 'configuration');
});

test.after(() => logger.mock.restore());
