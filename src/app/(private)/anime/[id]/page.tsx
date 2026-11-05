import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getAnimeDetails, ProviderError } from '@/lib/providers';
import { enforceUserLimit, RateLimitError } from '@/lib/rate-limit';
import { toAnimeView } from '@/features/library/model';
import { Poster } from '@/features/library/Poster';
import { LibraryControls } from '@/features/library/LibraryControls';
import { safeReturnPath } from '@/features/library/return-path';

export default async function AnimePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const animeId = Number(id);
  if (!Number.isInteger(animeId) || animeId < 1 || animeId > 2147483647) notFound();
  const from = safeReturnPath(query.from);
  const existing = await getDb().libraryEntry.findUnique({ where: { userId_animeId: { userId: user.id, animeId } } });
  let data: unknown = existing?.anime;
  let error = '';
  if (!data) try { await enforceUserLimit(user.id, 'catalog'); data = await getAnimeDetails(animeId); } catch (cause) { error = cause instanceof ProviderError || cause instanceof RateLimitError ? cause.message : 'The anime catalog is unavailable. Return to your results or try this page again.'; }
  if (!data) return <section className="stack"><Link href={from}><ArrowLeft size={20} aria-hidden="true" /> Back to results</Link><h1>{error ? 'Catalog unavailable' : 'Title unavailable'}</h1><p role="alert">{error || 'This title is no longer available from the catalog.'}</p><Link href={`/anime/${animeId}?from=${encodeURIComponent(from)}`}>Retry</Link></section>;
  const anime = toAnimeView(data, animeId);
  return <section className="stack"><Link className="row" href={from}><ArrowLeft size={24} aria-hidden="true" />Back to {from.startsWith('/library') ? 'My List' : from.startsWith('/search') ? 'search results' : 'Discover'}</Link>
    <div className="details-layout"><h1 className="details-title">{anime.title}</h1><div className="details-poster"><Poster anime={anime} eager /></div><div className="details-copy">{anime.alternateTitle && <p className="muted">{anime.alternateTitle}</p>}<dl className="facts"><dt>Year</dt><dd>{anime.year ?? 'Not listed'}</dd><dt>Type</dt><dd>{anime.type ?? 'Not listed'}</dd><dt>Episodes</dt><dd>{anime.episodes ?? 'Not listed'}</dd></dl><LibraryControls animeId={animeId} initialStatus={existing && !existing.deletedAt ? existing.status : undefined} /><section className="stack"><h2>Synopsis</h2><p>{anime.synopsis || 'No synopsis is available for this title.'}</p></section>{!!anime.genres?.length && <div className="genre-tags" aria-label="Genres">{anime.genres.map(g => <span key={g}>{g}</span>)}</div>}<a href={`https://myanimelist.net/anime/${animeId}`} target="_blank" rel="noopener noreferrer">View catalog source on MyAnimeList</a></div></div>
  </section>;
}
