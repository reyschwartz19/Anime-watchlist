import assert from 'node:assert/strict';
import test from 'node:test';
import { oauthErrorMessage, parseResolvedProfile, resolvedDestination, resolveSession } from '../src/features/auth/session-resolution';
import { parseFavorite, serializeFavorite } from '../src/features/library/favorites';

const profile = { internalUserId: 'user-a', email: 'viewer@example.test', emailVerified: true, onboarded: true };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test('verified server profile sends onboarded users to Discover and incomplete users to onboarding', () => {
  assert.equal(resolvedDestination(profile, undefined), '/recommendations');
  assert.equal(resolvedDestination(profile, '/'), '/recommendations');
  assert.equal(resolvedDestination(profile, '/onboarding?step=2'), '/recommendations');
  assert.equal(resolvedDestination(profile, '/library'), '/library');
  assert.equal(resolvedDestination(profile, '/search?q=Frieren'), '/search?q=Frieren');
  assert.equal(resolvedDestination({ ...profile, onboarded: false }, '/search'), '/onboarding');
  assert.equal(resolvedDestination(profile, '//evil.test'), '/recommendations');
});

test('unverified server identity resumes verification with its authoritative address', () => {
  const destination = new URL(resolvedDestination({ ...profile, emailVerified: false }, '/recommendations'), 'https://local.test');
  assert.equal(destination.pathname, '/auth/verify-email');
  assert.equal(destination.searchParams.get('email'), profile.email);
});

test('a profile failure, malformed response or network error never becomes a new user', async () => {
  for (const [body, status] of [[{}, 503], [{ error: 'profile unavailable' }, 200], [{ ...profile, onboarded: undefined }, 200]] as const) {
    await assert.rejects(resolveSession('/library', async () => response(body, status)));
  }
  await assert.rejects(resolveSession('/library', async () => { throw new Error('offline'); }));
  assert.throws(() => parseResolvedProfile({ ...profile, onboarded: 'false' }));
});

test('session resolution uses the server and only a 401 becomes signed-out', async () => {
  let options: RequestInit | undefined;
  const result = await resolveSession('/recommendations', async (input, init) => {
    assert.equal(input, '/api/me'); options = init; return response(profile);
  });
  assert.deepEqual(result, { kind: 'authenticated', destination: '/recommendations' });
  assert.equal(options?.cache, 'no-store');
  assert.equal(options?.credentials, 'same-origin');
  assert.deepEqual(await resolveSession('/library', async () => response({}, 401)), { kind: 'signed-out' });
  await assert.rejects(resolveSession('/library', async () => response({}, 403)));
});

test('Google cancellation has its own recovery while provider failures remain distinct', () => {
  assert.match(oauthErrorMessage('access_denied'), /cancelled/);
  assert.match(oauthErrorMessage('provider_error'), /could not complete/);
});

test('stable favorite IDs distinguish seasons and preserve legacy title strings', () => {
  assert.deepEqual(parseFavorite('Mushi-Shi'), { animeId: null, title: 'Mushi-Shi' });
  assert.deepEqual(parseFavorite(serializeFavorite(457, 'Mushi-Shi')), { animeId: 457, title: 'Mushi-Shi' });
  assert.notEqual(serializeFavorite(457, 'Mushi-Shi'), serializeFavorite(21939, 'Mushi-Shi'));
  assert.deepEqual(parseFavorite('mal:99999999999999|Invalid'), { animeId: null, title: 'mal:99999999999999|Invalid' });
});
