import 'server-only';
import { headers } from 'next/headers';
import { animeIdSchema } from '@/features/library/model';
import { diverseCandidates, mergeCandidateSources, type Candidate, type Constraints } from '@/features/discovery/engine';
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
export interface RetrievalTaste { favorites: { animeId: number | null; title: string }[]; likedIds: number[] }

/** Every source is Jikan data. The model can only rank verified supplied IDs. */
export async function retrieveCandidates(interests: string[], constraints: Constraints, taste?: RetrievalTaste): Promise<Candidate[]> {
  await fixtureFailure('catalog');
  if (previewEnabled()) return fixtureCatalog().map(anime => ({ ...anime, relations: [], relationsVerified: true }));
  const sources: Candidate[][] = [];
  const genres = [...new Set([...(constraints.genres ?? []), ...interests].map(value => genreIds[value]).filter(Boolean))].slice(0, 3);
  for (const genre of genres) {
    const query = new URLSearchParams({ sfw: 'true', order_by: 'score', sort: 'desc', limit: '24', min_score: '6', genres: String(genre) });
    if (constraints.finishedOnly) query.set('status', 'complete');
    sources.push((await jikan.list(`/anime?${query}`)).items);
  }
  sources.push((await jikan.list('/top/anime?filter=bypopularity&sfw=true&limit=24')).items);
  if (!constraints.finishedOnly) sources.push((await jikan.list('/seasons/now?sfw=true&limit=24')).items);
  const seedIds = [...new Set([...(taste?.likedIds ?? []), ...(taste?.favorites ?? []).flatMap(value => value.animeId ? [value.animeId] : [])])].slice(0, 2);
  for (const seedId of seedIds) {
    const seed = await getAnimeDetails(seedId);
    const relatedIds = seed?.relations?.flatMap(relation => ['Side story', 'Spin-off', 'Alternative version', 'Sequel'].includes(relation.relation)
      ? relation.entry.filter(entry => entry.type === 'anime').map(entry => entry.mal_id) : []) ?? [];
    const ids = [...new Set([...(await jikan.recommendationIds(seedId)), ...relatedIds])].slice(0, 4);
    const related: Candidate[] = [];
    for (const id of ids) { const anime = await getAnimeMetadata(id); if (anime) related.push(anime); }
    sources.unshift(related);
  }
  return mergeCandidateSources(sources, 60);
}

export async function verifyCandidates(candidates: Candidate[]): Promise<Candidate[]> {
  const verified: Candidate[] = [];
  for (const candidate of mergeCandidateSources([candidates], 24)) {
    const anime = candidate.relationsVerified ? candidate : await getAnimeDetails(candidate.mal_id);
    if (anime) verified.push(anime);
    if (diverseCandidates(verified).length >= 18) break;
  }
  return diverseCandidates(verified);
}

export async function rankCandidates(context: RankingContext): Promise<{ anime: Candidate; reason: string }[]> {
  await fixtureFailure('model');
  if (previewEnabled()) return context.candidates.slice(0, 3).map(anime => ({ anime, reason: `Fixture recommendation: ${anime.title} matches your ${context.interests[0] ?? 'discovery'} interest. This is preview data, not a live Groq result.` }));
  return groqRank(context);
}
