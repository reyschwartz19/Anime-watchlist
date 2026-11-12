import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroqRanker, GROQ_COMPLETIONS_URL, prepareRanking, type RankingContext } from './groq-client';
import { ProviderError } from './provider-error';

const context = (): RankingContext => ({
  candidates: [205, 457, 5114].map(mal_id => ({ mal_id, title: `Anime ${mal_id}`, synopsis: 'A verified synopsis.',
    images: { jpg: { image_url: null, large_image_url: null } }, genres: [{ name: 'Adventure' }], episodes: 12,
    status: 'Finished Airing', relations: [], relationsVerified: true,
  })), mode: 'new', request: 'Quiet adventure tonight', constraints: {}, interests: ['Adventure'], favorites: [], feedback: [],
});

test('Groq payload explicitly uses strict JSON Schema, supplied candidate enums, capped non-streaming completion and whitelisted taste', () => {
  const input = { ...context(), email: 'secret@example.test', token: 'private-token', libraryTaste: [
    { animeId: 1, title: 'Watched title', status: 'completed' }, { animeId: 2, title: 'Dropped title', status: 'dropped' },
  ] };
  const prepared = prepareRanking(input);
  assert.equal(prepared.body.model, 'openai/gpt-oss-120b'); assert.equal(prepared.body.stream, false);
  assert.equal(prepared.body.response_format.type, 'json_schema'); assert.equal(prepared.body.response_format.json_schema.strict, true);
  assert.deepEqual(prepared.body.response_format.json_schema.schema.properties.picks.items.properties.animeId.enum, [205, 457, 5114]);
  assert.ok(prepared.reservedTokens <= 8000); assert.equal(prepared.body.max_completion_tokens, 1200);
  assert.equal(prepared.serialized.includes('secret@example.test'), false); assert.equal(prepared.serialized.includes('private-token'), false);
  assert.ok(prepared.serialized.includes('completed')); assert.ok(prepared.serialized.includes('dropped'));
});

test('large candidate and taste pools stay within conservative free-plan input/output token reservation', () => {
  const input = context();
  input.candidates = Array.from({ length: 100 }, (_, index) => ({ ...input.candidates[0], mal_id: index + 1, synopsis: 'long synopsis '.repeat(1000) }));
  input.feedback = Array.from({ length: 100 }, (_, index) => ({ animeId: index + 1, value: 'like', title: 'A title', reason: 'specific preference '.repeat(100), dismissal: null, dismissalReason: null }));
  const prepared = prepareRanking(input);
  assert.ok(prepared.reservedTokens <= 8000); assert.ok(prepared.candidates.length <= 12); assert.ok(prepared.candidates.length >= 3);
});

test('one Groq request validates ID/reason alignment, drops foreign and duplicate IDs, and observes headers', async () => {
  let calls = 0; let releases = 0; const observed: number[] = [];
  const rank = createGroqRanker({ apiKey: () => 'test-key', reserve: async tokens => { assert.ok(tokens <= 8000); return async () => { releases++; }; },
    observe: async (_headers, status) => { observed.push(status); },
    fetch: async (url, options) => {
      calls++; assert.equal(url, GROQ_COMPLETIONS_URL); assert.equal(options?.cache, 'no-store');
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ picks: [
        { animeId: 999, reason: 'foreign' }, { animeId: 205, reason: 'reason one' }, { animeId: 205, reason: 'duplicate' }, { animeId: 457, reason: 'reason two' },
      ] }) } }] });
    },
  });
  assert.deepEqual((await rank(context())).map(pick => [pick.anime.mal_id, pick.reason]), [[205, 'reason one'], [457, 'reason two']]);
  assert.equal(calls, 1); assert.equal(releases, 1); assert.deepEqual(observed, [200]);
});

test('missing key leaves useful unavailability without any network request', async () => {
  const rank = createGroqRanker({ apiKey: () => undefined, fetch: async () => { throw new Error('must not call'); } });
  await assert.rejects(rank(context()), (error: unknown) => error instanceof ProviderError && error.code === 'unconfigured' && error.message.includes('search'));
});

test('a full deck requests five picks, includes viewing notes, and settles known token usage', async () => {
  const input = context();
  input.candidates = Array.from({ length: 5 }, (_, index) => ({ ...input.candidates[0], mal_id: index + 1 }));
  input.feedback = [{ animeId: 99, value: 'like', reason: 'Jazz', title: 'A watched title', dismissal: null, dismissalReason: null, likedAspects: 'Character writing', dislikedAspects: 'Filler', visualStyle: 'Painted backgrounds' }];
  const prepared = prepareRanking(input);
  assert.equal(prepared.body.response_format.json_schema.schema.properties.picks.minItems, 5);
  assert.equal(prepared.body.response_format.json_schema.schema.properties.picks.maxItems, 5);
  assert.match(prepared.serialized, /Painted backgrounds/);
  assert.ok(prepared.reservedTokens < Buffer.byteLength(prepared.serialized) + 1200, 'bytes are not tokens');
  let settled = 0;
  const rank = createGroqRanker({ apiKey: () => 'fixture-key', reserve: async () => Object.assign(async () => {}, { settle: async (tokens: number) => { settled = tokens; } }), fetch: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ picks: input.candidates.map(anime => ({ animeId: anime.mal_id, reason: 'A specific fit.' })) }) } }], usage: { total_tokens: 817 } }) });
  assert.equal((await rank(input)).length, 5); assert.equal(settled, 817);
});

test('429s, timeouts, malformed/incomplete model output never replay ambiguous inference or expose upstream text', async () => {
  const responses = [
    async () => new Response('secret upstream', { status: 429, headers: { 'retry-after': '8' } }),
    async () => { throw new DOMException('secret upstream', 'TimeoutError'); },
    async () => Response.json({ choices: [{ message: { content: '{invalid' } }] }),
    async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"picks":[]}' } }] }),
  ];
  for (const [index, fetcher] of responses.entries()) {
    let calls = 0;
    const rank = createGroqRanker({ apiKey: () => 'test-key', fetch: async () => { calls++; return fetcher(); } });
    await assert.rejects(rank(context()), (error: unknown) => error instanceof ProviderError && !error.message.includes('secret') && (index !== 0 || error.retryAfterSeconds === 8));
    assert.equal(calls, 1);
  }
});
