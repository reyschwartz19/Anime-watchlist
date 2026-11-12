'use server';

import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ProviderError, searchAnimePage } from '@/lib/providers';
import { enforceUserLimit, RateLimitError } from '@/lib/rate-limit';
import { toAnimeView } from './model';
import { catalogSearchInput, type SearchResult } from './search';

export async function searchCatalog(input: unknown): Promise<SearchResult> {
  const user = await requireUser();
  const parsed = catalogSearchInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Use a title of 200 characters or fewer and a page between 1 and 1000.' };
  const { query, page } = parsed.data;
  if (!query) return { ok: true, query, items: [], page: 1, hasNextPage: false, total: 0 };
  try {
    await enforceUserLimit(user.id, 'catalog');
    const result = await searchAnimePage(query, page);
    const entries = result.items.length ? await getDb().libraryEntry.findMany({
      where: { userId: user.id, deletedAt: null, animeId: { in: result.items.map(anime => anime.mal_id) } },
      select: { animeId: true, status: true },
    }) : [];
    const statuses = new Map(entries.map(entry => [entry.animeId, entry.status]));
    return {
      ok: true, query, page: result.pagination.currentPage,
      hasNextPage: result.pagination.hasNextPage, total: result.pagination.total,
      items: result.items.map(anime => ({ anime: toAnimeView(anime, anime.mal_id), status: statuses.get(anime.mal_id) })),
    };
  } catch (error) {
    return { ok: false, message: error instanceof ProviderError || error instanceof RateLimitError
      ? error.message : 'The anime catalog is unavailable. Your search is still here. Try again.' };
  }
}
