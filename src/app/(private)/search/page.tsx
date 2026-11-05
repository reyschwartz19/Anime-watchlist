import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search, ChevronRight, Check } from 'lucide-react';
import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { searchAnime } from '@/lib/providers';
import { Poster } from '@/features/library/Poster';
import { RecentSearches } from '@/features/library/RecentSearches';
import { STATUS_LABELS, toAnimeView, type Anime } from '@/features/library/model';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  let results: Anime[] = [];
  let error = '';
  if (query.length > 300) error = 'Use a search phrase of 300 characters or fewer.';
  else if (query) {
    try { results = await searchAnime(query); }
    catch { error = 'The anime catalog is unavailable. Your search is still here. Try again.'; }
  }
  const entries = results.length ? await getDb().libraryEntry.findMany({ where: { userId: user.id, deletedAt: null, animeId: { in: results.map(anime => anime.mal_id) } }, select: { animeId: true, status: true } }) : [];
  const statuses = new Map(entries.map(entry => [entry.animeId, entry.status]));
  return <section className="stack reading-column">
    <h1>Search</h1>
    <form className="stack" action="/search" method="get">
      <label htmlFor="anime-query">Find a title</label>
      <div className="row"><input id="anime-query" type="search" name="q" autoComplete="off" maxLength={300} defaultValue={query} placeholder="For example, Samurai Champloo…" /><button className="primary" type="submit"><Search size={20} aria-hidden="true" />Search</button>{query && <Link href="/search">Clear</Link>}</div>
    </form>
    <RecentSearches query={query} userId={user.id} />
    {error ? <div className="notice stack" role="alert"><p>{error}</p><Link href={`/search?q=${encodeURIComponent(query)}`}>Retry search</Link></div> : query && results.length === 0 ? <div className="empty-state"><h2>No matching titles</h2><p>Try a shorter title or another spelling.</p></div> : !query ? <p className="muted">Search by anime title. Open a result to see its story and save it to your shelf.</p> : null}
    {results.length > 0 && <><p className="muted">{results.length} matches for “{query}”</p><div className="search-results">{results.map(anime => <Link className="search-result" key={anime.mal_id} href={`/anime/${anime.mal_id}?from=${encodeURIComponent(`/search?q=${encodeURIComponent(query)}`)}`}>
      <div className="search-cover"><Poster anime={toAnimeView(anime, anime.mal_id)} /></div><div className="result-copy"><p className="muted">{[anime.year, anime.type].filter(Boolean).join(' · ') || 'Anime'}</p><h2>{anime.title}</h2>{statuses.has(anime.mal_id) && <p><Check size={16} aria-hidden="true" /> {STATUS_LABELS[statuses.get(anime.mal_id)!]}</p>}</div><ChevronRight size={24} aria-hidden="true" />
    </Link>)}</div></>}
  </section>;
}
