'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronRight } from 'lucide-react';
import { LibraryControls } from './LibraryControls';
import { Poster } from './Poster';
import { RecentSearches } from './RecentSearches';
import { searchCatalog } from './search-actions';
import { searchPath, type SearchResult } from './search';

export function SearchPanel({ initialQuery, initialPage, initialResult, userId }: {
  initialQuery: string; initialPage: number; initialResult: SearchResult; userId: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [result, setResult] = useState(initialResult);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const initialSearch = useRef<string | null>(JSON.stringify([initialQuery, initialPage, 0]));
  const resultsHeading = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (initialSearch.current === JSON.stringify([query, page, retry])) return;
    initialSearch.current = null;
    let active = true;
    setPending(true);
    const timer = setTimeout(async () => {
      window.history.replaceState(null, '', searchPath(query, page));
      try {
        const next = await searchCatalog({ query, page });
        if (active) setResult(next);
      } catch {
        if (active) setResult({ ok: false, message: 'The search could not finish. Your title is still here; try again.' });
      } finally { if (active) setPending(false); }
    }, query.trim() ? 350 : 0);
    // Responses from an earlier phrase or page never replace the current query.
    return () => { active = false; clearTimeout(timer); };
  }, [query, page, retry]);
  function changePage(next: number) {
    setPage(next);
    requestAnimationFrame(() => resultsHeading.current?.focus({ preventScroll: true }));
  }
  const path = searchPath(result.ok ? result.query : query, result.ok ? result.page : page);
  return <>
    <form className="stack" action="/search" method="get" onSubmit={event => { event.preventDefault(); setRetry(value => value + 1); }}>
      <label htmlFor="anime-query">Find a title</label>
      <div className="row"><input id="anime-query" type="search" name="q" autoComplete="off" maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="For example, Samurai Champloo…" /><button className="primary" type="submit"><Search size={20} aria-hidden="true" />Search</button>{query && <button type="button" onClick={() => { setQuery(''); setPage(1); }}>Clear</button>}</div>
    </form>
    <RecentSearches query={result.ok ? result.query : ''} userId={userId} />
    <div className="stack" aria-busy={pending}>
      <p ref={resultsHeading} tabIndex={-1} role="status" className="muted">{pending ? 'Searching the catalog…' : result.ok && result.query && result.items.length ? `${result.total ?? result.items.length} matches for “${result.query}” · Page ${result.page}` : ''}</p>
      {!result.ok ? <div className="notice stack" role="alert"><p>{result.message}</p><button type="button" disabled={pending} onClick={() => setRetry(value => value + 1)}>Retry search</button></div> : result.query && result.items.length === 0 && !pending ? <div className="empty-state"><h2>No matching titles</h2><p>Try a shorter title or another spelling.</p></div> : !result.query && !pending ? <p className="muted">Search by anime title, then add it straight to your shelf.</p> : null}
      {result.ok && result.items.length > 0 && <><div className="search-results">{result.items.map(({ anime, status }) => <article className="search-result search-entry" key={anime.mal_id}>
        <Link className="search-cover" href={`/anime/${anime.mal_id}?from=${encodeURIComponent(path)}`} aria-label={`Details for ${anime.title}`}><Poster anime={anime} /></Link>
        <div className="result-copy"><p className="muted">{[anime.year, anime.type].filter(Boolean).join(' · ') || 'Year and format not listed'}</p><h2><Link href={`/anime/${anime.mal_id}?from=${encodeURIComponent(path)}`}>{anime.title}<ChevronRight size={20} aria-hidden="true" /></Link></h2>{anime.alternateTitle && <p className="muted">{anime.alternateTitle}</p>}<LibraryControls animeId={anime.mal_id} title={anime.title} initialStatus={status} compact /></div>
      </article>)}</div><nav className="row" aria-label="Search pages"><button type="button" disabled={pending || result.page <= 1} onClick={() => changePage(result.page - 1)}>Previous page</button><span>Page {result.page}</span><button type="button" disabled={pending || !result.hasNextPage || result.page >= 1000} onClick={() => changePage(result.page + 1)}>Next page</button></nav></>}
    </div>
    <small className="muted">Catalog data via Jikan Edge, an unofficial MyAnimeList API.</small>
  </>;
}
