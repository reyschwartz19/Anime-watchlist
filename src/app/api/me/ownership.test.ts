import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { AuthenticationUnavailableError } from '../../../lib/auth-session';
import { AuthRateLimitUnavailableError } from '../../../lib/operational-error';

// This directory is nested one level below api; use relative imports to the
// actual resolver while keeping each response scenario independent of providers.
let failure: Error | undefined;
let user: Record<string, unknown> | null = null;
class TestRateLimitError extends Error { retryAfterSeconds = 12; }
mock.module('../../../lib/current-user.ts', { namedExports: { getCurrentUser: async () => { if (failure) throw failure; return user; } } });
mock.module('../../../lib/rate-limit.ts', { namedExports: { RateLimitError: TestRateLimitError } });
const { GET } = await import('./route');

test('only missing sessions return 401; operational failures remain recoverable', async () => {
  assert.equal((await GET()).status, 401);
  for (const [problem, code, status] of [
    [new Error('private-database-url'), 'PROFILE_UNAVAILABLE', 503],
    [new AuthenticationUnavailableError(), 'AUTH_UNAVAILABLE', 503],
    [new AuthRateLimitUnavailableError({ code: 'P1000' }), 'AUTH_RATE_LIMIT_UNAVAILABLE', 503],
    [new TestRateLimitError('Wait'), 'AUTH_RATE_LIMITED', 429],
  ] as const) {
    failure = problem;
    const response = await GET();
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assert.equal(body.code, code);
    assert.doesNotMatch(JSON.stringify(body), /private-database-url/);
  }
  failure = undefined;
  user = { id: 'internal', authProviderId: 'provider', email: 'test@example.test', emailVerified: true, onboarded: true };
  assert.equal((await (await GET()).json()).internalUserId, 'internal');
});
