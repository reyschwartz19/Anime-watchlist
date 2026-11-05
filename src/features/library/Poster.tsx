'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnimeView } from './model';

export function Poster({ anime, eager = false }: { anime: AnimeView; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setFailed(false);
    if (image.current?.complete && image.current.naturalWidth === 0) setFailed(true);
  }, [anime.imageUrl]);
  return anime.imageUrl && !failed
    ? <img ref={image} className="anime-poster" src={anime.imageUrl} alt="" width={300} height={450} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="poster-fallback"><span>{anime.title}</span><small>Artwork unavailable</small></span>;
}
