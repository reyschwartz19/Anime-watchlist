'use server';

import { requireUser } from '@/lib/current-user';
import { ProviderError, searchAnime } from '@/lib/providers';
import { enforceUserLimit, RateLimitError } from '@/lib/rate-limit';
import { toAnimeView } from './model';

export async function searchFavorites(query: string) {
  const user = await requireUser();
  if (typeof query !== 'string' || query.trim().length > 200) return { ok: false as const, message: 'Use a favorite title of 200 characters or fewer.' };
  const value = query.trim();
  try {
    await enforceUserLimit(user.id, 'catalog');
    const items = await searchAnime(value);
    return { ok: true as const, items: items.map((anime) => ({
      mal_id: anime.mal_id,
      title: anime.title,
      alternateTitle: toAnimeView(anime, anime.mal_id).alternateTitle,
      imageUrl: toAnimeView(anime, anime.mal_id).imageUrl,
      year: 'year' in anime && typeof anime.year === 'number' ? anime.year : null,
      type: 'type' in anime && typeof anime.type === 'string' ? anime.type : null,
    })) };
  } catch (error) {
    if (error instanceof ProviderError || error instanceof RateLimitError) return { ok: false as const, message: error.message };
    return { ok: false as const, message: 'The catalog is unavailable. Your selected favorites are safe. Try the search again.' };
  }
}
