export interface FavoriteTitle { animeId: number | null; title: string }

/** Legacy title strings stay readable; new choices retain their catalog identity. */
export function parseFavorite(value: string): FavoriteTitle {
  const match = /^mal:(\d+)\|(.+)$/s.exec(value);
  if (match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) > 0 && Number(match[1]) <= 2_147_483_647) {
    return { animeId: Number(match[1]), title: match[2] };
  }
  return { animeId: null, title: value };
}

export function serializeFavorite(animeId: number, title: string): string {
  return `mal:${animeId}|${title}`;
}
