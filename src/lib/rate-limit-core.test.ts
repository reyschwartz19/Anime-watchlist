import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyBudget, observeBudgetHeaders, reserveBudget, resetMilliseconds, retryAfterMilliseconds } from './rate-limit-core';

test('rolling Jikan second/minute limits do not permit boundary bursts', () => {
  const rules = [{ windowMs: 1000, requests: 3 }, { windowMs: 60_000, requests: 60 }];
  let state = emptyBudget();
  for (const at of [990, 991, 992]) {
    const result = reserveBudget(state, rules, { requests: 1, tokens: 0 }, at);
    assert.equal(result.retryAfterMs, 0); state = result.state;
  }
  const denied = reserveBudget(state, rules, { requests: 1, tokens: 0 }, 1001);
  assert.equal(denied.retryAfterMs, 989);
  assert.equal(denied.state.events.length, 3);
  assert.equal(reserveBudget(state, rules, { requests: 1, tokens: 0 }, 1990).retryAfterMs, 0);
});

test('Groq reserves requests and conservative tokens against both minute/day windows', () => {
  const rules = [{ windowMs: 60_000, requests: 30, tokens: 8000 }, { windowMs: 86_400_000, requests: 1000, tokens: 200_000 }];
  let state = emptyBudget();
  for (const at of [10, 20]) {
    const result = reserveBudget(state, rules, { requests: 1, tokens: 4000 }, at);
    assert.equal(result.retryAfterMs, 0); state = result.state;
  }
  assert.equal(reserveBudget(state, rules, { requests: 1, tokens: 100 }, 100).retryAfterMs, 59_910);
  assert.throws(() => reserveBudget(state, rules, { requests: 1, tokens: 8001 }, 100), /exceeds/);
  const daily = { ...emptyBudget(), events: [{ at: 0, requests: 1000, tokens: 0 }] };
  assert.equal(reserveBudget(daily, rules, { requests: 1, tokens: 1 }, 60_001).retryAfterMs, 86_339_999);
});

test('provider remaining-token and daily-request headers constrain the next reservation', () => {
  const headers = new Headers({
    'x-ratelimit-remaining-tokens': '125', 'x-ratelimit-reset-tokens': '7.66s',
    'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '2m59.56s',
  });
  const state = observeBudgetHeaders(emptyBudget(), headers, 200, 1000);
  assert.deepEqual(state.remoteTokens, { remaining: 125, resetAt: 8660 });
  assert.equal(reserveBudget(state, [], { requests: 1, tokens: 126 }, 2000).retryAfterMs, 178_560);
  assert.equal(reserveBudget(state, [], { requests: 1, tokens: 126 }, 180_560).retryAfterMs, 0);
});

test('Retry-After seconds/date are honored, malformed headers do not disable budgets', () => {
  assert.equal(retryAfterMilliseconds('2.5', 1000), 2500);
  assert.equal(retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:06 GMT', 1000), 5000);
  assert.equal(retryAfterMilliseconds('bad', 1000), null);
  assert.equal(resetMilliseconds('1h2m3.4s'), 3_723_400);
  assert.equal(resetMilliseconds('7ms'), 7);
  assert.equal(resetMilliseconds('1sBAD'), null);
  const state = observeBudgetHeaders(emptyBudget(), new Headers({ 'retry-after': '30' }), 429, 1000);
  assert.equal(reserveBudget(state, [], { requests: 1, tokens: 0 }, 2000).retryAfterMs, 29_000);
  assert.equal(state.events.length, 0);
});

test('concurrency leases expire after crashes and are independent of request reservations', () => {
  let state = emptyBudget();
  const lease = { id: 'a', durationMs: 20_000, concurrency: 1 };
  let result = reserveBudget(state, [], { requests: 0, tokens: 0 }, 1000, lease);
  assert.equal(result.retryAfterMs, 0); state = result.state;
  result = reserveBudget(state, [], { requests: 0, tokens: 0 }, 2000, { ...lease, id: 'b' });
  assert.equal(result.retryAfterMs, 1000, 'in-flight work must not impose the crash-recovery TTL as a user cooldown');
  assert.equal(result.state.leases.length, 1);
  assert.equal(reserveBudget(state, [], { requests: 0, tokens: 0 }, 21_000, lease).retryAfterMs, 0);
});

test('failed reservations never charge a request, while input costs are bounded integers', () => {
  const initial = emptyBudget();
  const accepted = reserveBudget(initial, [{ windowMs: 60_000, requests: 1 }], { requests: 1, tokens: 0 }, 0);
  const denied = reserveBudget(accepted.state, [{ windowMs: 60_000, requests: 1 }], { requests: 1, tokens: 0 }, 1);
  assert.equal(initial.events.length, 0);
  assert.equal(denied.state.events.length, 1);
  assert.throws(() => reserveBudget(initial, [], { requests: -1, tokens: 0 }, 0), /Invalid/);
  assert.throws(() => reserveBudget(initial, [], { requests: 1, tokens: NaN }, 0), /Invalid/);
});
