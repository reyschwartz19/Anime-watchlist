import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogClient, createCatalogTransport as createTransport, normalizeCatalogPath, parseCatalogAnime, retryAfterSeconds } from './catalog-client';
import { ProviderError } from './provider-error';

// Existing v4 fixture contracts remain supported independently of the Edge adapter.
const createCatalogTransport: typeof createTransport = options => createTransport({ source: 'jikan-v4', ...options });

const title = (id = 205) => ({ mal_id: id, title: id === 205 ? 'Samurai Champloo' : 'A different season',
  images: { jpg: { image_url: null, large_image_url: null } }, synopsis: null, episodes: null, genres: null,
  type: 'TV', year: 2004, status: 'Finished Airing', title_english: 'Samurai Champloo',
});

test('query cache keys normalize whitespace, case, and parameter order; foreign destinations are rejected', () => {
  assert.equal(normalizeCatalogPath('/anime?sfw=true&q=%20Samurai%20%20CHAMPLOO%20&page=2'), '/anime?page=2&q=samurai+champloo&sfw=true');
  assert.equal(normalizeCatalogPath('/anime?page=2&q=samurai+champloo&sfw=true'), '/anime?page=2&q=samurai+champloo&sfw=true');
  for (const path of ['https://evil.test/anime', '//evil.test', '/anime/../users', '/users', '/anime/1/private']) assert.throws(() => normalizeCatalogPath(path));
});

test('simultaneous normalized requests coalesce and completed requests reuse cache until expiry', async () => {
  let calls = 0; let reserves = 0; let releases = 0; let now = 10000;
  const request = createCatalogTransport({ paceMs: 0, now: () => now,
    reserve: async () => { reserves++; return async () => { releases++; }; },
    fetch: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ data: [title()] }); },
  });
  await Promise.all([request('/anime?q=Samurai'), request('/anime?q=samurai'), request('/anime?q=Samurai')]);
  assert.equal(calls, 1); assert.equal(reserves, 1); assert.equal(releases, 1);
  await request('/anime?q=Samurai'); assert.equal(calls, 1);
  now += 300001;
  await request('/anime?q=Samurai'); assert.equal(calls, 2);
});

test('paginated search retains distinct MAL seasons, nullable metadata and server-cached list metadata for saves', async () => {
  const calls: string[] = [];
  const client = createCatalogClient(async path => {
    calls.push(path);
    return path.includes('/full') ? { data: { ...title(), relations: [] } } : {
      data: [title(), title(206)], pagination: { current_page: 2, last_visible_page: 3, has_next_page: true, items: { total: 60 } },
    };
  });
  const page = await client.searchAnimePage('  Samurai   Champloo  ', 2);
  assert.deepEqual(page.items.map(item => item.mal_id), [205, 206]);
  assert.deepEqual(page.pagination, { currentPage: 2, lastVisiblePage: 3, hasNextPage: true, total: 60 });
  assert.equal(page.items[0].episodes, null); assert.equal(page.items[0].synopsis, '');
  assert.equal((await client.getAnimeMetadata(205))?.mal_id, 205); assert.equal(calls.length, 1);
  assert.equal((await client.getAnimeDetails(205))?.relationsVerified, true); assert.equal(calls.length, 2);
  assert.equal((await client.getAnimeDetails(205))?.relationsVerified, true); assert.equal(calls.length, 2);
  await assert.rejects(() => client.searchAnimePage('x', 0));
  await assert.rejects(() => client.getAnimeDetails(2_147_483_648));
});

test('invalid upstream records are rejected while absent images/episodes remain usable', () => {
  assert.ok(parseCatalogAnime(title()));
  assert.equal(parseCatalogAnime({ ...title(), mal_id: -1 }), null);
  assert.equal(parseCatalogAnime({ ...title(), images: { jpg: { image_url: 'javascript:bad' } } }), null);
  assert.deepEqual(parseCatalogAnime({ ...title(), genres: [{ name: 'Fantasy' }], themes: [{ name: 'Isekai' }, { name: 'Fantasy' }] })?.genres, [{ name: 'Fantasy' }, { name: 'Isekai' }]);
});

test('catalog 429 honors Retry-After and is neither cached nor automatically retried', async () => {
  let calls = 0; const observed: number[] = [];
  const request = createCatalogTransport({ paceMs: 0, fetch: async () => { calls++; return new Response('private upstream failure', { status: 429, headers: { 'retry-after': '7' } }); },
    observe: async (_headers, status) => { observed.push(status); },
  });
  await assert.rejects(request('/anime?q=x'), (error: unknown) => error instanceof ProviderError && error.code === 'rate_limit' && error.retryAfterSeconds === 7 && !error.message.includes('private'));
  assert.equal(calls, 1); assert.deepEqual(observed, [429]);
  assert.equal(retryAfterSeconds(new Date(16000).toUTCString(), 10000), 6);
});

test('catalog distinguishes no match, timeout and malformed envelopes', async () => {
  const empty = createCatalogClient(createCatalogTransport({ paceMs: 0, fetch: async () => Response.json({ data: [] }) }));
  assert.deepEqual((await empty.searchAnimePage('no match')).items, []);
  const timeout = createCatalogTransport({ paceMs: 0, fetch: async () => { throw new DOMException('secret url', 'TimeoutError'); } });
  await assert.rejects(timeout('/anime?q=x'), (error: unknown) => error instanceof ProviderError && error.code === 'timeout' && !error.message.includes('secret'));
  const malformed = createCatalogTransport({ paceMs: 0, fetch: async () => Response.json({ unexpected: [] }) });
  await assert.rejects(malformed('/anime?q=x'), (error: unknown) => error instanceof ProviderError && error.code === 'invalid_response');
});
