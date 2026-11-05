import { z } from 'zod';
import { animeSchema, animeIdSchema } from '@/features/library/model';
import type { Candidate } from '@/features/discovery/engine';
import { ProviderError, readProviderText } from './provider-error';
import { JIKAN_EDGE_ORIGIN, edgeCatalogPath, normalizeEdgeEnvelope } from './jikan-edge-adapter';

export const JIKAN_ORIGIN = 'https://api.jikan.moe/v4';
const pageSchema = z.number().int().min(1).max(1000);
const relationSchema = z.object({ relation: z.string().max(100), entry: z.array(z.object({
  mal_id: animeIdSchema, type: z.string().max(100), name: z.string().max(1000).optional(),
})).max(500) });
const envelopeSchema = z.object({ data: z.unknown(), pagination: z.object({
  last_visible_page: z.number().int().nonnegative(), has_next_page: z.boolean(), current_page: z.number().int().positive().optional(),
  items: z.object({ total: z.number().int().nonnegative().optional() }).optional(),
}).optional() });
export interface CatalogPage {
  items: Candidate[];
  pagination: { currentPage: number; lastVisiblePage: number; hasNextPage: boolean; total: number | null };
}

export function normalizeCatalogPath(path: string): string {
  if (!/^\/(?:anime(?:\/\d+(?:\/(?:full|recommendations))?)?|top\/anime|seasons\/now)(?:\?|$)/.test(path) || path.includes('..')) {
    throw new ProviderError('catalog', 'Choose a valid catalog request.', 'invalid_response');
  }
  const url = new URL(`${JIKAN_ORIGIN}${path}`);
  if (url.searchParams.has('q')) url.searchParams.set('q', url.searchParams.get('q')!.trim().replace(/\s+/g, ' ').toLowerCase());
  url.searchParams.sort();
  return `${url.pathname.slice(3)}${url.search}`;
}

export function parseCatalogAnime(item: unknown): Candidate | null {
  const result = animeSchema.safeParse(item);
  if (!result.success) return null;
  const relations = z.object({ relations: z.array(relationSchema).max(500).optional() }).safeParse(item);
  // Jikan separates themes (e.g. Isekai, Mecha) from genres. The app's existing
  // taste vocabulary intentionally offers both; retain themes for hard checks.
  const themes = z.object({ themes: z.array(z.object({ name: z.string().max(200) })).max(100).nullish() }).safeParse(item);
  const genres = [...new Set([...result.data.genres, ...(themes.success ? themes.data.themes ?? [] : [])].map(genre => genre.name))].map(name => ({ name }));
  return { ...result.data, genres, relations: relations.success ? relations.data.relations : undefined };
}

export function retryAfterSeconds(value: string | null, now = Date.now()): number {
  const seconds = value === null ? NaN : Number(value);
  const parsed = Number.isFinite(seconds) ? seconds : value ? (Date.parse(value) - now) / 1000 : NaN;
  return Math.min(86400, Math.max(1, Number.isFinite(parsed) ? Math.ceil(parsed) : 60));
}

type BudgetRelease = () => Promise<void>;
export function createCatalogTransport(options: {
  source?: 'jikan-edge' | 'jikan-v4';
  fetch?: typeof fetch;
  reserve?: () => Promise<BudgetRelease>;
  observe?: (headers: Headers, status: number) => Promise<void>;
  now?: () => number;
  paceMs?: number;
}) {
  const inFlight = new Map<string, Promise<unknown>>();
  const cache = new Map<string, { value: unknown; expires: number }>();
  const now = options.now ?? Date.now;
  let lastRequest = 0;
  let queue = Promise.resolve();
  async function pace() {
    const turn = queue.then(async () => {
      const delay = lastRequest + (options.paceMs ?? 360) - now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      lastRequest = now();
    });
    queue = turn.catch(() => {});
    await turn;
  }
  return async function request(rawPath: string): Promise<unknown> {
    const path = normalizeCatalogPath(rawPath);
    const saved = cache.get(path);
    if (saved && saved.expires > now()) return saved.value;
    const pending = inFlight.get(path);
    if (pending) return pending;
    const task = (async () => {
      let release: BudgetRelease | undefined;
      try {
        await pace();
        release = await options.reserve?.();
        const edge = options.source !== 'jikan-v4';
        const response = await (options.fetch ?? fetch)(`${edge ? JIKAN_EDGE_ORIGIN : JIKAN_ORIGIN}${edge ? edgeCatalogPath(path) : path}`, {
          headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000),
        });
        await options.observe?.(response.headers, response.status);
        if (response.status === 404) return { data: null };
        if (response.status === 429) {
          const retry = retryAfterSeconds(response.headers.get('retry-after'), now());
          throw new ProviderError('catalog', `The catalog is busy. Try again in ${retry} seconds.`, 'rate_limit', retry);
        }
        if (!response.ok) throw new ProviderError('catalog', 'The anime catalog is unavailable. Your input is kept; try again shortly.');
        const raw = await readProviderText(response, 2_000_000);
        const value = envelopeSchema.parse(edge ? normalizeEdgeEnvelope(JSON.parse(raw), path) : JSON.parse(raw));
        cache.delete(path);
        cache.set(path, { value, expires: now() + 300_000 });
        if (cache.size > 200) cache.delete(cache.keys().next().value!);
        return value;
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
          const retry = Math.max(1, Number(error.retryAfterSeconds) || 60);
          throw new ProviderError('catalog', `The catalog request budget is busy. Try again in ${retry} seconds.`, 'rate_limit', retry);
        }
        const causeCode = error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause ? error.cause.code : null;
        if (error instanceof Error && (['TimeoutError', 'AbortError'].includes(error.name) || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(String(causeCode)))) {
          throw new ProviderError('catalog', 'The catalog took too long to respond. Your input is kept; try again.', 'timeout');
        }
        throw new ProviderError('catalog', 'The catalog returned an unreadable response or could not be reached. Try again.', 'invalid_response');
      } finally { if (release) await release().catch(() => {}); }
    })();
    inFlight.set(path, task);
    try { return await task; } finally { inFlight.delete(path); }
  };
}

