import assert from 'node:assert/strict';
import test from 'node:test';
import { authViewHref, safeAuthDestination } from '../src/features/auth/destination';

test('keeps intended private search path and query through all auth view links', () => {
  const intended = '/search?q=cowboy%20bebop&page=2';
  assert.equal(safeAuthDestination(intended), intended);
  for (const view of ['sign-in', 'sign-up', 'forgot-password', 'reset-password', 'verify-email']) {
    const href = new URL(authViewHref(view, intended, 'fixture@example.test'), 'https://preview.example.test');
    assert.equal(href.pathname, `/auth/${view}`);
    assert.equal(href.searchParams.get('returnTo'), intended);
    assert.equal(href.searchParams.get('email'), 'fixture@example.test');
  }
});

test('auth destination rejects external origins, unknown paths, protocol-relative and backslash redirects', () => {
  for (const unsafe of ['https://evil.test/library', '//evil.test/library', '/\\evil.test/library', '/auth/sign-in', '/api/me', '/unknown', 'javascript:alert(1)', ['/', '/profile'], null, undefined]) {
    assert.equal(safeAuthDestination(unsafe), '/library');
  }
});

test('permits known old entry paths without treating fragments as a destination', () => {
  for (const path of ['/', '/profile', '/onboarding', '/recommendations', '/library']) assert.equal(safeAuthDestination(path), path);
  assert.equal(safeAuthDestination('/search?q=anime#ignored'), '/search?q=anime');
});

test('preserves numeric details deep links through auth but rejects unrelated nested paths', () => {
  assert.equal(safeAuthDestination('/anime/205?from=%2Fsearch%3Fq%3DSamurai'), '/anime/205?from=%2Fsearch%3Fq%3DSamurai');
  for (const value of ['/anime/foo', '/anime/0', '/anime/205/edit', '/anime/9999999999999']) assert.equal(safeAuthDestination(value), '/library');
});
