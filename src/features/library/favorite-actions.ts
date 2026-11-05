'use server';

import { requireUser } from '@/lib/current-user';
import { searchAnime } from '@/lib/providers';
import { toAnimeView } from './model';

export async function searchFavorites(query: string) {
  await requireUser();
  const value = typeof query === 'string' ? query.trim().slice(0, 200) : '';
  try {
    const items = await searchAnime(value);
    return { ok: true as const, items: items.map((anime) => ({
      mal_id: anime.mal_id,
      title: anime.title,
      imageUrl: toAnimeView(anime, anime.mal_id).imageUrl,
      year: 'year' in anime && typeof anime.year === 'number' ? anime.year : null,
      type: 'type' in anime && typeof anime.type === 'string' ? anime.type : null,
    })) };
  } catch {
    return { ok: false as const, message: 'The catalog is unavailable. Your selected favorites are safe. Try the search again.' };
  }
}
