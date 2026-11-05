import { z } from 'zod';
import type { Anime } from '@/features/library/model';

export const PROMPT_VERSION = 'manga-shelf-groq-v2';
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
export const constraintsSchema = z.object({
  maxEpisodes: z.number().int().positive().max(5000).optional(),
  genres: z.array(z.string().trim().min(1).max(100)).max(15).optional(),
  excludedGenres: z.array(z.string().trim().min(1).max(100)).max(15).optional(),
  standaloneOnly: z.boolean().optional(),
  finishedOnly: z.boolean().optional(),
  types: z.array(z.enum(['TV', 'Movie', 'OVA', 'ONA', 'Special', 'TV Special'])).max(6).optional(),
  excludedTypes: z.array(z.enum(['TV', 'Movie', 'OVA', 'ONA', 'Special', 'TV Special'])).max(6).optional(),
}).strict();
export type Constraints = z.infer<typeof constraintsSchema>;
export const generationSchema = z.object({
  mode: z.enum(['new', 'list']).default('new'),
  request: z.string().trim().max(1200).default(''),
  sessionPassIds: z.array(z.number().int().positive().max(2_147_483_647)).max(1000).default([]),
  requestId: z.string().uuid(),
  constraints: constraintsSchema.default({}),
}).strict();

export type Candidate = Anime & {
  year?: number | null;
  type?: string | null;
  relations?: { relation: string; entry: { mal_id: number; type: string; name?: string }[] }[];
  relationsVerified?: boolean;
  status?: string | null;
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
  if (context.constraints.finishedOnly && anime.status !== 'Finished Airing') return false;
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
    animeId: z.number().int().positive().max(2_147_483_647),
    reason: z.string().trim().min(1).max(600),
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
    ...(/\b(?:finished (?:series|anime|shows?)|completed (?:series|anime|shows?)|fully aired|finished airing|ended series)\b/i.test(request) ? { finishedOnly: true } : {}),
    ...(/\b(?:no|without|exclude|avoid)\s+(?:movies|films)\b/i.test(request) ? { excludedTypes: [...new Set([...(supplied.excludedTypes ?? []), 'Movie' as const])] } : {}),
    ...(/\b(?:only|must be)\s+(?:a\s+)?(?:movies?|films?)\b/i.test(request) ? { types: ['Movie' as const] } : {}),
  };
}

/** Round-robin the sources so broad popularity never buries explicit taste. */
export function mergeCandidateSources(sources: Candidate[][], limit = 60): Candidate[] {
  const seen = new Set<number>();
  const result: Candidate[] = [];
  for (let position = 0; result.length < limit && sources.some(source => position < source.length); position++) {
    for (const source of sources) {
      const candidate = source[position];
      if (!candidate || seen.has(candidate.mal_id)) continue;
      seen.add(candidate.mal_id); result.push(candidate);
      if (result.length >= limit) break;
    }
  }
  return result;
}

/** Bound a known franchise using anime relations, never title-name guesses. */
export function diverseCandidates(candidates: Candidate[], maximum = 18): Candidate[] {
  const parent = new Map<number, number>();
  const root = (id: number): number => {
    const next = parent.get(id);
    if (next === undefined || next === id) return id;
    const found = root(next); parent.set(id, found); return found;
  };
  for (const candidate of candidates) {
    for (const relation of candidate.relations ?? []) {
      if (!['Prequel', 'Sequel', 'Parent story', 'Full story', 'Side story', 'Spin-off', 'Alternative version'].includes(relation.relation)) continue;
      for (const entry of relation.entry) {
        if (entry.type !== 'anime') continue;
        const left = root(candidate.mal_id); const right = root(entry.mal_id);
        if (left !== right) parent.set(Math.max(left, right), Math.min(left, right));
      }
    }
  }
  const counts = new Map<number, number>(); const seen = new Set<number>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.mal_id)) return false;
    seen.add(candidate.mal_id);
    const family = root(candidate.mal_id); const count = counts.get(family) ?? 0;
    if (count >= 2) return false;
    counts.set(family, count + 1); return true;
  }).slice(0, maximum);
}
