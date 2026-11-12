import assert from 'node:assert/strict';
import test from 'node:test';
import { prioritizeCandidates } from './taste';
import type { Candidate } from './engine';
const anime = (mal_id: number, synopsis: string, genre = 'Drama'): Candidate => ({ mal_id, title: `Title ${mal_id}`, synopsis, genres: [{ name: genre }], images: { jpg: { image_url: null } } });
test('explicit viewing notes surface relevant choreography and penalize unwanted filler', () => {
  const candidates = [anime(1, 'A filler-heavy comic adventure'), anime(2, 'Expressive swordfight choreography and intimate character writing'), anime(3, 'A family romance')];
  const result = prioritizeCandidates(candidates, [], [{ animeId: 99, value: 'like', reason: null, likedAspects: 'swordfight choreography', dislikedAspects: 'filler-heavy', visualStyle: 'expressive animation' }], '', 3);
  assert.equal(result[0].mal_id, 2); assert.notEqual(result[1].mal_id, 1);
});
test('reasonless dismissal and Dropped status do not blacklist genres', () => {
  const candidates = [anime(1, 'A fantasy journey', 'Fantasy'), anime(2, 'A school romance', 'Romance')];
  const baseline = prioritizeCandidates(candidates, [], [], '', 2).map(item => item.mal_id);
  const result = prioritizeCandidates(candidates, [{ animeId: 99, status: 'dropped', anime: candidates[0] }], [{ animeId: 99, value: null, reason: null, dismissal: 'strong_dismiss', dismissalReason: null }], '', 2).map(item => item.mal_id);
  assert.deepEqual(result, baseline);
});
test('marginal relevance keeps a near duplicate from occupying the next slot', () => {
  const result = prioritizeCandidates([anime(1, 'swordfight samurai adventure'), anime(2, 'swordfight samurai adventure'), anime(3, 'swordfight quiet mystery')], [], [], 'swordfight', 3);
  assert.deepEqual(result.map(item => item.mal_id), [1, 3, 2]);
});
