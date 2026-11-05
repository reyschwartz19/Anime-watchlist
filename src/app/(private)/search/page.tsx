import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { searchAnime } from '@/lib/providers';
import { AnimeCard } from '@/features/library/AnimeCard';
import { toAnimeView, type Anime } from '@/features/library/model';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  let results: Anime[] = [];
  let error = '';
  if (query.length > 300) error = 'Use a search phrase of 300 characters or fewer.';
  else if (query) {
    try { results = await searchAnime(query); }
    catch { error = 'The anime catalog could not be reached. Try this search again.'; }
  }
  const entries = results.length ? await getDb().libraryEntry.findMany({
    where: { userId: user.id, deletedAt: null, animeId: { in: results.map((anime) => anime.mal_id) } },
    select: { animeId: true, status: true },
  }) : [];
  const statuses = new Map(entries.map((entry) => [entry.animeId, entry.status]));

  return <section className="stack">
    <h1>Search anime</h1>
    <form className="panel stack" action="/search" method="get">
      <label htmlFor="anime-query">Title</label>
      <div className="row"><input id="anime-query" type="search" name="q" autoComplete="off" maxLength={300} defaultValue={query} placeholder="For example, Mushi-Shi…" required /><button className="button primary" type="submit">Search</button></div>
    </form>
    {error ? <p role="alert">{error}</p> : query && results.length === 0 ? <p>No results found. Try a different title.</p> : null}
    {results.length ? <div className="anime-grid">{results.map((anime) => <AnimeCard key={anime.mal_id} anime={toAnimeView(anime, anime.mal_id)} currentStatus={statuses.get(anime.mal_id)} />)}</div> : null}
  </section>;
}
