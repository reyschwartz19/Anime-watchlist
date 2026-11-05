import assert from 'node:assert/strict';
import test, { beforeEach, mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createFixtureDatabase } from '../../lib/fixture-db';
import { fixtureCatalog } from '../../lib/preview';
import type { Candidate } from './engine';

process.env.ANIME_PREVIEW_FIXTURES = '1';
Object.assign(process.env, { NODE_ENV: 'test' });
let db: ReturnType<typeof createFixtureDatabase>;
let viewer = 'fixture-viewer';
let failure: 'model' | 'catalog' | null = null;
let rankingCalls = 0;
let duringRanking: (() => Promise<void>) | null = null;
class ProviderError extends Error { constructor(public kind: 'catalog' | 'model', message: string) { super(message); } }
mock.module('next/cache', { namedExports: { revalidatePath() {} } });
mock.module('../../lib/current-user.ts', { namedExports: {
  async requireUser() {
    const user = await db.appUser.findFirst({ where: { authProviderId: viewer } });
    if (!user) throw new Error('Unauthenticated');
    return user;
  },
} });
mock.module('../../lib/db.ts', { namedExports: { getDb: () => db } });
mock.module('../../lib/rate-limit.ts', { namedExports: {
  async enforceUserLimit() {},
  async acquireGenerationLease() { return { async release() {} }; },
  RateLimitError: class RateLimitError extends Error {},
} });
mock.module('../../lib/providers.ts', { namedExports: {
  ProviderError,
  async retrieveCandidates() { if (failure === 'catalog') throw new ProviderError('catalog', 'Catalog fixture failure'); return fixtureCatalog().map((anime) => ({ ...anime, relationsVerified: true })); },
  async verifyCandidates(values: Candidate[]) { return values; },
  async rankCandidates({ candidates }: { candidates: Candidate[] }) {
    rankingCalls++;
    if (failure === 'model') throw new ProviderError('model', 'Model fixture failure');
    await duringRanking?.();
    return candidates.slice(0, 3).map((anime) => ({ anime, reason: `Reason for ${anime.mal_id}` }));
  },
} });
const { generateRecommendations } = await import('./actions');
const { actOnRecommendation, undoRecommendation, restoreHiddenTitle, getHiddenTitles, setFeedback } = await import('../feedback/actions');
const request = (extra: object = {}) => ({ mode: 'new', request: '', sessionPassIds: [], requestId: randomUUID(), ...extra });

beforeEach(() => { db = createFixtureDatabase(); viewer = 'fixture-viewer'; failure = null; rankingCalls = 0; duringRanking = null; });

test('new mode excludes the whole library, and cached batches recheck durable dismissal', async () => {
  const input = request();
  const first = await generateRecommendations(input);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const existing = new Set((await db.libraryEntry.findMany({ where: { userId: '00000000-0000-4000-8000-000000000001' } })).map((entry) => entry.animeId));
  assert.equal(first.recommendations.some((pick) => existing.has(pick.anime.mal_id)), false);
  const id = first.recommendations[0].anime.mal_id;
  const action = await actOnRecommendation({ requestId: input.requestId, animeId: id, action: 'strong_dismiss', operationId: randomUUID() });
  assert.equal(action.ok, true);
  const hidden = await getHiddenTitles();
  assert.equal(hidden[0].animeId, id);
  assert.equal(hidden[0].reason, null);
  assert.equal((await db.feedback.findFirst({ where: { animeId: id } }))?.value, null);
  const cached = await generateRecommendations(input);
  assert.equal(cached.ok, true);
  if (cached.ok) assert.equal(cached.recommendations.some((pick) => pick.anime.mal_id === id), false);
  assert.equal(rankingCalls, 1);
  assert.equal((await restoreHiddenTitle({ animeId: id })).ok, true);
  const restored = await generateRecommendations(input);
  if (restored.ok) assert.equal(restored.recommendations.some((pick) => pick.anime.mal_id === id), true);
});

test('session passes, strict list membership and changed request retry are checked server-side', async () => {
  const input = request({ mode: 'list', sessionPassIds: [5114] });
  const result = await generateRecommendations(input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.recommendations.map((pick) => pick.anime.mal_id), [9253]);
  const changed = await generateRecommendations({ ...input, request: 'Changed request' });
  assert.equal(changed.ok, false);
  if (!changed.ok) assert.equal(changed.kind, 'invalid');
});

