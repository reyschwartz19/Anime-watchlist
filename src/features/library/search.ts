import { z } from 'zod';
import type { AnimeView, LibraryStatus } from './model';

export const catalogSearchInput = z.object({
  query: z.string().trim().max(200),
  page: z.number().int().min(1).max(1000).default(1),
}).strict();

export type SearchResult =
  | { ok: true; query: string; items: { anime: AnimeView; status?: LibraryStatus }[]; page: number; hasNextPage: boolean; total: number | null }
  | { ok: false; message: string };

export function searchPath(query: string, page = 1): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (page > 1) params.set('page', String(page));
  return `/search${params.size ? `?${params}` : ''}`;
}
