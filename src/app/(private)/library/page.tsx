import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search } from 'lucide-react';
import { requireUser } from '@/lib/current-user';
import { getLibrary } from '@/features/library/queries';
import { AnimeCard } from '@/features/library/AnimeCard';
import { STATUSES, STATUS_LABELS, toStatus } from '@/features/library/model';

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  const [{ entries, counts }, params] = await Promise.all([getLibrary(), searchParams]);
  const active = toStatus(params.status) ?? 'all';
  const query = typeof params.q === 'string' ? params.q.slice(0, 300) : '';
  const visible = entries.filter(entry => (active === 'all' || entry.status === active) && entry.anime.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const returnTo = `/library?${new URLSearchParams({ status: active, ...(query ? { q: query } : {}) })}`;
  return <section className="stack library-page">
    <header className="row"><h1>My List</h1><p className="muted">{visible.length} {visible.length === 1 ? 'title' : 'titles'}</p></header>
    <nav className="status-tabs" aria-label="Library status">
      <Link href={`/library?${new URLSearchParams({ status: 'all', q: query })}`} aria-current={active === 'all' ? 'page' : undefined}>All ({entries.length})</Link>
      {STATUSES.map(status => <Link key={status} href={`/library?${new URLSearchParams({ status, q: query })}`} aria-current={active === status ? 'page' : undefined}>{STATUS_LABELS[status]} ({counts[status]})</Link>)}
    </nav>
    <form action="/library" method="get" className="row">
      <input type="hidden" name="status" value={active} />
      <label className="sr-only" htmlFor="list-query">Search my list</label>
      <input id="list-query" type="search" name="q" autoComplete="off" maxLength={300} defaultValue={query} placeholder="Search my list…" />
      <button type="submit"><Search size={20} aria-hidden="true" />Search</button>
    </form>
    {visible.length ? <div className="shelf-grid">{visible.map(entry => <AnimeCard key={entry.anime.mal_id} anime={entry.anime} currentStatus={entry.status} returnTo={returnTo} />)}</div> : <div className="empty-state">
      <h2>{entries.length ? 'No matching titles' : 'Your next story starts here'}</h2>
      <p>{entries.length ? 'Try another title or clear your filters.' : 'Save a discovery or search for something you already have in mind.'}</p>
      <div className="row">{entries.length ? <Link className="button" href="/library?status=all">Clear filters</Link> : <Link className="button primary" href="/search">Find anime</Link>}<Link href="/recommendations">Discover a new pick</Link></div>
    </div>}
  </section>;
}
