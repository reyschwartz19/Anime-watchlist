import assert from 'node:assert/strict';
import test from 'node:test';
import { diverseCandidates, eligible, mergeCandidateSources, requestConstraints, validateRanking, type Candidate, type Eligibility } from './engine';

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

test('finished series maximum 13 episodes requires both known finished status and a known count', () => {
  const constraints = requestConstraints('finished series, maximum 13 episodes', {});
  assert.equal(constraints.finishedOnly, true); assert.equal(constraints.maxEpisodes, 13);
  assert.equal(eligible({ ...anime, episodes: 13, status: 'Finished Airing' }, context({ constraints })), true);
  for (const candidate of [{ ...anime, episodes: null, status: 'Finished Airing' }, { ...anime, episodes: 12, status: null }, { ...anime, episodes: 12, status: 'Currently Airing' }]) {
    assert.equal(eligible(candidate, context({ constraints })), false);
  }
});

test('whole-library exclusions include old watched records beyond a compact recent taste summary', () => {
  const library = Array.from({ length: 200 }, (_, index) => ({ animeId: 1000 + index, status: 'completed' }));
  library.push({ animeId: anime.mal_id, status: 'completed' });
  assert.equal(eligible(anime, context({ library })), false);
});

test('round-robin sources preserve varied origins and deduplicate stable MAL IDs', () => {
  const record = (id: number) => ({ ...anime, mal_id: id });
  assert.deepEqual(mergeCandidateSources([[record(1), record(2)], [record(3), record(1)], [record(4), record(5)]]).map(value => value.mal_id), [1, 3, 4, 2, 5]);
});

test('known transitive franchise relations cap a candidate family without merging different seasons by title', () => {
  const record = (id: number, parent?: number): Candidate => ({ ...anime, mal_id: id, title: 'Same romanized name', relations: parent ? [{ relation: 'Prequel', entry: [{ mal_id: parent, type: 'anime' }] }] : [] });
  assert.deepEqual(diverseCandidates([record(1), record(2, 1), record(3, 2), record(4), record(4)]).map(value => value.mal_id), [1, 2, 4]);
});
