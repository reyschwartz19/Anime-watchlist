import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthenticationUnavailableError, fetchVerifiedAuthSession } from '../src/lib/auth-session';

const now = Date.parse('2026-11-04T12:00:00.000Z');
const config = {
  baseUrl: 'https://branch.example.neon.tech/neondb/auth',
  origin: 'https://preview.example.test',
  cookie: '__Secure-neon-auth.session_token=server-token; __Secure-neon-auth.local.session_data=forged-local-snapshot; unrelated=private-value',
};
const fixture = () => ({
  session: { id: 'fixture-session', userId: 'provider-user-a', expiresAt: '2026-11-05T12:00:00.000Z' },
  user: { id: 'provider-user-a', email: 'fixture@example.test', emailVerified: true, name: 'Fixture', image: null },
});
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('verifies every operation against the managed service and forwards SDK token, not local cache or unrelated cookies', async () => {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const upstream: typeof fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    return response(fixture());
  };
  const first = await fetchVerifiedAuthSession(config, upstream, () => now);
  const second = await fetchVerifiedAuthSession(config, upstream, () => now);
  assert.equal(first?.id, 'provider-user-a');
  assert.equal(first?.emailVerified, true);
  assert.deepEqual(second, first);
  assert.equal(calls.length, 2, 'a successful first check must never authorize a second operation from local memory');
  for (const { url, init } of calls) {
    assert.equal(url.pathname, '/neondb/auth/get-session');
    assert.equal(url.searchParams.get('disableCookieCache'), 'true');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.redirect, 'error');
    const forwarded = new Headers(init?.headers);
    assert.equal(forwarded.get('Cookie'), '__Secure-neon-auth.session_token=server-token');
    assert.equal(forwarded.get('Origin'), config.origin);
    assert.equal(forwarded.get('x-neon-auth-proxy'), 'nextjs');
  }
});

test('a forged local snapshot alone cannot authenticate and does not trigger an upstream call', async () => {
  let calls = 0;
  const upstream: typeof fetch = async () => { calls++; return response(fixture()); };
  const value = await fetchVerifiedAuthSession({ ...config, cookie: '__Secure-neon-auth.local.session_data=forged' }, upstream, () => now);
  assert.equal(value, null);
  assert.equal(calls, 0);
});

test('revoked upstream session rejects even when a local snapshot is present', async () => {
  const upstream: typeof fetch = async () => response({ message: 'Unauthorized' }, 401);
  assert.equal(await fetchVerifiedAuthSession(config, upstream, () => now), null);
});

test('missing cookie, signed-out response, and expired provider sessions cannot authenticate', async () => {
  const expired = fixture();
  expired.session.expiresAt = '2026-11-03T12:00:00.000Z';
  assert.equal(await fetchVerifiedAuthSession({ ...config, cookie: null }, async () => { throw new Error('must not fetch'); }), null);
  assert.equal(await fetchVerifiedAuthSession(config, async () => response(null), () => now), null);
  assert.equal(await fetchVerifiedAuthSession(config, async () => response({ session: null, user: null }), () => now), null);
  assert.equal(await fetchVerifiedAuthSession(config, async () => response(expired), () => now), null);
});

test('a session tied to another user fails closed', async () => {
  const mismatch = fixture();
  mismatch.session.userId = 'provider-user-b';
  await assert.rejects(fetchVerifiedAuthSession(config, async () => response(mismatch), () => now), AuthenticationUnavailableError);
});

test('upstream network errors and malformed/failed responses never become successful sessions', async () => {
  await assert.rejects(fetchVerifiedAuthSession(config, async () => { throw new Error('DNS error'); }), AuthenticationUnavailableError);
  await assert.rejects(fetchVerifiedAuthSession(config, async () => response({}, 503)), AuthenticationUnavailableError);
  await assert.rejects(fetchVerifiedAuthSession(config, async () => new Response('not JSON')), AuthenticationUnavailableError);
  await assert.rejects(fetchVerifiedAuthSession(config, async () => response({ user: fixture().user })), AuthenticationUnavailableError);
  const malformed = fixture();
  malformed.session.expiresAt = 'not-a-date';
  await assert.rejects(fetchVerifiedAuthSession(config, async () => response(malformed), () => now), AuthenticationUnavailableError);
});

test('valid unverified login is distinct from verified email ownership', async () => {
  const unverified = fixture();
  unverified.user.emailVerified = false;
  const value = await fetchVerifiedAuthSession(config, async () => response(unverified), () => now);
  assert.equal(value?.id, 'provider-user-a');
  assert.equal(value?.emailVerified, false);
});
