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
  title_english: z.string().max(1000).nullish(),
  title_japanese: z.string().max(1000).nullish(),
  titles: z.array(z.object({ type: z.string().max(100), title: z.string().max(1000) })).optional(),
  images: z.object({ jpg: z.object({ image_url: webUrl.nullish(), large_image_url: webUrl.nullish() }) }),
  synopsis: z.string().max(100_000).nullish().transform((value) => value ?? ''),
  episodes: z.number().int().nonnegative().nullable().optional(),
  score: z.number().min(0).max(10).nullable().optional(),
  year: z.number().int().nullable().optional(),
  type: z.string().nullable().optional(),
  status: z.string().max(100).nullish(),
  studios: z.array(z.object({ name: z.string().max(200) })).max(30).optional(),
  source: z.string().max(100).nullish(),
  relations: z.array(z.object({ relation: z.string(), entry: z.array(z.object({ mal_id: z.number().int(), type: z.string().optional(), name: z.string().optional() })) })).optional(),
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
  section: z.enum(['identity', 'taste']).optional(),
}).strict();

export type ProfileDraft = z.infer<typeof profileInput>;
export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export interface AnimeView {
  mal_id: number;
  title: string;
  imageUrl: string | null;
  synopsis: string;
  year?: number | null;
  type?: string | null;
  episodes?: number | null;
  genres?: string[];
  alternateTitle?: string;
}

/** A display projection only. Imported raw data is never rewritten by this fallback. */
export function toAnimeView(value: unknown, animeId: number): AnimeView {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const images = object.images && typeof object.images === 'object' ? object.images as Record<string, unknown> : {};
  const jpg = images.jpg && typeof images.jpg === 'object' ? images.jpg as Record<string, unknown> : {};
  const candidate = typeof jpg.large_image_url === 'string' ? jpg.large_image_url : jpg.image_url;
  const validImage = typeof candidate === 'string' && webUrl.safeParse(candidate).success ? candidate : null;
  // The owner requested original catalog covers. Missing/broken images get a
  // bounded fallback; the old environment gate no longer hides valid artwork.
  const imageUrl = validImage;
  return {
    mal_id: animeId,
    title: typeof object.title === 'string' && object.title.trim() ? object.title : `Anime #${animeId}`,
    ...(typeof object.title_english === 'string' && object.title_english.trim() && object.title_english !== object.title
      ? { alternateTitle: object.title_english }
      : typeof object.title_japanese === 'string' && object.title_japanese.trim() && object.title_japanese !== object.title
        ? { alternateTitle: object.title_japanese } : {}),
    imageUrl,
    synopsis: typeof object.synopsis === 'string' ? object.synopsis : '',
    year: typeof object.year === 'number' ? object.year : null,
    type: typeof object.type === 'string' ? object.type : null,
    episodes: typeof object.episodes === 'number' ? object.episodes : null,
    genres: Array.isArray(object.genres) ? object.genres.flatMap((genre) => genre && typeof genre === 'object' && typeof genre.name === 'string' ? [genre.name] : []) : [],
  };
}

export function toStatus(value: unknown): LibraryStatus | undefined {
  const parsed = statusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