export function createCatalogClient(request: (path: string) => Promise<unknown>, now = Date.now) {
  const metadata = new Map<number, { anime: Candidate; expires: number }>();
  function remember(anime: Candidate) {
    metadata.delete(anime.mal_id);
    metadata.set(anime.mal_id, { anime, expires: now() + 300_000 });
    if (metadata.size > 1000) metadata.delete(metadata.keys().next().value!);
    return anime;
  }
  function getCachedAnime(animeId: number) {
    const cached = metadata.get(animeIdSchema.parse(animeId));
    return cached && cached.expires > now() ? cached.anime : null;
  }
  function envelope(value: unknown) {
    const parsed = envelopeSchema.safeParse(value);
    if (!parsed.success) throw new ProviderError('catalog', 'The catalog returned an unreadable response. Try again.', 'invalid_response');
    return parsed.data;
  }
  async function list(path: string, page = 1): Promise<CatalogPage> {
    const body = envelope(await request(normalizeCatalogPath(path)));
    // Edge returns the whole season, rather than honoring Jikan's list limit.
    const values = z.array(z.unknown()).max(/^\/seasons\/now(?:\?|$)/.test(path) ? 500 : 100).safeParse(body.data);
    if (!values.success) throw new ProviderError('catalog', 'The catalog returned an unreadable response. Try again.', 'invalid_response');
    const items = values.data.flatMap(value => { const anime = parseCatalogAnime(value); return anime ? [remember(anime)] : []; });
    if (values.data.length && !items.length) throw new ProviderError('catalog', 'The catalog returned unreadable title metadata. Try again.', 'invalid_response');
    return { items, pagination: {
      currentPage: body.pagination?.current_page ?? page,
      lastVisiblePage: body.pagination?.last_visible_page ?? page,
      hasNextPage: body.pagination?.has_next_page ?? false,
      total: body.pagination?.items?.total ?? null,
    } };
  }
  async function details(animeId: number, full: boolean): Promise<Candidate | null> {
    animeIdSchema.parse(animeId);
    const cached = getCachedAnime(animeId);
    if (cached && (!full || cached.relationsVerified)) return cached;
    const body = envelope(await request(`/anime/${animeId}${full ? '/full' : ''}`));
    if (body.data === null) return null;
    const anime = parseCatalogAnime(body.data);
    if (!anime || (full && !anime.relations)) throw new ProviderError('catalog', 'The catalog could not verify this title. Try again.', 'invalid_response');
    return remember({ ...anime, relationsVerified: full });
  }
  return {
    list, getCachedAnime,
    getAnimeDetails: (animeId: number) => details(animeId, true),
    getAnimeMetadata: (animeId: number) => details(animeId, false),
    async searchAnimePage(query: string, page = 1) {
      const normalized = z.string().trim().min(1).max(200).parse(query).replace(/\s+/g, ' ').toLowerCase();
      pageSchema.parse(page);
      return list(`/anime?${new URLSearchParams({ q: normalized, page: String(page), sfw: 'true', limit: '24' })}`, page);
    },
    async recommendationIds(animeId: number): Promise<number[]> {
      animeIdSchema.parse(animeId);
      const body = envelope(await request(`/anime/${animeId}/recommendations`));
      const parsed = z.array(z.object({ entry: z.object({ mal_id: animeIdSchema }) })).max(10000).safeParse(body.data);
      if (!parsed.success) throw new ProviderError('catalog', 'The catalog returned unreadable related titles.', 'invalid_response');
      return [...new Set(parsed.data.map(value => value.entry.mal_id))].slice(0, 4);
    },
  };
}
