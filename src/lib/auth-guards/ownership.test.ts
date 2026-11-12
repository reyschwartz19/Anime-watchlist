import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';

let requestHeaders = new Headers();
let budgetCalls = 0;
let providerCalls = 0;
let limited = false;
let valid = true;
class TestLimitError extends Error {}
mock.module('server-only', { namedExports: {} });
mock.module('@neon/auth/next/server', { namedExports: { createNeonAuth: () => ({}) } });
mock.module('next/headers', { namedExports: { headers: async () => requestHeaders } });
mock.module('../preview.ts', { namedExports: { previewEnabled: () => false, previewIdentity: () => null } });
mock.module('../rate-limit.ts', { namedExports: { enforceAuthLimit: async (identifier: string, sensitive: boolean) => {
  budgetCalls++; assert.equal(identifier, '203.0.113.10'); assert.equal(sensitive, false);
  if (limited) throw new TestLimitError('Please try again.');
} } });
mock.module('../auth-session.ts', { namedExports: {
  AuthenticationUnavailableError: class extends Error {},
  hasNeonSessionCookie: (cookie: string | null) => !!cookie?.includes('neon-auth.session_token='),
  fetchVerifiedAuthSession: async () => {
    providerCalls++;
    return valid ? { id: 'verified-provider-id', email: 'fixture@example.invalid', emailVerified: true, name: 'Fixture', image: null } : null;
  },
} });
const { getVerifiedAuthSession } = await import('../auth');

beforeEach(() => {
  process.env.APP_URL = 'https://app.example.test';
  process.env.NEON_AUTH_BASE_URL = 'https://fixture.neonauth.example.test/auth';
  process.env.NEON_AUTH_COOKIE_SECRET = 'fixture-secret-with-at-least-32-characters';
  process.env.VERCEL = '1';
  requestHeaders = new Headers({ cookie: 'neon-auth.session_token=fixture', 'x-forwarded-for': '203.0.113.10' });
  budgetCalls = 0; providerCalls = 0; limited = false; valid = true;
});

test('private session verification passes the shared auth-read gate before contacting Neon', async () => {
  assert.equal((await getVerifiedAuthSession())?.id, 'verified-provider-id');
  assert.equal(budgetCalls, 1); assert.equal(providerCalls, 1);
  limited = true;
  await assert.rejects(getVerifiedAuthSession(), TestLimitError);
  assert.equal(budgetCalls, 2); assert.equal(providerCalls, 1);
});

test('missing cookies do not call Neon and a budget-approved invalid cookie stays unauthenticated', async () => {
  requestHeaders.delete('cookie');
  assert.equal(await getVerifiedAuthSession(), null);
  assert.equal(budgetCalls, 0); assert.equal(providerCalls, 0);
  requestHeaders.set('cookie', 'neon-auth.session_token=invalid'); valid = false;
  assert.equal(await getVerifiedAuthSession(), null);
  assert.equal(budgetCalls, 1); assert.equal(providerCalls, 1);
});