test('concurrent duplicate Save clicks write one event, preserve metadata and can be undone once', async () => {
  const input = request();
  const batch = await generateRecommendations(input);
  assert.equal(batch.ok, true);
  if (!batch.ok) return;
  const animeId = batch.recommendations[0].anime.mal_id;
  const operation = { requestId: input.requestId, animeId, action: 'save', operationId: randomUUID() };
  const values = await Promise.all([actOnRecommendation(operation), actOnRecommendation(operation)]);
  assert.equal(values.every((value) => value.ok), true);
  assert.equal(await db.recommendationEvent.count({ where: { id: operation.operationId } }), 1);
  const row = await db.libraryEntry.findFirst({ where: { animeId } });
  assert.equal(row?.status, 'plan_to_watch');
  const undo = { operationId: operation.operationId, undoToken: values[0].undoToken! };
  assert.equal((await undoRecommendation(undo)).ok, true);
  assert.ok((await db.libraryEntry.findFirst({ where: { animeId } }))?.deletedAt);
  assert.equal((await undoRecommendation(undo)).ok, true);
});

test('undo never overwrites a subsequent library edit', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const animeId = batch.recommendations[0].anime.mal_id;
  const operationId = randomUUID();
  const result = await actOnRecommendation({ requestId: input.requestId, animeId, action: 'save', operationId });
  assert.equal(result.ok, true);
  const userId = '00000000-0000-4000-8000-000000000001';
  await db.libraryEntry.update({ where: { userId_animeId: { userId, animeId } }, data: { status: 'completed', editedAt: new Date(Date.now() + 1000) } });
  assert.equal((await undoRecommendation({ operationId, undoToken: result.undoToken! })).ok, false);
  assert.equal((await db.libraryEntry.findFirst({ where: { userId, animeId } }))?.status, 'completed');
});

test('another user cannot act, undo, restore or clear feedback on the original viewer', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const animeId = batch.recommendations[0].anime.mal_id; const operationId = randomUUID();
  const action = await actOnRecommendation({ requestId: input.requestId, animeId, action: 'not_interested', operationId });
  assert.equal(action.ok, true);
  viewer = 'fixture-second';
  assert.equal((await actOnRecommendation({ requestId: input.requestId, animeId, action: 'watched', operationId: randomUUID() })).ok, false);
  assert.equal((await undoRecommendation({ operationId, undoToken: action.undoToken! })).ok, false);
  assert.equal((await restoreHiddenTitle({ animeId })).ok, true);
  assert.equal((await getHiddenTitles()).length, 0);
  viewer = 'fixture-viewer'; assert.equal((await getHiddenTitles()).length, 1);
});

test('explicit taste survives a dismissal and restore; clearing taste preserves dismissal', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const animeId = batch.recommendations[0].anime.mal_id;
  assert.equal((await setFeedback({ animeId, value: 'like', reason: 'Quiet storytelling', requestId: input.requestId, operationId: randomUUID() })).ok, true);
  assert.equal((await actOnRecommendation({ animeId, requestId: input.requestId, action: 'not_interested', reason: 'Already seen elsewhere', operationId: randomUUID() })).ok, true);
  let row = await db.feedback.findFirst({ where: { animeId } });
  assert.equal(row?.value, 'like'); assert.equal(row?.reason, 'Quiet storytelling'); assert.equal(row?.dismissalReason, 'Already seen elsewhere');
  assert.equal((await setFeedback({ animeId, value: null })).ok, true);
  row = await db.feedback.findFirst({ where: { animeId } }); assert.equal(row?.dismissal, 'not_interested');
});

test('model and catalog failures remain distinct and do not write an impression', async () => {
  for (const kind of ['model', 'catalog'] as const) {
    failure = kind;
    const result = await generateRecommendations(request());
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.kind, kind);
    assert.equal(await db.recommendationBatch.count(), 0);
  }
});

