import type { VerifiedAuthSession } from './auth-session';
import type { Anime } from '@/features/library/model';

/** Deliberately unavailable in production, including production Vercel builds. */
export function previewEnabled(): boolean {
  return process.env.ANIME_PREVIEW_FIXTURES === '1' &&
    ['development', 'test'].includes(process.env.NODE_ENV ?? '') &&
    process.env.VERCEL_ENV !== 'production';
}

function fixtureCookie(cookie: string | null | undefined, name: string): string | undefined {
  return cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function fixtureUserKey(cookie?: string | null): 'viewer' | 'new' | 'second' | 'anonymous' {
  const value = fixtureCookie(cookie, 'anime_preview_user');
  return value === 'new' || value === 'second' || value === 'anonymous' ? value : 'viewer';
}

export function previewFailure(cookie?: string | null): 'catalog' | 'model' | 'profile' | null {
  if (!previewEnabled()) return null;
  if (fixtureCookie(cookie, 'anime_preview_user') === 'profile-error') return 'profile';
  const value = fixtureCookie(cookie, 'anime_preview_failure');
  return value === 'catalog' || value === 'model' || value === 'profile' ? value : null;
}

export function previewIdentity(cookie?: string | null): VerifiedAuthSession | null {
  if (!previewEnabled()) return null;
  const key = fixtureUserKey(cookie);
  if (key === 'anonymous') return null;
  return {
    id: `fixture-${key}`, email: `${key}@example.test`,
    name: key === 'new' ? 'Remy' : key === 'second' ? 'Second viewer' : 'Remy',
    image: null, emailVerified: true,
  };
}

/** Actual catalog identities; copy and artwork are isolated review fixtures. */
export function fixtureCatalog(): Anime[] {
  if (!previewEnabled()) throw new Error('Preview fixtures are disabled.');
  const works: [number, string, number, number, string[]][] = [
    [205, 'Samurai Champloo', 2004, 26, ['Action', 'Adventure']],
    [1535, 'Death Note', 2006, 37, ['Mystery', 'Supernatural', 'Thriller']],
    [52991, 'Frieren: Beyond Journey’s End', 2023, 28, ['Adventure', 'Drama', 'Fantasy']],
    [1, 'Cowboy Bebop', 1998, 26, ['Action', 'Sci-Fi']],
    [457, 'Mushi-Shi', 2005, 26, ['Mystery', 'Supernatural', 'Slice of Life']],
    [20, 'Naruto', 2002, 220, ['Action', 'Adventure']],
    [5114, 'Fullmetal Alchemist: Brotherhood', 2009, 64, ['Action', 'Adventure', 'Fantasy']],
    [9253, 'Steins;Gate', 2011, 24, ['Drama', 'Sci-Fi', 'Thriller']],
    [30276, 'One Punch Man', 2015, 12, ['Action', 'Comedy']],
    [38000, 'Demon Slayer: Kimetsu no Yaiba', 2019, 26, ['Action', 'Fantasy']],
    [16498, 'Attack on Titan', 2013, 25, ['Action', 'Drama']],
    [1575, 'Code Geass: Lelouch of the Rebellion', 2006, 25, ['Action', 'Drama', 'Mecha']],
  ];
  const origin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
  return works.map(([mal_id, title, year, episodes, genres]) => ({
    mal_id, title, year, type: 'TV', episodes, score: 8.5,
    images: { jpg: { image_url: `${origin}/preview/poster.svg?title=${encodeURIComponent(title)}`, large_image_url: `${origin}/preview/poster.svg?title=${encodeURIComponent(title)}` } },
    synopsis: `${title} is part of the isolated Manga Shelf review catalog. This synopsis is sample copy for testing layout and recovery; open the live catalog after configuring the preview providers for verified metadata.`,
    genres: genres.map(name => ({ name })), relations: [],
  }));
}
