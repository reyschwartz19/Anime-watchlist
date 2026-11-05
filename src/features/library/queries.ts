import 'server-only';

import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { STATUSES, toAnimeView, type LibraryStatus } from './model';

export async function getLibrary() {
  const user = await requireUser();
  const [entries, notes] = await Promise.all([getDb().libraryEntry.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ addedAt: 'desc' }, { animeId: 'asc' }],
  }), getDb().feedback.findMany({ where: { userId: user.id } })]);
  const byId = new Map(notes.map(note => [note.animeId, [note.reason, note.likedAspects, note.dislikedAspects, note.visualStyle].filter(Boolean).join(' ')]));
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<LibraryStatus, number>;
  for (const entry of entries) counts[entry.status] += 1;
  return {
    counts,
    entries: entries.map((entry) => ({ anime: toAnimeView(entry.anime, entry.animeId), status: entry.status, notes: byId.get(entry.animeId) ?? '' })),
  };
}