test('a stale Save cannot downgrade a completed title and does not write an outcome', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const animeId = batch.recommendations[0].anime.mal_id;
  const userId = '00000000-0000-4000-8000-000000000001';
  await db.libraryEntry.create({ data: { userId, animeId, status: 'completed', anime: {}, addedAt: new Date(), editedAt: new Date() } });
  const operationId = randomUUID();
  assert.equal((await actOnRecommendation({ requestId: input.requestId, animeId, action: 'save', operationId })).ok, false);
  assert.equal((await db.libraryEntry.findFirst({ where: { userId, animeId } }))?.status, 'completed');
  assert.equal(await db.recommendationEvent.count({ where: { id: operationId } }), 0);
});

test('display events retain the precise returned order and retry without duplicates', async () => {
  const input = request(); const first = await generateRecommendations(input);
  if (!first.ok) return assert.fail('Fixture batch should succeed');
  const expected = first.recommendations.map((pick) => pick.anime.mal_id);
  const records = await db.recommendationEvent.findMany({ where: { batchId: input.requestId, action: 'display' }, orderBy: { position: 'asc' } });
  assert.deepEqual(records.map((event) => event.animeId), expected);
  await generateRecommendations(input);
  assert.equal(await db.recommendationEvent.count({ where: { batchId: input.requestId, action: 'display' } }), expected.length);
});

test('Already watched changes library status without creating a favorite or explicit taste', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const animeId = batch.recommendations[0].anime.mal_id;
  const user = await db.appUser.findFirst({ where: { authProviderId: viewer } });
  assert.equal((await actOnRecommendation({ requestId: input.requestId, animeId, action: 'watched', operationId: randomUUID() })).ok, true);
  assert.equal((await db.libraryEntry.findFirst({ where: { userId: user!.id, animeId } }))?.status, 'completed');
  assert.deepEqual((await db.appUser.findFirst({ where: { id: user!.id } }))?.favoriteAnimes, user?.favoriteAnimes);
  assert.equal(await db.feedback.count({ where: { userId: user!.id, animeId } }), 0);
});

test('permanent-dismiss undo restores the prior explicit taste row', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const animeId = batch.recommendations[0].anime.mal_id;
  assert.equal((await setFeedback({ animeId, value: 'like', reason: 'Soundtrack' })).ok, true);
  const operationId = randomUUID();
  const result = await actOnRecommendation({ requestId: input.requestId, animeId, action: 'strong_dismiss', operationId });
  assert.equal(result.ok, true);
  assert.equal((await undoRecommendation({ operationId, undoToken: result.undoToken! })).ok, true);
  const row = await db.feedback.findFirst({ where: { animeId } });
  assert.equal(row?.value, 'like'); assert.equal(row?.reason, 'Soundtrack'); assert.equal(row?.dismissal, null);
});

test('reusing a feedback operation ID cannot change its reason or write another outcome', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const animeId = batch.recommendations[0].anime.mal_id;
  const operation = { animeId, requestId: input.requestId, action: 'strong_dismiss', reason: 'Too much violence', operationId: randomUUID() };
  assert.equal((await actOnRecommendation(operation)).ok, true);
  assert.equal((await actOnRecommendation({ ...operation, reason: 'Different reason' })).ok, false);
  assert.equal((await db.feedback.findFirst({ where: { animeId } }))?.dismissalReason, 'Too much violence');
  assert.equal(await db.recommendationEvent.count({ where: { id: operation.operationId } }), 1);
});

test('concurrent taste clicks produce one attributable outcome and reject a mismatched retry', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const operation = { animeId: batch.recommendations[0].anime.mal_id, requestId: input.requestId, value: 'like', reason: 'Atmosphere', operationId: randomUUID() };
  const results = await Promise.all([setFeedback(operation), setFeedback(operation)]);
  assert.equal(results.every(result => result.ok), true);
  assert.equal(await db.recommendationEvent.count({ where: { id: operation.operationId } }), 1);
  assert.equal((await setFeedback({ ...operation, reason: 'Changed reason' })).ok, false);
});

test('clearing explicit taste preserves a permanent dismissal through concurrent calls', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const animeId = batch.recommendations[0].anime.mal_id;
  await setFeedback({ animeId, value: 'like' });
  const results = await Promise.all([
    setFeedback({ animeId, value: null }),
    actOnRecommendation({ animeId, requestId: input.requestId, action: 'strong_dismiss', operationId: randomUUID() }),
  ]);
  assert.equal(results.every(result => result.ok), true);
  assert.equal((await db.feedback.findFirst({ where: { animeId } }))?.dismissal, 'strong_dismiss');
});

