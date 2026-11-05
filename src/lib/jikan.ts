import 'server-only';
import { unstable_cache } from 'next/cache';
import { createCatalogClient, createCatalogTransport } from './catalog-client';
import { observeProviderHeaders, reserveProviderBudget } from './rate-limit';

const request = createCatalogTransport({
  reserve: () => reserveProviderBudget('jikan', { requests: 1 }),
  observe: (headers, status) => observeProviderHeaders('jikan', headers, status),
});
// Only public Jikan data enters Next's shared cache. Session/taste/ranking data
// never enters this cache, and outbound budget is charged only for cache misses.
const cachedRequest = unstable_cache(request, ['jikan-v4-validated-v2'], { revalidate: 300 });
export const jikan = createCatalogClient(cachedRequest);
