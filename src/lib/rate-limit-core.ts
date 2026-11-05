/** Pure rolling-window decisions. Persistence and locking live in rate-limit.ts. */
export type BudgetRule = { windowMs: number; requests?: number; tokens?: number };
export type BudgetCost = { requests: number; tokens: number };
export type BudgetState = {
  events: ({ at: number } & BudgetCost)[];
  leases: { id: string; expiresAt: number }[];
  blockedUntil: number;
  remoteRequests?: { remaining: number; resetAt: number };
  remoteTokens?: { remaining: number; resetAt: number };
};
export const emptyBudget = (): BudgetState => ({ events: [], leases: [], blockedUntil: 0 });

export function pruneBudget(state: BudgetState, now: number, horizonMs: number): BudgetState {
  return {
    events: state.events.filter(event => event.at > now - horizonMs),
    leases: state.leases.filter(lease => lease.expiresAt > now),
    blockedUntil: state.blockedUntil > now ? state.blockedUntil : 0,
    ...(state.remoteRequests && state.remoteRequests.resetAt > now ? { remoteRequests: { ...state.remoteRequests } } : {}),
    ...(state.remoteTokens && state.remoteTokens.resetAt > now ? { remoteTokens: { ...state.remoteTokens } } : {}),
  };
}

export function reserveBudget(
  previous: BudgetState, rules: BudgetRule[], cost: BudgetCost, now: number,
  lease?: { id: string; durationMs: number; concurrency: number },
): { state: BudgetState; retryAfterMs: number } {
  if (!Number.isSafeInteger(cost.requests) || cost.requests < 0 || !Number.isSafeInteger(cost.tokens) || cost.tokens < 0) throw new Error('Invalid budget cost.');
  const state = pruneBudget(previous, now, Math.max(1, ...rules.map(rule => rule.windowMs)));
  let retryAfterMs = Math.max(0, state.blockedUntil - now);
  for (const rule of rules) {
    const events = state.events.filter(event => event.at > now - rule.windowMs).sort((left, right) => left.at - right.at);
    for (const dimension of ['requests', 'tokens'] as const) {
      const limit = rule[dimension];
      if (limit === undefined) continue;
      if (cost[dimension] > limit) throw new Error('This request exceeds its configured provider budget.');
      let used = events.reduce((total, event) => total + event[dimension], 0);
      for (const event of events) {
        if (used + cost[dimension] <= limit) break;
        retryAfterMs = Math.max(retryAfterMs, event.at + rule.windowMs - now);
        used -= event[dimension];
      }
    }
  }
  for (const [dimension, remote] of [['requests', state.remoteRequests], ['tokens', state.remoteTokens]] as const) {
    if (remote && cost[dimension] > remote.remaining) retryAfterMs = Math.max(retryAfterMs, remote.resetAt - now);
  }
  if (lease && state.leases.length >= lease.concurrency) {
    retryAfterMs = Math.max(retryAfterMs, Math.min(...state.leases.map(value => value.expiresAt)) - now);
  }
  if (retryAfterMs > 0) return { state, retryAfterMs };
  if (cost.requests || cost.tokens) state.events.push({ at: now, ...cost });
  if (state.remoteRequests) state.remoteRequests.remaining = Math.max(0, state.remoteRequests.remaining - cost.requests);
  if (state.remoteTokens) state.remoteTokens.remaining = Math.max(0, state.remoteTokens.remaining - cost.tokens);
  if (lease) state.leases.push({ id: lease.id, expiresAt: now + lease.durationMs });
  return { state, retryAfterMs: 0 };
}

export function retryAfterMilliseconds(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

/** Groq uses strings such as 2m59.56s, not an absolute timestamp. */
export function resetMilliseconds(value: string | null): number | null {
  if (!value || !/^(?:(?:\d+(?:\.\d+)?)(?:ms|[dhms]))+$/.test(value)) return null;
  const factors: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000, ms: 1 };
  let total = 0;
  for (const part of value.matchAll(/(\d+(?:\.\d+)?)(ms|[dhms])/g)) total += Number(part[1]) * factors[part[2]];
  return Number.isFinite(total) ? Math.ceil(total) : null;
}

export function observeBudgetHeaders(previous: BudgetState, headers: Headers, status: number, now: number): BudgetState {
  const state = { ...previous };
  if (status === 429) state.blockedUntil = Math.max(state.blockedUntil, now + Math.max(1000, retryAfterMilliseconds(headers.get('retry-after'), now) ?? 60_000));
  for (const dimension of ['requests', 'tokens'] as const) {
    const raw = headers.get(`x-ratelimit-remaining-${dimension}`);
    const remaining = raw === null ? NaN : Number(raw);
    const duration = resetMilliseconds(headers.get(`x-ratelimit-reset-${dimension}`));
    if (Number.isSafeInteger(remaining) && remaining >= 0 && duration !== null && duration > 0) {
      const observed = { remaining, resetAt: now + duration };
      if (dimension === 'requests') state.remoteRequests = observed;
      else state.remoteTokens = observed;
    }
  }
  return state;
}
