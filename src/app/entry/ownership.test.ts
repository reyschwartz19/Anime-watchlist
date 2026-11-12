import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

let user: { id: string; email: string; emailVerified: boolean; onboarded: boolean } | null = null;
let failed = false;
mock.module('../../lib/current-user.ts', { namedExports: { getCurrentUser: async () => {
  if (failed) throw new Error('Profile temporarily unavailable');
  return user;
} } });
const { default: HomePage } = await import('../page');

test('root renders only a public handoff to server-verified sign-in, verification, onboarding or Discover', async () => {
  const identity = { id: 'internal', email: 'test@example.test', emailVerified: true, onboarded: true };
  for (const [profile, expected] of [
    [null, '/auth/sign-in'],
    [{ ...identity, emailVerified: false }, '/auth/verify-email?'],
    [{ ...identity, onboarded: false }, '/onboarding'],
    [identity, '/recommendations'],
  ] as const) {
    user = profile;
    const html = renderToStaticMarkup(await HomePage());
    assert.ok(html.includes(`href="${expected}`), html);
    assert.doesNotMatch(html, /href="\/library"|test@example.test<|Navigation/);
  }
  failed = true;
  await assert.rejects(HomePage(), /Profile temporarily unavailable/);
});
