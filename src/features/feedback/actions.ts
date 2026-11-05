'use server';

import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { feedbackInput, type ActionResult } from '@/features/library/model';

const actionInput = z.object({
  requestId: z.string().uuid(), animeId: z.number().int().positive(),
  action: z.enum(['save', 'watched', 'not_interested', 'strong_dismiss', 'not_tonight']),
  reason: z.string().trim().max(1200).optional(), operationId: z.string().uuid(),
}).strict();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function refreshRecommendations() {
  for (const path of ['/library', '/profile', '/recommendations', '/search']) revalidatePath(path);
}

export async function actOnRecommendation(input: unknown): Promise<ActionResult & { undoToken?: string }> {
  const user = await requireUser();
  const parsed = actionInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose a valid action for this recommendation.' };
  const data = parsed.data;
  try {
    const result = await getDb().$transaction(async (tx) => {
      const existing = await tx.recommendationEvent.findFirst({ where: { id: data.operationId, userId: user.id } });
      if (existing) {
        if (existing.batchId !== data.requestId || existing.animeId !== data.animeId || existing.action !== data.action) throw new Error('Mismatched retry');
        return { alreadyUndone: !!existing.undoneAt };
      }
      const batch = await tx.recommendationBatch.findFirst({ where: { id: data.requestId, userId: user.id } });
      const picks = Array.isArray(batch?.picks) ? batch.picks : [];
      const pick = picks.find((value) => value && typeof value === 'object' && 'anime' in value && (value.anime as { mal_id?: number } | null)?.mal_id === data.animeId) as { anime: Prisma.InputJsonValue } | undefined;
      if (!batch || !pick) throw new Error('Pick does not belong to this user or batch');
      const key = { userId_animeId: { userId: user.id, animeId: data.animeId } };
      const [beforeLibrary, beforeFeedback] = await Promise.all([
        tx.libraryEntry.findUnique({ where: key }), tx.feedback.findUnique({ where: key }),
      ]);
      const now = new Date();
      if (data.action === 'save' || data.action === 'watched') {
        if (data.action === 'save' && beforeLibrary && !beforeLibrary.deletedAt && beforeLibrary.status !== 'plan_to_watch') {
          return { alreadyUndone: false, newerStatus: true };
        }
        const status = data.action === 'save' ? 'plan_to_watch' : 'completed';
        await tx.libraryEntry.upsert({ where: key,
          create: { userId: user.id, animeId: data.animeId, status, anime: pick.anime, addedAt: now, editedAt: now },
          update: { status, deletedAt: null, editedAt: now },
        });
      } else if (data.action !== 'not_tonight') {
        const title = (pick.anime as { title?: string }).title ?? `Anime #${data.animeId}`;
        // Strong dismissal does not silently create a genre or explicit dislike.
        await tx.feedback.upsert({ where: key,
          create: { userId: user.id, animeId: data.animeId, value: null, dismissal: data.action, dismissalReason: data.reason || null, title, updatedAt: now },
          update: { dismissal: data.action, dismissalReason: data.reason || null, title, updatedAt: now },
        });
      }
      await tx.recommendationEvent.create({ data: {
        id: data.operationId, userId: user.id, batchId: data.requestId, animeId: data.animeId,
        action: data.action, reason: data.reason || null, previousLibrary: json({ row: beforeLibrary }),
        previousFeedback: json({ row: beforeFeedback }), undoTokenHash: hash(data.operationId), createdAt: now,
      } });
      return { alreadyUndone: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    refreshRecommendations();
    if ('newerStatus' in result) return { ok: false, message: 'This title already has a newer library status. Open My List to review it; your current status is kept.' };
    return { ok: true, message: result.alreadyUndone ? 'This action has already been undone.' : data.action === 'save' ? 'Saved to Plan to Watch.' : data.action === 'watched' ? 'Marked Completed. You can add optional taste feedback.' : data.action === 'not_tonight' ? 'Passed for this session.' : 'Hidden from recommendations. Restore it in Profile.', ...(result.alreadyUndone ? {} : { undoToken: data.operationId }) };
  } catch {
    // A concurrent duplicate can lose a serializable transaction but its exact
    // committed operation is still safe to acknowledge on retry.
    const event = await getDb().recommendationEvent.findFirst({ where: { id: data.operationId, userId: user.id } }).catch(() => null);
    if (event && event.batchId === data.requestId && event.animeId === data.animeId && event.action === data.action) return { ok: true, message: event.undoneAt ? 'This action has already been undone.' : 'Your choice is saved.', ...(event.undoneAt ? {} : { undoToken: data.operationId }) };
    return { ok: false, message: 'Your choice was not saved. Keep this pick open and try again.' };
  }
}

function beforeRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || !('row' in value)) return null;
  return value.row && typeof value.row === 'object' ? value.row as Record<string, unknown> : null;
}

export async function undoRecommendation(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.object({ operationId: z.string().uuid(), undoToken: z.string().uuid() }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: 'This undo action is invalid.' };
  try {
    const outcome = await getDb().$transaction(async (tx) => {
      const event = await tx.recommendationEvent.findFirst({ where: { id: parsed.data.operationId, userId: user.id } });
      if (!event || event.undoTokenHash !== hash(parsed.data.undoToken)) throw new Error('Invalid owner or token');
      if (event.undoneAt) return 'already';
      const key = { userId_animeId: { userId: user.id, animeId: event.animeId } };
      if (event.action === 'save' || event.action === 'watched') {
        const current = await tx.libraryEntry.findUnique({ where: key });
        if (!current?.editedAt || current.editedAt.getTime() !== event.createdAt.getTime()) return 'newer';
        const before = beforeRow(event.previousLibrary);
        if (before) {
          await tx.libraryEntry.update({ where: key, data: { status: before.status as 'watching', deletedAt: before.deletedAt ? new Date(String(before.deletedAt)) : null, editedAt: new Date() } });
        } else {
          await tx.libraryEntry.update({ where: key, data: { deletedAt: new Date(), editedAt: new Date() } });
        }
      } else if (event.action !== 'not_tonight') {
        const current = await tx.feedback.findUnique({ where: key });
        if (!current || current.updatedAt.getTime() !== event.createdAt.getTime()) return 'newer';
        const before = beforeRow(event.previousFeedback);
        if (before) {
          await tx.feedback.update({ where: key, data: { value: before.value as 'like' | 'dislike' | null, dismissal: typeof before.dismissal === 'string' ? before.dismissal : null, dismissalReason: typeof before.dismissalReason === 'string' ? before.dismissalReason : null, reason: typeof before.reason === 'string' ? before.reason : null, title: typeof before.title === 'string' ? before.title : null } });
        } else await tx.feedback.deleteMany({ where: { userId: user.id, animeId: event.animeId } });
      }
      await tx.recommendationEvent.updateMany({ where: { id: event.id, userId: user.id }, data: { undoneAt: new Date() } });
      return 'undone';
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    refreshRecommendations();
    return outcome === 'newer' ? { ok: false, message: 'This title has a newer edit. Your newer choice has been kept.' } : { ok: true, message: outcome === 'already' ? 'This action is already undone.' : 'Undone. Your previous choice is restored.' };
  } catch {
    return { ok: false, message: 'This action could not be undone. Try again.' };
  }
}

export async function getHiddenTitles(): Promise<{ animeId: number; title: string; strength: string; reason: string | null }[]> {
  const user = await requireUser();
  const rows = await getDb().feedback.findMany({ where: { userId: user.id, dismissal: { not: null } }, orderBy: { updatedAt: 'desc' } });
  return rows.map((row) => ({ animeId: row.animeId, title: row.title || `Anime #${row.animeId}`, strength: row.dismissal!, reason: row.dismissalReason }));
}

export async function restoreHiddenTitle(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.object({ animeId: z.number().int().positive() }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose a valid hidden title.' };
  try {
    await getDb().feedback.updateMany({ where: { userId: user.id, animeId: parsed.data.animeId }, data: { dismissal: null, dismissalReason: null } });
    refreshRecommendations();
    return { ok: true, message: 'Restored. This title can appear in recommendations again.' };
  } catch { return { ok: false, message: 'This title could not be restored. Try again.' }; }
}

export async function setFeedback(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = feedbackInput.extend({
    reason: z.string().trim().max(1200).optional(),
    requestId: z.string().uuid().optional(), operationId: z.string().uuid().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose valid feedback for this anime.' };
  const { animeId, value, reason, requestId, operationId } = parsed.data;
  if (!!requestId !== !!operationId) return { ok: false, message: 'This feedback is missing its recommendation context. Try again.' };
  try {
    if (requestId && operationId) {
      await getDb().$transaction(async (tx) => {
        const prior = await tx.recommendationEvent.findFirst({ where: { id: operationId, userId: user.id } });
        const eventAction = value ? `taste_${value}` : 'taste_clear';
        if (prior) {
          if (prior.batchId !== requestId || prior.animeId !== animeId || prior.action !== eventAction) throw new Error('Mismatched retry');
          return;
        }
        const batch = await tx.recommendationBatch.findFirst({ where: { id: requestId, userId: user.id } });
        const picks = Array.isArray(batch?.picks) ? batch.picks : [];
        const pick = picks.find((pick) => pick && typeof pick === 'object' && 'anime' in pick && (pick.anime as { mal_id?: number } | null)?.mal_id === animeId);
        if (!batch || !pick) throw new Error('Invalid pick');
        const title = ((pick as { anime: { title?: string } }).anime).title ?? `Anime #${animeId}`;
        const key = { userId_animeId: { userId: user.id, animeId } };
        const before = await tx.feedback.findUnique({ where: key });
        await tx.feedback.upsert({ where: key, create: { userId: user.id, animeId, value, reason: value === null ? null : reason || null, title }, update: { value, title, ...(value === null ? { reason: null } : reason === undefined ? {} : { reason: reason || null }) } });
        await tx.recommendationEvent.create({ data: { id: operationId, userId: user.id, batchId: requestId, animeId, action: eventAction, reason: reason || null, previousFeedback: json({ row: before }) } });
      });
    } else if (value === null) {
      // Keep an independent permanent dismissal when clearing explicit taste.
      // The original no-context API remains supported for existing controls.
      const current = await getDb().feedback.findUnique({ where: { userId_animeId: { userId: user.id, animeId } } });
      if (current?.dismissal) await getDb().feedback.updateMany({ where: { userId: user.id, animeId }, data: { value: null, reason: null } });
      else await getDb().feedback.deleteMany({ where: { userId: user.id, animeId } });
    } else {
      await getDb().feedback.upsert({
        where: { userId_animeId: { userId: user.id, animeId } },
        create: { userId: user.id, animeId, value, ...(reason === undefined ? {} : { reason: reason || null }) },
        update: { value, ...(reason === undefined ? {} : { reason: reason || null }) },
      });
    }
    revalidatePath('/recommendations');
    return { ok: true, message: value === null ? 'Feedback cleared.' : 'Feedback saved for future recommendations.' };
  } catch {
    return { ok: false, message: 'Feedback was not saved. Try again.' };
  }
}

// Recommendation outcomes are recorded separately from explicit taste and
// library status. All operations derive ownership from the verified session.
