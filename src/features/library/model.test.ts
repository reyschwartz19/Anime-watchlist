import assert from 'node:assert/strict';
import test from 'node:test';
import { animeSchema, feedbackInput, profileInput, saveLibraryInput, STATUSES, toAnimeView } from './model';

test('all four stored library statuses remain valid; ownership cannot be supplied', () => {
  assert.deepEqual(new Set(STATUSES), new Set(['watching', 'completed', 'plan_to_watch', 'dropped']));
  for (const status of STATUSES) assert.equal(saveLibraryInput.safeParse({ animeId: 457, status }).success, true);
  assert.equal(saveLibraryInput.safeParse({ animeId: 457, status: 'watching', userId: 'someone-else' }).success, false);
  assert.equal(saveLibraryInput.safeParse({ animeId: 457, status: 'watching', authProviderId: 'someone-else' }).success, false);
  assert.equal(saveLibraryInput.safeParse({ animeId: 457, status: 'finished' }).success, false);
  assert.equal(saveLibraryInput.safeParse({ animeId: -1, status: 'watching' }).success, false);
});

test('feedback and profile mutations reject ownership and invalid URL payloads', () => {
  assert.equal(feedbackInput.safeParse({ animeId: 457, value: 'like', userId: 'forged' }).success, false);
  assert.equal(feedbackInput.safeParse({ animeId: 457, value: null }).success, true);
  const profile = { displayName: 'Viewer', photoURL: null, interests: ['Fantasy'], favoriteAnimes: ['Mushi-Shi'], completeOnboarding: true };
  assert.equal(profileInput.safeParse(profile).success, true);
  assert.equal(profileInput.safeParse({ ...profile, uid: 'forged' }).success, false);
  assert.equal(profileInput.safeParse({ ...profile, photoURL: 'javascript:alert(1)' }).success, false);
});

test('old malformed anime displays safely without changing its original stored fields', () => {
  const raw = { title: '', progress: 7, unexpected: { kept: true }, images: { jpg: { image_url: 'javascript:alert(1)' } } };
  const before = structuredClone(raw);
  assert.deepEqual(toAnimeView(raw, 457), { mal_id: 457, title: 'Anime #457', imageUrl: null, synopsis: '', year: null, type: null, episodes: null, genres: [] });
  assert.deepEqual(raw, before);
  assert.deepEqual(toAnimeView(null, 42), { mal_id: 42, title: 'Anime #42', imageUrl: null, synopsis: '', year: null, type: null, episodes: null, genres: [] });
});

test('catalog records with an unavailable synopsis remain searchable', () => {
  const parsed = animeSchema.parse({ mal_id: 457, title: 'Mushi-Shi', images: { jpg: { image_url: 'https://example.test/a.jpg', large_image_url: 'https://example.test/a.jpg' } }, synopsis: null, genres: null });
  assert.equal(parsed.synopsis, '');
  assert.deepEqual(parsed.genres, []);
});
