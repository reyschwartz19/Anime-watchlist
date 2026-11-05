import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { getDb } from './db';
import { previewEnabled } from './preview';
import { emptyBudget, observeBudgetHeaders, reserveBudget, type BudgetCost, type BudgetRule, type BudgetState } from './rate-limit-core';

export class RateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds: number;
  constructor(milliseconds: number, message?: string) {
    const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
    super(message ?? `Please try again in ${seconds} second${seconds === 1 ? '' : 's'}.`);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = seconds;
  }
}

function configured(name: string, fallback: number, maximum = 1_000_000): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Set ${name} to a valid positive integer.`);
  return value;
}

export function providerRules(provider: 'jikan' | 'groq'): BudgetRule[] {
  return provider === 'jikan' ? [
    { windowMs: 1000, requests: configured('JIKAN_RPS', 3, 3) },
    { windowMs: 60_000, requests: configured('JIKAN_RPM', 60, 60) },
  ] : [
    { windowMs: 60_000, requests: configured('GROQ_RPM', 30), tokens: configured('GROQ_TPM', 8000) },
    { windowMs: 86_400_000, requests: configured('GROQ_RPD', 1000), tokens: configured('GROQ_TPD', 200_000) },
  ];
}

// Hash authenticated internal IDs/IPs; budget rows contain no email, token or prompt.
function scoped(kind: string, identifier: string): string {
  return `${kind}:${createHash('sha256').update(identifier).digest('hex')}`;
}

async function changeState<T>(key: string, operation: (state: BudgetState, now: number) => { state: BudgetState; result: T }): Promise<T> {
  // Production never uses process-local counters. The advisory transaction lock
  // serializes the entire decision + reservation across all Vercel instances.
  const result = await getDb().$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS locked`;
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const row = await tx.rateLimitState.findUnique({ where: { key } });
    const previous = row && row.expiresAt > now ? row.value as unknown as BudgetState : emptyBudget();
    const { state, result } = operation(previous, +now);
    const expiresAt = new Date(Math.max(+now + 86_400_000, state.blockedUntil, ...state.leases.map(lease => lease.expiresAt)));
    const value = JSON.parse(JSON.stringify(state));
    await tx.rateLimitState.upsert({ where: { key }, create: { key, value, expiresAt }, update: { value, expiresAt } });
    return result;
  }, { maxWait: 5000, timeout: 10_000 });
  // Cleanup is outside the reservation transaction, so it never holds another
  // key's advisory lock while deleting an expired row. This local throttle is
  // only maintenance; enforcement always uses shared database state and time.
  if (Date.now() >= nextCleanupAt) {
    nextCleanupAt = Date.now() + 60_000;
    try {
      await getDb().$executeRaw`DELETE FROM "RateLimitState" WHERE "key" IN (
        SELECT "key" FROM "RateLimitState" WHERE "expiresAt" < clock_timestamp() LIMIT 100
      ) AND "expiresAt" < clock_timestamp()`;
    } catch { /* Maintenance failure never weakens an accepted reservation. */ }
  }
  return result;
}
let nextCleanupAt = 0;

async function reserve(key: string, rules: BudgetRule[], cost: BudgetCost, lease?: { concurrency: number; durationMs: number }): Promise<() => Promise<void>> {
  if (previewEnabled()) return async () => {};
  const id = randomUUID();
  const retryAfterMs = await changeState(key, (state, now) => {
    const decision = reserveBudget(state, rules, cost, now, lease ? { ...lease, id } : undefined);
    return { state: decision.state, result: decision.retryAfterMs };
  });
  if (retryAfterMs) throw new RateLimitError(retryAfterMs);
  let released = false;
  return async () => {
    if (released || !lease) return;
    released = true;
    await changeState(key, state => ({ state: { ...state, leases: state.leases.filter(value => value.id !== id) }, result: undefined }));
  };
}

export async function reserveProviderBudget(provider: 'jikan' | 'groq', cost: Partial<BudgetCost> = {}): Promise<() => Promise<void>> {
  return reserve(`provider:${provider}`, providerRules(provider), { requests: cost.requests ?? 1, tokens: cost.tokens ?? 0 }, {
    concurrency: configured(provider === 'jikan' ? 'JIKAN_CONCURRENCY' : 'GROQ_CONCURRENCY', provider === 'jikan' ? 2 : 1, 8),
    // Expiry survives a crashed request. Longer than the bounded provider timeout.
    durationMs: provider === 'jikan' ? 20_000 : 60_000,
  });
}

export async function observeProviderHeaders(provider: 'jikan' | 'groq', headers: Headers, status = 200): Promise<void> {
  if (previewEnabled()) return;
  await changeState(`provider:${provider}`, (state, now) => ({ state: observeBudgetHeaders(state, headers, status, now), result: undefined }));
}

export async function enforceUserLimit(userId: string, kind: 'generation' | 'mutation' | 'catalog'): Promise<void> {
  const name = `USER_${kind.toUpperCase()}_RPM`;
  await reserve(scoped(`user:${kind}`, userId), [{ windowMs: 60_000, requests: configured(name, kind === 'generation' ? 5 : 60) }], { requests: 1, tokens: 0 });
}

/**
 * Holds one generation/user across instances and claims its request ID for 24h.
 * Keep the request claim after inference starts: a network timeout can mean the
 * provider completed it, so automatic same-ID replay would spend another call.
 */
export async function acquireGenerationLease(userId: string, requestId: string): Promise<{ release(options?: { retainRequest?: boolean }): Promise<void> }> {
  const releaseUser = await reserve(scoped('generation', userId), [], { requests: 0, tokens: 0 }, { concurrency: 1, durationMs: 240_000 });
  const requestKey = scoped('generation:request', `${userId}:${requestId}`);
  try {
    await reserve(requestKey, [{ windowMs: 86_400_000, requests: 1 }], { requests: 1, tokens: 0 });
  } catch (problem) {
    await releaseUser();
    if (problem instanceof RateLimitError) throw new RateLimitError(problem.retryAfterSeconds * 1000, 'This request was already started. Generate a fresh set of picks to try again.');
    throw problem;
  }
  let released = false;
  return { async release({ retainRequest = true } = {}) {
    if (released) return;
    released = true;
    try {
      if (!retainRequest && !previewEnabled()) await changeState(requestKey, () => ({ state: emptyBudget(), result: undefined }));
    } finally { await releaseUser(); }
  } };
}

export async function enforceAuthLimit(identifier: string, sensitive: boolean): Promise<void> {
  await reserve(scoped(sensitive ? 'auth:sensitive' : 'auth:read', identifier), [{ windowMs: 60_000, requests: configured(sensitive ? 'AUTH_WRITE_RPM' : 'AUTH_READ_RPM', sensitive ? 10 : 120) }], { requests: 1, tokens: 0 });
}
