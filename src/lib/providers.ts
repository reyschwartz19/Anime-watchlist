import 'server-only';
import { headers } from 'next/headers';
import { animeIdSchema } from '@/features/library/model';
import { diverseCandidates, eligible, mergeCandidateSources, type Candidate, type Constraints, type Eligibility } from '@/features/discovery/engine';
import { fixtureCatalog, previewEnabled, previewFailure } from './preview';
import { ProviderError } from './provider-error';
import { jikan } from './jikan';
import { groqRank } from './groq';
import type { RankingContext } from './groq-client';
import type { CatalogPage } from './catalog-client';

export { ProviderError } from './provider-error';

async function fixtureFailure(kind: 'catalog' | 'model') {
  if (previewEnabled() && previewFailure((await headers()).get('cookie') ?? '') === kind) {
    throw new ProviderError(kind, kind === 'catalog' ? 'The anime catalog could not be reached. Try again.' : 'Groq could not rank your picks. Try again.');
  }
}

export async function searchAnimePage(query: string, page = 1): Promise<CatalogPage> {
  await fixtureFailure('catalog');
  if (previewEnabled()) {
    const matches = fixtureCatalog().filter(anime => anime.title.toLowerCase().includes(query.trim().toLowerCase()));
    return { items: matches.slice((page - 1) * 24, page * 24).map(anime => ({ ...anime, relations: [] })), pagination: {
      currentPage: page, lastVisiblePage: Math.max(1, Math.ceil(matches.length / 24)), hasNextPage: page * 24 < matches.length, total: matches.length,
    } };
  }
  return jikan.searchAnimePage(query, page);
}

export async function searchAnime(query: string): Promise<Candidate[]> {
  return (await searchAnimePage(query)).items;
}

export function getCachedAnime(animeId: number): Candidate | null {
  animeIdSchema.parse(animeId);
  if (!previewEnabled()) return jikan.getCachedAnime(animeId);
  const anime = fixtureCatalog().find(anime => anime.mal_id === animeId);
  return anime ? { ...anime, relations: [] } : null;
}

export async function getAnimeMetadata(animeId: number): Promise<Candidate | null> {
  await fixtureFailure('catalog');
  animeIdSchema.parse(animeId);
  return previewEnabled() ? getCachedAnime(animeId) : jikan.getAnimeMetadata(animeId);
}

export async function getAnimeDetails(animeId: number): Promise<Candidate | null> {
  await fixtureFailure('catalog');
  animeIdSchema.parse(animeId);
  if (previewEnabled()) {
    const anime = getCachedAnime(animeId);
    return anime ? { ...anime, relations: [], relationsVerified: true } : null;
  }
  return jikan.getAnimeDetails(animeId);
}

const genreIds: Record<string, number> = { Action: 1, Adventure: 2, Comedy: 4, Drama: 8, Fantasy: 10, Horror: 14, Mystery: 7, Romance: 22, 'Sci-Fi': 24, 'Slice of Life': 36, Sports: 30, Supernatural: 37, Thriller: 41, Isekai: 62, Mecha: 18 };
export interface RetrievalTaste { favorites: { animeId: number | null; title: string }[]; likedIds: number[]; completedIds?: number[] }

async function mapCatalog<T, U>(items: T[], work: (item: T) => Promise<U>): Promise<U[]> {
  const results: U[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await work(items[index]); }
  }));
  return results;
}

/** Every source is Jikan data. The model can only rank verified supplied IDs. */
export async function retrieveCandidates(interests: string[], constraints: Constraints, taste?: RetrievalTaste): Promise<Candidate[]> {
  await fixtureFailure('catalog');
  if (previewEnabled()) return fixtureCatalog().map(anime => ({ ...anime, relations: [], relationsVerified: true }));
  const sources: Candidate[][] = [];
  const genres = [...new Set([...(constraints.genres ?? []), ...interests].map(value => genreIds[value]).filter(Boolean))].slice(0, 2);
  const paths = genres.map(genre => {
    const query = new URLSearchParams({ sfw: 'true', order_by: 'score', sort: 'desc', limit: '24', min_score: '6', genres: String(genre) });
    if (constraints.finishedOnly) query.set('status', 'complete');
    return `/anime?${query}`;
  });
  paths.push('/top/anime?filter=bypopularity&sfw=true&limit=24');
  sources.push(...await mapCatalog(paths, async path => (await jikan.list(path)).items));
  const seedIds = [...new Set([...(taste?.likedIds ?? []), ...(taste?.favorites ?? []).flatMap(value => value.animeId ? [value.animeId] : []), ...(taste?.completedIds ?? [])])].slice(0, 2);
  const related = (await mapCatalog(seedIds, async seedId => {
    try { return await jikan.recommendationCandidates(seedId); } catch { return []; } // Optional graph source; genre/popularity sources remain real catalog data.
  })).flat();
  if (related.length) sources.unshift(related);
  return mergeCandidateSources(sources, 60);
}

export async function verifyCandidates(candidates: Candidate[], context?: Eligibility): Promise<Candidate[]> {
  const verified: Candidate[] = [];
  const started = Date.now();
  const pool = mergeCandidateSources([candidates], 24);
  for (let offset = 0; offset < pool.length && verified.length < 10; offset += 2) {
    if (Date.now() - started > 25_000 || (verified.length >= 5 && Date.now() - started > 12_000)) break;
    const hydrated = await mapCatalog(pool.slice(offset, offset + 2), async candidate => candidate.relationsVerified ? candidate : getAnimeDetails(candidate.mal_id));
    for (const anime of hydrated) if (anime && (!context || eligible(anime, context)) && !anime.genres.some(genre => ['Hentai', 'Erotica'].includes(genre.name))) verified.push(anime);
  }
  return diverseCandidates(verified);
}

export async function rankCandidates(context: RankingContext): Promise<{ anime: Candidate; reason: string }[]> {
  await fixtureFailure('model');
  if (previewEnabled()) return context.candidates.slice(0, 5).map(anime => ({ anime, reason: `${anime.title} pairs ${anime.genres.map(genre => genre.name.toLowerCase()).slice(0, 2).join(' and ')} with ${anime.episodes ?? 'an unknown number of'} episodes. Fixture preview; your saved notes inform live picks.` }));
  return groqRank(context);
}
