import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogClient, createCatalogTransport } from './catalog-client';
import { edgeCatalogPath, normalizeEdgeEnvelope } from './jikan-edge-adapter';
import { eligible } from '@/features/discovery/engine';

const summary = (malId = 205) => ({ malId, title: 'Samurai Champloo', imageUrl: 'https://cdn.myanimelist.net/images/anime/1370/135212.jpg',
  synopsis: null, episodes: 26, type: 'TV', score: 8.5, startDate: 'May 20, 2004', rating: 'R - 17+ (violence & profanity)',
});

test('Edge request translation removes unsupported parameters without changing public query filters', () => {
  assert.equal(edgeCatalogPath('/anime?q=one&page=2&sfw=true&limit=24&genres=1&min_score=6'), '/anime?genres=1&min_score=6&page=2&q=one');
  assert.equal(edgeCatalogPath('/top/anime?filter=bypopularity&limit=24&sfw=true'), '/top/anime?filter=bypopularity');
  assert.equal(edgeCatalogPath('/seasons/now?sfw=true&limit=24'), '/seasons/now');
});

test('Edge-shaped search preserves MAL IDs, year, unknown facts, every record and next-page metadata', async () => {
  const urls: string[] = [];
  const client = createCatalogClient(createCatalogTransport({ paceMs: 0, fetch: async input => {
    urls.push(String(input));
    return Response.json({ data: Array.from({ length: 50 }, (_, index) => summary(205 + index)),
      meta: { cached: true, stale: false, pagination: { page: 2, hasNextPage: true, count: 50, total: null } },
    });
  } }));
  const result = await client.searchAnimePage('Samurai Champloo', 2);
  assert.match(urls[0], /^https:\/\/jikan\.lucashdo\.com\/v1\/anime\?/);
  assert.equal(new URL(urls[0]).searchParams.has('limit'), false);
  assert.equal(new URL(urls[0]).searchParams.has('sfw'), false);
  assert.equal(result.items.length, 50); // Edge uses upstream page size, not Jikan's limit.
  assert.equal(result.items[0].mal_id, 205); assert.equal(result.items[0].year, 2004);
  assert.equal(result.items[0].status, undefined); assert.deepEqual(result.items[0].genres, []);
  assert.deepEqual(result.pagination, { currentPage: 2, lastVisiblePage: 3, hasNextPage: true, total: null });
  assert.equal((await client.getAnimeMetadata(205))?.mal_id, 205); assert.equal(urls.length, 1);
});

test('full Edge metadata preserves prerequisites, completion, alternate titles and themes for deterministic checks', async () => {
  const client = createCatalogClient(createCatalogTransport({ paceMs: 0, fetch: async () => Response.json({ data: {
    ...summary(206), titleEnglish: 'An alternate title', titleJapanese: '別の題名', images: { medium: null, large: null },
    status: 'Finished Airing', episodes: 12, year: 2005,
    genres: [{ malId: 10, name: 'Fantasy' }], themes: [{ malId: 62, name: 'Isekai' }],
    relations: [{ relation: 'Prequel', malId: 205, type: 'anime', title: 'Samurai Champloo' }],
  }, meta: { cached: true } }) }));
  const anime = await client.getAnimeDetails(206);
  assert.ok(anime?.relationsVerified); assert.equal(anime.title_english, 'An alternate title');
  assert.deepEqual(anime.relations?.[0].entry.map(entry => entry.mal_id), [205]);
  const context = { mode: 'new' as const, library: [], dismissedIds: [], sessionPassIds: [], constraints: { finishedOnly: true, maxEpisodes: 13, genres: ['Isekai'] } };
  assert.equal(eligible(anime, context), false);
  assert.equal(eligible(anime, { ...context, library: [{ animeId: 205, status: 'completed' }] }), true);
});

test('the full seasonal response is accepted within its own bound instead of rejected as a search page', async () => {
  const client = createCatalogClient(createCatalogTransport({ paceMs: 0, fetch: async () => Response.json({
    data: Array.from({ length: 180 }, (_, index) => summary(1000 + index)), meta: { cached: true },
  }) }));
  assert.equal((await client.list('/seasons/now?sfw=true&limit=24')).items.length, 180);
  await assert.rejects(client.list('/anime?q=oversized'), /unreadable response/);
});

test('Edge recommendation IDs normalize, malformed relations stay unverified, and explicit adult search results stay excluded', async () => {
  const client = createCatalogClient(createCatalogTransport({ paceMs: 0, fetch: async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/recommendations')) return Response.json({ data: [{ malId: 457, title: 'Mushi-Shi', votes: 1 }], meta: {} });
    if (path.endsWith('/full')) return Response.json({ data: summary(), meta: {} });
    return Response.json({ data: [summary(), { ...summary(206), rating: 'Rx - Hentai' }, { ...summary(207), rating: 'R+ - Mild Nudity' }], meta: {} });
  } }));
  assert.deepEqual(await client.recommendationIds(205), [457]);
  await assert.rejects(client.getAnimeDetails(205), /verify this title/);
  assert.deepEqual((await client.searchAnimePage('Samurai')).items.map(anime => anime.mal_id), [205]);
  assert.throws(() => normalizeEdgeEnvelope({ data: [] }, '/anime'), /unreadable/);
});
