import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

let configured = true;
let fixture = false;
let called = 0;
let received: NextRequest | undefined;
let emailVerified = true;
let profileFailure = false;
let sessionChecks = 0;
let signedOut = false;
mock.module('../../lib/auth.ts', { namedExports: {
  getVerifiedAuthSession: async () => { sessionChecks++; return signedOut ? null : { id: 'auth-user-a', email: 'viewer@example.test', emailVerified, name: 'Viewer', image: null }; },
  isAuthConfigured: () => configured,
  getAuth: () => ({ middleware: (options: { loginUrl: string; publicRoutes: string[] }) => async (request: NextRequest) => {
    called++;
    received = request;
    assert.equal(options.loginUrl, '/auth/sign-in');
    assert.ok(options.publicRoutes.includes('/auth/callback'));
    const response = NextResponse.redirect('https://app.example.test/auth/callback');
    response.headers.append('Set-Cookie', 'neon-auth.session_token=exchanged; HttpOnly; SameSite=Lax');
    return response;
  } }),
} });
mock.module('../../lib/preview.ts', { namedExports: { previewEnabled: () => fixture, previewFailure: () => null } });
mock.module('server-only', { namedExports: {} });
mock.module('next/headers', { namedExports: { headers: async () => new Headers({ 'x-anime-path': '/anime/205?from=%2Fsearch' }) } });
mock.module('next/navigation', { namedExports: { redirect: (path: string) => { throw new Error(`Redirect:${path}`); } } });
mock.module('../../lib/db.ts', { namedExports: { getDb: () => ({ appUser: { upsert: async () => {
  if (profileFailure) throw new Error('Profile unavailable');
  return { id: 'user-a', authProviderId: 'auth-user-a', email: 'viewer@example.test', onboarded: true };
} } }) } });
const { proxy, config } = await import('../../proxy');
const { requireUser } = await import('../../lib/current-user');

test('OAuth callback matcher reaches SDK exchange and preserves its session cookie response', async () => {
  const result = await proxy(new NextRequest('https://app.example.test/auth/callback?neon_auth_session_verifier=test-verifier', { headers: { Cookie: '__Secure-neon-auth.session_challenge=challenge' } }));
  assert.equal(called, 1);
  assert.equal(received?.headers.get('cookie'), '__Secure-neon-auth.session_challenge=challenge');
  assert.equal(received?.headers.get('x-anime-path'), '/auth/callback?neon_auth_session_verifier=test-verifier');
  assert.match(result.headers.get('set-cookie') ?? '', /session_token=exchanged/);
  assert.equal(result.status, 307);
  assert.ok(config.matcher.includes('/auth/:path*'));
});

test('ordinary private requests retain navigation context and rely on server ownership checks', async () => {
  const before = called;
  const result = await proxy(new NextRequest('https://app.example.test/search?q=samurai'));
  assert.equal(called, before);
  assert.equal(result.headers.get('x-middleware-request-x-anime-path'), '/search?q=samurai');
});

test('fixtures and unconfigured auth never contact the live SDK', async () => {
  const before = called;
  fixture = true;
  await proxy(new NextRequest('https://app.example.test/auth/callback'));
  fixture = false; configured = false;
  await proxy(new NextRequest('https://app.example.test/auth/callback'));
  assert.equal(called, before);
  fixture = false;
});

test('private operations require verified email without repeating the authoritative session read', async () => {
  const before = sessionChecks;
  emailVerified = false;
  await assert.rejects(requireUser(), /Redirect:\/auth\/verify-email\?.*email=viewer%40example.test/);
  assert.equal(sessionChecks, before + 1);
  emailVerified = true;
  assert.equal((await requireUser()).id, 'user-a');
});

test('failed profile lookup propagates instead of returning an incomplete/new profile', async () => {
  profileFailure = true;
  await assert.rejects(requireUser(), /profile is temporarily unavailable/);
  profileFailure = false;
});

test('missing or expired sessions redirect directly to sign-in with a safe private return path', async () => {
  signedOut = true;
  await assert.rejects(requireUser(), /Redirect:\/auth\/sign-in\?returnTo=%2Fanime%2F205/);
  signedOut = false;
});

test('Preview browser pages hand off from only the exact deployment host and stop at the stable origin', async () => {
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'deployment-team.vercel.app';
  process.env.APP_URL = 'https://branch-team.vercel.app';
  const response = await proxy(new NextRequest('https://deployment-team.vercel.app/auth/sign-in?returnTo=%2Fsearch'));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://branch-team.vercel.app/auth/sign-in?returnTo=%2Fsearch');
  const stable = await proxy(new NextRequest(response.headers.get('location')!));
  assert.equal(stable.headers.get('location'), null);
  const verifier = await proxy(new NextRequest('https://deployment-team.vercel.app/auth/callback?neon_auth_session_verifier=private'));
  assert.doesNotMatch(verifier.headers.get('location')!, /private|neon_auth_session_verifier/);
  assert.match(verifier.headers.get('location')!, /restart_on_canonical_origin/);
  process.env.VERCEL_ENV = 'production';
  const production = await proxy(new NextRequest('https://deployment-team.vercel.app/auth/sign-in'));
  assert.equal(production.headers.get('location'), null);
  delete process.env.VERCEL_ENV; delete process.env.VERCEL_URL;
});
