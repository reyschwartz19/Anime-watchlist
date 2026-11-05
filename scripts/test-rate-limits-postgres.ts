import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { getDb } from '../src/lib/db';
import { acquireGenerationLease, enforceUserLimit, observeProviderHeaders, RateLimitError, reserveProviderBudget } from '../src/lib/rate-limit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Run this through scripts/run-rate-limit-postgres.ts.');
const parsed = new URL(databaseUrl);
if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.startsWith('/anime_rate_limits_fixture_') || parsed.username !== 'fixture') throw new Error('Refusing writes outside the owned loopback rate-limit fixture database.');
const db = getDb();
let passed = 0;
async function check(name: string, run: () => Promise<void>) { await run(); passed++; console.log(`PASS ${name}`); }
try {
  const connection = new Client({ connectionString: databaseUrl });
  await connection.connect();
  try { await connection.query(readFileSync(new URL('../prisma/migrations/202611050002_shared_rate_limits/migration.sql', import.meta.url), 'utf8')); }
  finally { await connection.end(); }

  await check('expired scope rows are removed without touching active budget state', async () => {
    await db.rateLimitState.create({ data: { key: 'fixture:expired', value: { events: [], leases: [], blockedUntil: 0 }, expiresAt: new Date(0) } });
    await enforceUserLimit('cleanup-owner', 'catalog');
    assert.equal(await db.rateLimitState.findUnique({ where: { key: 'fixture:expired' } }), null);
    assert.equal(await db.rateLimitState.count(), 1);
  });

  await check('shared atomic reservations admit exactly three of ten concurrent mutation attempts', async () => {
    const result = await Promise.allSettled(Array.from({ length: 10 }, () => enforceUserLimit('fixture-owner', 'mutation')));
    assert.equal(result.filter(value => value.status === 'fulfilled').length, 3);
    assert.equal(result.filter(value => value.status === 'rejected' && value.reason instanceof RateLimitError).length, 7);
    await assert.rejects(enforceUserLimit('fixture-owner', 'mutation'), RateLimitError);
    await enforceUserLimit('other-owner', 'mutation');
  });

  await check('generation concurrency crosses instances and ambiguous same-ID inference is never replayed', async () => {
    const requestId = randomUUID();
    const lease = await acquireGenerationLease('generation-owner', requestId);
    await assert.rejects(acquireGenerationLease('generation-owner', randomUUID()), RateLimitError);
    await lease.release({ retainRequest: true });
    await lease.release({ retainRequest: false }); // Idempotent; cannot clear an already retained claim.
    await assert.rejects(acquireGenerationLease('generation-owner', requestId), /already started/);
    const newRequest = randomUUID();
    const retryable = await acquireGenerationLease('generation-owner', newRequest);
    await retryable.release({ retainRequest: false });
    const retried = await acquireGenerationLease('generation-owner', newRequest);
    await retried.release({ retainRequest: false });
  });

  await check('Jikan concurrent calls share both concurrency slots and rolling provider counters', async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => reserveProviderBudget('jikan')));
    const accepted = attempts.flatMap(value => value.status === 'fulfilled' ? [value.value] : []);
    assert.equal(accepted.length, 2);
    assert.equal(attempts.filter(value => value.status === 'rejected' && value.reason instanceof RateLimitError).length, 4);
    for (const release of accepted) await release();
    const release = await reserveProviderBudget('jikan'); await release();
    await assert.rejects(reserveProviderBudget('jikan'), RateLimitError);
    await observeProviderHeaders('jikan', new Headers({ 'retry-after': '10' }), 429);
    await assert.rejects(reserveProviderBudget('jikan'), (problem: unknown) => problem instanceof RateLimitError && problem.retryAfterSeconds >= 9);
  });

  await check('Groq reservation accounts for tokens and provider response ceilings', async () => {
    const release = await reserveProviderBudget('groq', { tokens: 5000 });
    await release();
    await assert.rejects(reserveProviderBudget('groq', { tokens: 4000 }), RateLimitError);
    await observeProviderHeaders('groq', new Headers({ 'x-ratelimit-remaining-tokens': '1', 'x-ratelimit-reset-tokens': '30s' }), 200);
    await assert.rejects(reserveProviderBudget('groq', { tokens: 100 }), (problem: unknown) => problem instanceof RateLimitError && problem.retryAfterSeconds >= 29);
  });

  await check('budget records store hashed scope without raw identity or prompts', async () => {
    const rows = await db.rateLimitState.findMany();
    assert.equal(rows.some(row => row.key.includes('fixture-owner')), false);
    assert.equal(rows.some(row => JSON.stringify(row.value).includes('generation-owner')), false);
  });
  console.log(`${passed} real PostgreSQL rate-limit checks passed. No provider requests or remote writes.`);
} finally { await db.$disconnect(); }