test('feedback IDs are bounded before reaching the database', async () => {
  assert.equal((await restoreHiddenTitle({ animeId: 2147483648 })).ok, false);
  assert.equal((await actOnRecommendation({ animeId: 2147483648, requestId: randomUUID(), action: 'save', operationId: randomUUID() })).ok, false);
});

test('missing Groq configuration stops discovery before catalog or inference and keeps library reads available', async () => {
  const fixtureSetting = process.env.ANIME_PREVIEW_FIXTURES;
  const apiKey = process.env.GROQ_API_KEY;
  try {
    process.env.ANIME_PREVIEW_FIXTURES = '0';
    delete process.env.GROQ_API_KEY;
    const result = await generateRecommendations(request());
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.kind, 'model'); assert.match(result.message, /still search/); }
    assert.equal(rankingCalls, 0);
    assert.equal(await db.recommendationBatch.count(), 0);
    assert.ok((await db.libraryEntry.findMany()).length > 0);
  } finally {
    if (fixtureSetting === undefined) delete process.env.ANIME_PREVIEW_FIXTURES;
    else process.env.ANIME_PREVIEW_FIXTURES = fixtureSetting;
    if (apiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = apiKey;
  }
});

test('candidate diagnostics remain distinct from displayed picks with stable model and prompt metadata', async () => {
  const input = request();
  const result = await generateRecommendations(input);
  if (!result.ok) return assert.fail(result.message);
  const batch = await db.recommendationBatch.findFirst({ where: { id: input.requestId } });
  assert.equal(batch?.model, 'openai/gpt-oss-120b');
  assert.match(batch?.promptVersion ?? '', /groq/);
  const candidates = await db.recommendationEvent.findMany({ where: { batchId: input.requestId, action: 'candidate' }, orderBy: { position: 'asc' } });
  const displayed = await db.recommendationEvent.findMany({ where: { batchId: input.requestId, action: 'display' }, orderBy: { position: 'asc' } });
  assert.ok(candidates.length > displayed.length);
  assert.deepEqual(displayed.map(value => value.animeId), result.recommendations.map(value => value.anime.mal_id));
  await generateRecommendations(input);
  assert.equal(await db.recommendationEvent.count({ where: { batchId: input.requestId, action: 'candidate' } }), candidates.length);
});

test('old watched titles remain excluded beyond a compact recent-history summary', async () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  await db.libraryEntry.create({ data: { userId, animeId: 205, status: 'completed', anime: {}, addedAt: new Date('2004-01-01'), editedAt: null } });
  await db.libraryEntry.createMany({ data: Array.from({ length: 250 }, (_, index) => ({ userId, animeId: 100000 + index, status: 'completed', anime: {}, addedAt: new Date('2026-01-01') })) });
  const result = await generateRecommendations(request());
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.recommendations.some(pick => pick.anime.mal_id === 205), false);
});

test('eligibility is rechecked after a save and dismissal during provider latency', async () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  duringRanking = async () => {
    await db.libraryEntry.create({ data: { userId, animeId: 205, status: 'completed', anime: {}, addedAt: new Date(), editedAt: new Date() } });
    await db.feedback.create({ data: { userId, animeId: 1535, dismissal: 'not_interested', value: null } });
  };
  const result = await generateRecommendations(request());
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.recommendations.some(pick => [205, 1535].includes(pick.anime.mal_id)), false);
});

test('dismissal undo preserves newer explicit taste even within the same timestamp millisecond', async () => {
  const input = request(); const batch = await generateRecommendations(input);
  if (!batch.ok) return assert.fail('Fixture batch should succeed');
  const animeId = batch.recommendations[0].anime.mal_id;
  const operationId = randomUUID();
  const result = await actOnRecommendation({ requestId: input.requestId, animeId, action: 'not_interested', operationId });
  assert.equal(result.ok, true);
  const event = await db.recommendationEvent.findFirst({ where: { id: operationId } });
  await db.feedback.updateMany({ where: { animeId }, data: { value: 'like', reason: 'New rating', updatedAt: event!.createdAt } });
  assert.equal((await undoRecommendation({ operationId, undoToken: result.undoToken! })).ok, false);
  assert.equal((await db.feedback.findFirst({ where: { animeId } }))?.value, 'like');
});
