'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { enforceUserLimit, RateLimitError } from '@/lib/rate-limit';
import { toAnimeView, type ActionResult } from '@/features/library/model';
import { viewingNotesSchema } from './notes-model';

export async function saveViewingNotes(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = viewingNotesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Keep your notes within the limits shown and try again.' };
  const { animeId, ...notes } = parsed.data;
  try {
    await enforceUserLimit(user.id, 'mutation');
    const db = getDb();
    const entry = await db.libraryEntry.findFirst({ where: { userId: user.id, animeId, deletedAt: null } });
    if (!entry || entry.status === 'plan_to_watch') return { ok: false, message: 'Mark this title Watching, Completed, or Dropped before adding viewing notes.' };
    const data = { ...notes, reason: notes.reason || null, likedAspects: notes.likedAspects || null, dislikedAspects: notes.dislikedAspects || null, visualStyle: notes.visualStyle || null };
    await db.feedback.upsert({
      where: { userId_animeId: { userId: user.id, animeId } },
      create: { userId: user.id, animeId, title: toAnimeView(entry.anime, animeId).title, ...data },
      update: data,
    });
    for (const path of [`/anime/${animeId}`, '/library', '/recommendations', '/profile']) revalidatePath(path);
    return { ok: true, message: 'Notes saved. Your next picks will take them into account.' };
  } catch (problem) { return { ok: false, message: problem instanceof RateLimitError ? problem.message : 'Your notes could not be saved. They are still here; try again.' }; }
}
