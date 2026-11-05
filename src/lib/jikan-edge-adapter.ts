import { z } from 'zod';
import { ProviderError } from './provider-error';

export const JIKAN_EDGE_ORIGIN = 'https://jikan.lucashdo.com/v1';

/** The app keeps its MAL/Jikan data model; only this boundary knows Edge's schema. */
export function edgeCatalogPath(path: string): string {
  const url = new URL(path, JIKAN_EDGE_ORIGIN);
  // Edge rejects these Jikan parameters instead of silently ignoring them.
  // Its public lists have fixed upstream page sizes; never slice away records.
  url.searchParams.delete('limit');
  url.searchParams.delete('sfw');
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeAnime(value: unknown): unknown {
  const item = record(value);
  const images = record(item.images);
  const aired = record(item.aired);
  const date = typeof item.startDate === 'string' ? item.startDate : aired.from;
  const year = typeof date === 'string' ? /\b(?:18|19|20|21)\d{2}\b/.exec(date)?.[0] : undefined;
  return {
    mal_id: item.malId, title: item.title,
    title_english: item.titleEnglish, title_japanese: item.titleJapanese,
    images: { jpg: { image_url: images.medium ?? item.imageUrl ?? null, large_image_url: images.large ?? item.imageUrl ?? null } },
    synopsis: item.synopsis, episodes: item.episodes, score: item.score,
    year: item.year ?? (year ? Number(year) : null), type: item.type, status: item.status,
    genres: item.genres, themes: item.themes,
    // A missing/malformed relations field must not become a verified empty list.
    relations: Array.isArray(item.relations) ? item.relations.map(value => {
      const relation = record(value);
      return { relation: relation.relation, entry: [{ mal_id: relation.malId, type: relation.type, name: relation.title }] };
    }) : item.relations,
  };
}

const edgeEnvelope = z.object({
  data: z.unknown(),
  meta: z.object({ pagination: z.object({
    page: z.number().int().positive().max(1000),
    hasNextPage: z.boolean(),
    total: z.number().int().nonnegative().nullable().optional(),
  }).optional() }),
});

/** Normalize a validated public envelope before it enters the shared cache. */
export function normalizeEdgeEnvelope(value: unknown, path: string): unknown {
  const parsed = edgeEnvelope.safeParse(value);
  if (!parsed.success) throw new ProviderError('catalog', 'The catalog returned an unreadable response. Try again.', 'invalid_response');
  const { data, meta } = parsed.data;
  if (/^\/anime\/\d+\/recommendations(?:\?|$)/.test(path)) {
    const entries = z.array(z.object({ malId: z.number().int().positive().max(2_147_483_647) })).max(10000).safeParse(data);
    if (!entries.success) throw new ProviderError('catalog', 'The catalog returned unreadable related titles.', 'invalid_response');
    return { data: entries.data.map(item => ({ entry: { mal_id: item.malId } })) };
  }
  const safeOnly = new URL(path, JIKAN_EDGE_ORIGIN).searchParams.get('sfw') === 'true';
  const values = Array.isArray(data)
    ? data.filter(item => !safeOnly || !/^(?:Rx\b|R\+)/i.test(String(record(item).rating ?? ''))).map(normalizeAnime)
    : data === null ? null : normalizeAnime(data);
  return {
    data: values,
    ...(meta.pagination ? { pagination: {
      current_page: meta.pagination.page,
      last_visible_page: meta.pagination.page + Number(meta.pagination.hasNextPage),
      has_next_page: meta.pagination.hasNextPage,
      items: { ...(meta.pagination.total !== null && meta.pagination.total !== undefined ? { total: meta.pagination.total } : {}) },
    } } : {}),
  };
}
