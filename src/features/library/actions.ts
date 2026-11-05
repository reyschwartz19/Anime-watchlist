'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getAnimeMetadata, ProviderError } from '@/lib/providers';
import { enforceUserLimit, RateLimitError } from '@/lib/rate-limit';
import { profileInput, removeLibraryInput, saveLibraryInput, type ActionResult } from './model';

function refreshLibrary() {
  revalidatePath('/library');
  revalidatePath('/search');
  revalidatePath('/recommendations');
}

export async function saveAnime(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = saveLibraryInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose a valid anime and library status.' };
  const { animeId, status } = parsed.data;
  try {
    await enforceUserLimit(user.id, 'mutation');
    const db = getDb();
    const existing = await db.libraryEntry.findUnique({ where: { userId_animeId: { userId: user.id, animeId } } });
    if (existing) {
      // Do not replace imported metadata, addedAt, original values, or legacy progress.
      await db.libraryEntry.update({
        where: { userId_animeId: { userId: user.id, animeId } },
        data: { status, editedAt: new Date(), deletedAt: null },
      });
    } else {
      const anime = await getAnimeMetadata(animeId);
      if (!anime || anime.mal_id !== animeId) return { ok: false, message: 'The anime catalog could not load this title. Try saving it again.' };
      const editedAt = new Date();
      await db.libraryEntry.upsert({
        where: { userId_animeId: { userId: user.id, animeId } },
        create: { userId: user.id, animeId, status, anime, addedAt: editedAt, editedAt },
        update: { status, editedAt, deletedAt: null },
      });
    }
    refreshLibrary();
    return { ok: true, message: 'Library updated.' };
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof ProviderError) return { ok: false, message: error.message };
    return { ok: false, message: 'Your change was not saved. Your previous library state is still available; try again.' };
  }
}

export async function removeAnime(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = removeLibraryInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose a valid anime to remove.' };
  try {
    await enforceUserLimit(user.id, 'mutation');
    const now = new Date();
    // Keep a tombstone so replaying the importer cannot resurrect a later removal.
    await getDb().libraryEntry.updateMany({
      where: { userId: user.id, animeId: parsed.data.animeId, deletedAt: null },
      data: { deletedAt: now, editedAt: now },
    });
    refreshLibrary();
    return { ok: true, message: 'Removed from your library.' };
  } catch (error) {
    if (error instanceof RateLimitError) return { ok: false, message: error.message };
    return { ok: false, message: 'The title was not removed. Try again.' };
  }
}

export async function saveProfile(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Check your profile fields and try again.' };
  const data = parsed.data;
  if (data.completeOnboarding && data.interests.length === 0) {
    return { ok: false, message: 'Choose at least one interest to finish onboarding.' };
  }
  try {
    await enforceUserLimit(user.id, 'mutation');
    await getDb().appUser.update({
      where: { id: user.id },
      data: {
        ...(data.section !== 'taste' ? { displayName: data.displayName || null, photoURL: data.photoURL || null } : {}),
        ...(data.section !== 'identity' ? { interests: data.interests, favoriteAnimes: data.favoriteAnimes } : {}),
        ...(data.completeOnboarding ? { onboarded: true } : {}),
        profileEditedAt: new Date(),
      },
    });
    revalidatePath('/profile');
    revalidatePath('/onboarding');
    revalidatePath('/recommendations');
    return { ok: true, message: 'Your preferences are saved.' };
  } catch (error) {
    if (error instanceof RateLimitError) return { ok: false, message: error.message };
    return { ok: false, message: 'Your preferences were not saved. Keep this page open and try again.' };
  }
}
