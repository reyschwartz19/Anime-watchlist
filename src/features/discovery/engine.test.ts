import assert from 'node:assert/strict';
import test from 'node:test';
import { eligible, requestConstraints, validateRanking, type Candidate, type Eligibility } from './engine';

const anime: Candidate = { mal_id: 205, title: 'Samurai Champloo', synopsis: '', images: { jpg: { image_url: 'https://example.test/a.jpg', large_image_url: 'https://example.test/a.jpg' } }, episodes: 26, genres: [{ name: 'Action' }], relations: [] };
const context = (overrides: Partial<Eligibility> = {}): Eligibility => ({ mode: 'new', library: [], dismissedIds: [], sessionPassIds: [], constraints: {}, ...overrides });

test('every library status, permanent dismissal and session pass excludes a new pick', () => {
  for (const status of ['watching', 'completed', 'plan_to_watch', 'dropped']) assert.equal(eligible(anime, context({ library: [{ animeId: 205, status }] })), false);
  assert.equal(eligible(anime, context({ dismissedIds: [205] })), false);
  assert.equal(eligible(anime, context({ sessionPassIds: [205] })), false);
  assert.equal(eligible(anime, context()), true);
});

test('list mode accepts only eligible Plan to Watch IDs', () => {
  for (const status of ['watching', 'completed', 'dropped']) assert.equal(eligible(anime, context({ mode: 'list', library: [{ animeId: 205, status }] })), false);
  assert.equal(eligible(anime, context({ mode: 'list', library: [{ animeId: 205, status: 'plan_to_watch' }] })), true);
  assert.equal(eligible(anime, context({ mode: 'list' })), false);
});

test('hard constraints reject unknown episode counts and unwanted genres', () => {
  assert.equal(eligible(anime, context({ constraints: { maxEpisodes: 25 } })), false);
  assert.equal(eligible({ ...anime, episodes: null }, context({ constraints: { maxEpisodes: 30 } })), false);
  assert.equal(eligible(anime, context({ constraints: { excludedGenres: ['action'] } })), false);
  assert.equal(eligible(anime, context({ constraints: { genres: ['Fantasy'] } })), false);
  assert.equal(eligible(anime, context({ constraints: { genres: ['Action'], maxEpisodes: 26 } })), true);
});

test('known anime prequels require completion; manga sources are not viewing prerequisites', () => {
  const sequel = { ...anime, relations: [{ relation: 'Prequel', entry: [{ mal_id: 1, type: 'anime' }] }] };
  assert.equal(eligible(sequel, context()), false);
  assert.equal(eligible(sequel, context({ library: [{ animeId: 1, status: 'watching' }] })), false);
  assert.equal(eligible(sequel, context({ library: [{ animeId: 1, status: 'completed' }] })), true);
  assert.equal(eligible({ ...sequel, relations: [{ relation: 'Adaptation', entry: [{ mal_id: 1, type: 'manga' }] }] }, context()), true);
});

test('foreign and duplicate model IDs are removed without shifting reasons', () => {
  const other = { ...anime, mal_id: 457, title: 'Mushi-Shi' };
  const result = validateRanking({ picks: [{ animeId: 999, reason: 'invented' }, { animeId: 205, reason: 'first reason' }, { animeId: 205, reason: 'duplicate reason' }, { animeId: 457, reason: 'second reason' }] }, [anime, other]);
  assert.deepEqual(result.map((pick) => [pick.anime.mal_id, pick.reason]), [[205, 'first reason'], [457, 'second reason']]);
  assert.throws(() => validateRanking({ picks: [{ animeId: '205', reason: 'wrong type' }] }, [anime]));
});

test('explicit episode and exclusion wording becomes deterministic constraints', () => {
  assert.deepEqual(requestConstraints('Under 27 episodes, no horror, avoid romance', { maxEpisodes: 50, excludedGenres: ['Mecha'] }), { maxEpisodes: 26, excludedGenres: ['Mecha', 'Horror', 'Romance'] });
  assert.equal(requestConstraints('at most 100 episodes', { maxEpisodes: 12 }).maxEpisodes, 12);
});

test('standalone and format hard constraints remain deterministic', () => {
  const sequel = { ...anime, type: 'TV', relations: [{ relation: 'Prequel', entry: [{ mal_id: 1, type: 'anime' }] }] };
  assert.equal(eligible(sequel, context({ library: [{ animeId: 1, status: 'completed' }], constraints: { standaloneOnly: true } })), false);
  assert.equal(eligible({ ...anime, type: 'Movie' }, context({ constraints: { excludedTypes: ['Movie'] } })), false);
  assert.equal(eligible({ ...anime, type: null }, context({ constraints: { types: ['TV'] } })), false);
  assert.deepEqual(requestConstraints('standalone, no movies, only fantasy', {}), { excludedGenres: [], genres: ['Fantasy'], standaloneOnly: true, excludedTypes: ['Movie'] });
});
