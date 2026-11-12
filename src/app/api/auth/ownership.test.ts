import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';
import { NextRequest } from 'next/server';
import { AuthRateLimitUnavailableError } from '../../../lib/operational-error';

let configured = true;
let providerCalls = 0;
let limitCalls = 0;
let limited = false;
let unavailable = false;
let upstreamStatus = 200;
let receivedBody = '';
class TestLimitError extends Error { retryAfterSeconds = 17; }
mock.module('../../../lib/auth.ts', { namedExports: {
  isAuthConfigured: () => configured,
  getAuth: () => ({ handler: () => Object.fromEntries(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(method => [method, async (request: NextRequest) => {
    providerCalls++;
    if (method !== 'GET') receivedBody = await request.text();
    return Response.json(upstreamStatus === 200 ? { ok: true } : { code: 'INVALID_OTP', message: 'upstream-private-diagnostic' }, { status: upstreamStatus, headers: { 'Set-Cookie': 'neon-auth.session_token=changed; HttpOnly; SameSite=Lax' } });
  }])) }),
} });
mock.module('../../../lib/rate-limit.ts', { namedExports: {
  RateLimitError: TestLimitError,
  enforceAuthLimit: async () => { limitCalls++; if (unavailable) throw new AuthRateLimitUnavailableError({ code: 'P1000' }); if (limited) throw new TestLimitError('Please try again in 17 seconds.'); },
} });
const { GET, POST } = await import('./[...path]/route');
const context = () => ({ params: Promise.resolve({ path: ['sign-in', 'email'] }) });
const request = (body = '{}', origin = 'https://app.example.test', headers: Record<string, string> = {}) => new NextRequest('https://app.example.test/api/auth/sign-in/email', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body });

beforeEach(() => {
  process.env.APP_URL = 'https://app.example.test';
  configured = true; providerCalls = 0; limitCalls = 0; limited = false; unavailable = false; upstreamStatus = 200; receivedBody = '';
});

test('auth writes reject a forged origin before calling budgets or provider', async () => {
  assert.equal((await POST(request('{}', 'https://evil.test'), context())).status, 403);
  assert.equal(providerCalls, 0); assert.equal(limitCalls, 0);
});

test('auth writes cannot send users or recovery tokens to another origin', async () => {
  const response = await POST(request(JSON.stringify({ callbackURL: 'https://evil.test/steal' })), context());
  assert.equal(response.status, 400); assert.equal(providerCalls, 0);
});

test('auth writes enforce payload caps and JSON shape before provider calls', async () => {
  assert.equal((await POST(request('x'.repeat(16_385)), context())).status, 413);
  assert.equal((await POST(request('[1,2,3]'), context())).status, 400);
  assert.equal((await POST(request('{}', undefined, { 'Content-Type': 'text/plain' }), context())).status, 415);
  assert.equal(providerCalls, 0);
});

test('successful guarded auth requests preserve their body and session cookies', async () => {
  const body = JSON.stringify({ email: 'fixture@example.invalid', password: 'not-a-real-secret', callbackURL: '/auth/callback' });
  const response = await POST(request(body), context());
  assert.equal(response.status, 200); assert.equal(receivedBody, body);
  assert.match(response.headers.get('set-cookie') ?? '', /session_token=changed/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('auth provider diagnostics are sanitized while recovery codes survive', async () => {
  upstreamStatus = 400;
  const response = await POST(request(), context());
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'INVALID_OTP');
  assert.doesNotMatch(JSON.stringify(body), /upstream-private-diagnostic/);
  upstreamStatus = 500;
  assert.equal((await POST(request(), context())).status, 503);
});

test('shared auth rejections return useful Retry-After and never call provider', async () => {
  limited = true;
  const response = await POST(request(), context());
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '17');
  assert.equal(providerCalls, 0);
});

test('unconfigured auth and malformed paths are contained without contacting provider', async () => {
  configured = false;
  assert.equal((await GET(new NextRequest('https://app.example.test/api/auth/get-session'), context())).status, 503);
  configured = true;
  assert.equal((await GET(new NextRequest('https://app.example.test/api/auth/get-session'), { params: Promise.resolve({ path: ['..', 'bad'] }) })).status, 400);
  assert.equal(providerCalls, 0);
});

test('database failure in auth protection returns an operational 503 and never calls the provider', async () => {
  unavailable = true;
  const response = await POST(request(), context());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'AUTH_RATE_LIMIT_UNAVAILABLE');
  assert.equal(providerCalls, 0);
});

test('Google initiation retains all canonical callbacks and challenge/session cookies', async () => {
  const callbacks = { provider: 'google', callbackURL: 'https://app.example.test/auth/callback?returnTo=%2Fsearch', newUserCallbackURL: '/auth/callback', errorCallbackURL: '/auth/sign-in' };
  const response = await POST(request(JSON.stringify(callbacks)), { params: Promise.resolve({ path: ['sign-in', 'social'] }) });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(receivedBody), callbacks);
  assert.match(response.headers.get('set-cookie') ?? '', /session_token=changed/);
});

test('deployment-specific auth API requests cannot mint cookies or forward callbacks off the canonical app', async () => {
  const write = new NextRequest('https://deployment-team.vercel.app/api/auth/sign-in/social', { method: 'POST', headers: { Origin: 'https://deployment-team.vercel.app', 'Content-Type': 'application/json' }, body: '{}' });
  const response = await POST(write, context());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'CANONICAL_ORIGIN_REQUIRED');
  assert.equal(providerCalls, 0); assert.equal(limitCalls, 0);
});

test('GET verification callbacks validate every redirect occurrence before forwarding', async () => {
  const response = await GET(new NextRequest('https://app.example.test/api/auth/verify-email?callbackURL=https%3A%2F%2Fevil.test&callbackURL=%2Fauth%2Fcallback'), { params: Promise.resolve({ path: ['verify-email'] }) });
  assert.equal(response.status, 400);
  assert.equal(providerCalls, 0);
  const valid = await GET(new NextRequest('https://app.example.test/api/auth/verify-email?callbackURL=%2Fauth%2Fcallback'), { params: Promise.resolve({ path: ['verify-email'] }) });
  assert.equal(valid.status, 200);
  assert.match(valid.headers.get('set-cookie') ?? '', /session_token=changed/);
});
