'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { feedbackInput, type ActionResult } from '@/features/library/model';

export async function setFeedback(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = feedbackInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose valid feedback for this anime.' };
  const { animeId, value } = parsed.data;
  try {
    if (value === null) {
      await getDb().feedback.deleteMany({ where: { userId: user.id, animeId } });
    } else {
      await getDb().feedback.upsert({
        where: { userId_animeId: { userId: user.id, animeId } },
        create: { userId: user.id, animeId, value },
        update: { value },
      });
    }
    revalidatePath('/recommendations');
    return { ok: true, message: value === null ? 'Feedback cleared.' : 'Feedback saved for future recommendations.' };
  } catch {
    return { ok: false, message: 'Feedback was not saved. Try again.' };
  }
}
