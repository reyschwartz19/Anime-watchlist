import { z } from 'zod';

export const STATUSES = ['watching', 'plan_to_watch', 'completed', 'dropped'] as const;
export type LibraryStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<LibraryStatus, string> = {
  watching: 'Watching',
  plan_to_watch: 'Plan to watch',
  completed: 'Completed',
  dropped: 'Dropped',
};

export const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery',
  'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Isekai', 'Mecha',
] as const;

const webUrl = z.string().url().refine((value) => /^https?:\/\//i.test(value), 'Use an HTTP or HTTPS URL.');
export const animeSchema = z.object({
  mal_id: z.number().int().positive().max(2_147_483_647),
  title: z.string().min(1).max(1000),
  images: z.object({ jpg: z.object({ image_url: webUrl, large_image_url: webUrl }) }),
  synopsis: z.string().max(100_000).nullish().transform((value) => value ?? ''),
  episodes: z.number().int().nonnegative().nullable().optional(),
  score: z.number().min(0).max(10).nullable().optional(),
  genres: z.array(z.object({ name: z.string().max(200) })).nullish().transform((value) => value ?? []),
});
export type Anime = z.infer<typeof animeSchema>;

export const animeIdSchema = z.number().int().positive().max(2_147_483_647);
export const statusSchema = z.enum(STATUSES);
export const saveLibraryInput = z.object({ animeId: animeIdSchema, status: statusSchema }).strict();
export const removeLibraryInput = z.object({ animeId: animeIdSchema }).strict();
export const feedbackInput = z.object({ animeId: animeIdSchema, value: z.enum(['like', 'dislike']).nullable() }).strict();
export const profileInput = z.object({
  displayName: z.string().trim().max(200).nullable(),
  photoURL: z.union([webUrl, z.literal(''), z.null()]),
  interests: z.array(z.string().min(1).max(200)).max(400),
  favoriteAnimes: z.array(z.string().min(1).max(1000)).max(1000),
  completeOnboarding: z.boolean(),
}).strict();

export type ProfileDraft = z.infer<typeof profileInput>;
export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export interface AnimeView {
  mal_id: number;
  title: string;
  imageUrl: string | null;
  synopsis: string;
}

/** A display projection only. Imported raw data is never rewritten by this fallback. */
export function toAnimeView(value: unknown, animeId: number): AnimeView {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const images = object.images && typeof object.images === 'object' ? object.images as Record<string, unknown> : {};
  const jpg = images.jpg && typeof images.jpg === 'object' ? images.jpg as Record<string, unknown> : {};
  const candidate = typeof jpg.large_image_url === 'string' ? jpg.large_image_url : jpg.image_url;
  const imageUrl = typeof candidate === 'string' && webUrl.safeParse(candidate).success ? candidate : null;
  return {
    mal_id: animeId,
    title: typeof object.title === 'string' && object.title.trim() ? object.title : `Anime #${animeId}`,
    imageUrl,
    synopsis: typeof object.synopsis === 'string' ? object.synopsis : '',
  };
}

export function toStatus(value: unknown): LibraryStatus | undefined {
  const parsed = statusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
