import { z } from 'zod';
import { animeIdSchema } from '@/features/library/model';

export const viewingNotesSchema = z.object({
  animeId: animeIdSchema,
  value: z.enum(['like', 'dislike']).nullable(),
  reason: z.string().trim().max(1600),
  likedAspects: z.string().trim().max(800),
  dislikedAspects: z.string().trim().max(800),
  visualStyle: z.string().trim().max(400),
}).strict();
export type ViewingNotes = Omit<z.infer<typeof viewingNotesSchema>, 'animeId'>;
export const emptyViewingNotes: ViewingNotes = { value: null, reason: '', likedAspects: '', dislikedAspects: '', visualStyle: '' };
