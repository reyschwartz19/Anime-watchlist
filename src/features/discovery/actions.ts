'use server';

import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { recommendAnime } from '@/lib/providers';
import { toAnimeView, type AnimeView, type LibraryStatus } from '@/features/library/model';

export interface RecommendationView {
  anime: AnimeView;
  reason: string;
  currentStatus?: LibraryStatus;
  feedback: 'like' | 'dislike' | null;
}

export async function generateRecommendations(): Promise<
  { ok: true; recommendations: RecommendationView[] } | { ok: false; message: string }
> {
  const user = await requireUser();
  try {
    const db = getDb();
    const [library, preferences] = await Promise.all([
      db.libraryEntry.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: [{ addedAt: 'desc' }, { animeId: 'asc' }] }),
      db.feedback.findMany({ where: { userId: user.id } }),
    ]);
    const byId = new Map(library.map((entry) => [entry.animeId, entry]));
    const feedback = preferences.map((entry) => ({
      animeId: entry.animeId,
      value: entry.value,
      title: toAnimeView(byId.get(entry.animeId)?.anime, entry.animeId).title,
    }));
    const history = library
      .filter((entry) => entry.status === 'watching' || entry.status === 'completed')
      .slice(0, 10)
      .map((entry) => toAnimeView(entry.anime, entry.animeId).title);
    const picks = await recommendAnime({ interests: user.interests, favoriteAnimes: user.favoriteAnimes, history, feedback });
    const seen = new Set<number>();
    const values = new Map(preferences.map((entry) => [entry.animeId, entry.value]));
    const recommendations: RecommendationView[] = [];
    for (const pick of picks) {
      if (seen.has(pick.anime.mal_id)) continue;
      seen.add(pick.anime.mal_id);
      recommendations.push({
        anime: toAnimeView(pick.anime, pick.anime.mal_id),
        reason: pick.reason,
        currentStatus: byId.get(pick.anime.mal_id)?.status,
        feedback: values.get(pick.anime.mal_id) ?? null,
      });
    }
    if (!recommendations.length) return { ok: false, message: 'No recommendations are available right now. Try again or search for a title.' };
    return { ok: true, recommendations };
  } catch {
    return { ok: false, message: 'Recommendations could not be loaded. Your list is unchanged. Try again or use search.' };
  }
}
