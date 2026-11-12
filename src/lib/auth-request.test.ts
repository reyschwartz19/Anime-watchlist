import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthRequestError, authRequestIdentity, boundedAuthBody, validateAuthDestination, validateAuthDestinations } from './auth-request';

test('auth callbacks must stay on the exact app origin', () => {
  const origin = 'https://preview.example.test';
  for (const value of ['/auth/callback?returnTo=%2Fsearch', `${origin}/auth/reset-password`, undefined]) assert.doesNotThrow(() => validateAuthDestination(value, origin));
  for (const value of ['https://evil.test', '//evil.test', 'https://preview.example.test.evil.test', '/\\evil.test', 'javascript:alert(1)', 123, 'https://user:secret@preview.example.test/path']) assert.throws(() => validateAuthDestination(value, origin), AuthRequestError);
  assert.throws(() => validateAuthDestinations({ newUserCallbackURL: 'https://evil.test' }, origin), /must stay/);
});

test('auth bodies enforce a byte cap even without Content-Length', async () => {
  const request = (body: string, headers?: Record<string, string>) => new Request('https://app.test/api/auth/sign-in/email', { method: 'POST', body, headers });
  assert.equal(await boundedAuthBody(request('{"email":"a@example.test"}')), '{"email":"a@example.test"}');
  await assert.rejects(boundedAuthBody(request('é'.repeat(9000))), (problem: unknown) => problem instanceof AuthRequestError && problem.status === 413);
  await assert.rejects(boundedAuthBody(request('{}', { 'content-length': '999999' })), (problem: unknown) => problem instanceof AuthRequestError && problem.status === 413);
});

test('untrusted forwarding headers cannot mint new local auth budget identities', () => {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.1, 198.51.100.1' });
  assert.equal(authRequestIdentity(headers, false), 'shared-untrusted-proxy');
  assert.equal(authRequestIdentity(headers, true), '203.0.113.1');
  assert.equal(authRequestIdentity(new Headers({ 'x-forwarded-for': 'garbage' }), true), 'shared-untrusted-proxy');
});
