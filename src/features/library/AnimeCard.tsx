import Link from 'next/link';
import { STATUS_LABELS, type AnimeView, type LibraryStatus } from './model';
import { Poster } from './Poster';

export function AnimeCard({ anime, currentStatus, returnTo = '/library?status=all' }: {
  anime: AnimeView; currentStatus?: LibraryStatus; returnTo?: string;
}) {
  return <article className="anime-card">
    <Link className="poster-link" href={`/anime/${anime.mal_id}?from=${encodeURIComponent(returnTo)}`}>
      <Poster anime={anime} />
      <div className="tile-caption"><h2>{anime.title}</h2><p>{currentStatus ? STATUS_LABELS[currentStatus] : [anime.year, anime.type].filter(Boolean).join(' · ') || 'View details'}</p></div>
    </Link>
  </article>;
}
