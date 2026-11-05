import { z } from 'zod';
import type { Anime } from '@/features/library/model';

export const PROMPT_VERSION = 'manga-shelf-v1';
export const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
export const constraintsSchema = z.object({
  maxEpisodes: z.number().int().positive().max(5000).optional(),
  genres: z.array(z.string().trim().min(1).max(100)).max(15).optional(),
  excludedGenres: z.array(z.string().trim().min(1).max(100)).max(15).optional(),
  standaloneOnly: z.boolean().optional(),
  types: z.array(z.enum(['TV', 'Movie', 'OVA', 'ONA', 'Special', 'TV Special'])).max(6).optional(),
  excludedTypes: z.array(z.enum(['TV', 'Movie', 'OVA', 'ONA', 'Special', 'TV Special'])).max(6).optional(),
}).strict();
export type Constraints = z.infer<typeof constraintsSchema>;
export const generationSchema = z.object({
  mode: z.enum(['new', 'list']).default('new'),
  request: z.string().trim().max(1200).default(''),
  sessionPassIds: z.array(z.number().int().positive()).max(1000).default([]),
  requestId: z.string().uuid(),
  constraints: constraintsSchema.default({}),
}).strict();

export type Candidate = Anime & {
  year?: number | null;
  type?: string | null;
  relations?: { relation: string; entry: { mal_id: number; type: string; name?: string }[] }[];
  relationsVerified?: boolean;
};
export interface Eligibility {
  mode: 'new' | 'list';
  library: { animeId: number; status: string }[];
  dismissedIds: number[];
  sessionPassIds: number[];
  constraints: Constraints;
}

/** Whole-library exclusion stays independent of the bounded model taste summary. */
export function eligible(anime: Candidate, context: Eligibility): boolean {
  const entry = context.library.find((item) => item.animeId === anime.mal_id);
  if (context.mode === 'new' ? !!entry : entry?.status !== 'plan_to_watch') return false;
  if (context.dismissedIds.includes(anime.mal_id) || context.sessionPassIds.includes(anime.mal_id)) return false;
  const { maxEpisodes, genres = [], excludedGenres = [] } = context.constraints;
  // Unknown facts cannot satisfy a hard constraint.
  if (maxEpisodes && (!anime.episodes || anime.episodes > maxEpisodes)) return false;
  const names = new Set(anime.genres.map((item) => item.name.toLocaleLowerCase()));
  if (genres.some((genre) => !names.has(genre.toLocaleLowerCase()))) return false;
  if (excludedGenres.some((genre) => names.has(genre.toLocaleLowerCase()))) return false;
  if (context.constraints.types?.length && !context.constraints.types.some((type) => type === anime.type)) return false;
  if (context.constraints.excludedTypes?.some((type) => type === anime.type)) return false;
  const completed = new Set(context.library.filter((item) => item.status === 'completed').map((item) => item.animeId));
  const prerequisites = (anime.relations ?? []).filter((relation) => relation.relation === 'Prequel')
    .flatMap((relation) => relation.entry.filter((item) => item.type === 'anime'));
  if (prerequisites.some((item) => !completed.has(item.mal_id))) return false;
  if (context.constraints.standaloneOnly && prerequisites.length) return false;
  return true;
}

/** Parse ID/reason pairs together: rejected or duplicate IDs never shift reasons. */
export function validateRanking(raw: unknown, candidates: Candidate[]): { anime: Candidate; reason: string }[] {
  const parsed = z.object({ picks: z.array(z.object({
    animeId: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1600),
  }).strict()).max(20) }).strict().parse(raw);
  const byId = new Map(candidates.map((anime) => [anime.mal_id, anime]));
  const seen = new Set<number>();
  return parsed.picks.flatMap(({ animeId, reason }) => {
    const anime = byId.get(animeId);
    if (!anime || seen.has(animeId)) return [];
    seen.add(animeId);
    return [{ anime, reason }];
  }).slice(0, 3);
}

/** Familiar hard wording is promoted to a deterministic constraint before ranking. */
export function requestConstraints(request: string, supplied: Constraints): Constraints {
  const max = /(?:under|at most|no more than|maximum|max)\s+(\d+)\s*episodes?/i.exec(request);
  const excluded = [...(supplied.excludedGenres ?? [])];
  const required = [...(supplied.genres ?? [])];
  for (const genre of ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Sports', 'Supernatural', 'Thriller', 'Isekai', 'Mecha']) {
    if (new RegExp(`(?:no|without|exclude|avoid)\\s+${genre.replace('-', '[- ]')}(?:\\b|$)`, 'i').test(request)) excluded.push(genre);
    if (new RegExp(`(?:only|must (?:be|have))\\s+${genre.replace('-', '[- ]')}(?:\\b|$)`, 'i').test(request)) required.push(genre);
  }
  const requestedMax = max ? Number(max[1]) - (/^under/i.test(max[0]) ? 1 : 0) : undefined;
  return {
    ...supplied,
    ...(requestedMax && requestedMax > 0 ? { maxEpisodes: Math.min(supplied.maxEpisodes ?? Infinity, requestedMax) } : {}),
    excludedGenres: [...new Set(excluded)],
    ...(required.length ? { genres: [...new Set(required)] } : {}),
    ...(/\b(?:standalone|no sequels|without sequels)\b/i.test(request) ? { standaloneOnly: true } : {}),
    ...(/\b(?:no|without|exclude|avoid)\s+(?:movies|films)\b/i.test(request) ? { excludedTypes: [...new Set([...(supplied.excludedTypes ?? []), 'Movie' as const])] } : {}),
    ...(/\b(?:only|must be)\s+(?:a\s+)?(?:movies?|films?)\b/i.test(request) ? { types: ['Movie' as const] } : {}),
  };
}
