import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLegacyHash } from './legacy-links';

test('old hash entry points resolve to their App Router equivalents', () => {
  const paths = new Map([
    ['#/', '/library'], ['#/auth', '/auth'], ['#/onboarding', '/onboarding'],
    ['#/search', '/search'], ['#/recommendations', '/recommendations'], ['#/profile', '/profile'],
  ]);
  for (const [oldPath, destination] of paths) assert.equal(resolveLegacyHash(oldPath), destination);
});

test('legacy search and status query values survive the hash handoff', () => {
  assert.equal(resolveLegacyHash('#/search?q=Mushi-Shi&source=bookmark'), '/search?q=Mushi-Shi&source=bookmark');
  assert.equal(resolveLegacyHash('#/?status=dropped'), '/library?status=dropped');
  assert.equal(resolveLegacyHash('#/profile/'), '/profile');
});

test('legacy fragment handling cannot send a browser to a foreign origin', () => {
  for (const input of ['', '#chapter', '#https://evil.test', '#//evil.test/path', '#/\\evil.test/path']) {
    const result = resolveLegacyHash(input);
    assert.ok(result === null || result === '/library', `${input} resolved unexpectedly: ${result}`);
  }
  assert.equal(resolveLegacyHash('#/unknown'), '/library');
});
