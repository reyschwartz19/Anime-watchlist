import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/current-user';
import { getLibrary } from '@/features/library/queries';
import { AnimeCard } from '@/features/library/AnimeCard';
import { STATUSES, STATUS_LABELS, toStatus } from '@/features/library/model';

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  const [{ entries, counts }, params] = await Promise.all([getLibrary(), searchParams]);
  const requested = typeof params.status === 'string' ? params.status : undefined;
  const active = requested === 'all' ? 'all' : toStatus(requested) ?? 'watching';
  const visible = active === 'all' ? entries : entries.filter((entry) => entry.status === active);

  return <section className="stack">
    <div className="row wrap"><h1>My List</h1><Link href="/recommendations">Get recommendations</Link><Link href="/search">Search anime</Link></div>
    <nav className="row wrap" aria-label="Library status">
      {STATUSES.map((status) => <Link className="button" key={status} href={`/library?status=${status}`} aria-current={active === status ? 'page' : undefined}>{STATUS_LABELS[status]} ({counts[status]})</Link>)}
      <Link className="button" href="/library?status=all" aria-current={active === 'all' ? 'page' : undefined}>All ({entries.length})</Link>
    </nav>
    {visible.length ? <div className="anime-grid">{visible.map((entry) => <AnimeCard key={entry.anime.mal_id} anime={entry.anime} currentStatus={entry.status} allowRemove />)}</div> : <div className="panel stack">
      <h2>{entries.length ? 'No anime in this category' : 'Your list is empty'}</h2>
      <p>{entries.length ? 'Choose another status or add an anime from search.' : 'Search for a title you enjoy or try a recommendation.'}</p>
      <Link href="/search">Search anime</Link>
    </div>}
  </section>;
}
