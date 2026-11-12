'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
export function RecentSearches({ query, userId }: { query: string; userId: string }) {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      const key = `anime-searches:${userId}`;
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      const old = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string').slice(0, 6) : [];
      const next = query ? [query, ...old.filter(v => v !== query)].slice(0, 6) : old;
      if (query) localStorage.setItem(key, JSON.stringify(next));
      setRecent(next);
    } catch { /* Storage may be disabled; search remains usable. */ }
  }, [query, userId]);
  return !query && recent.length ? <section className="stack"><h2>Recent searches</h2><div className="recent-searches">{recent.map(q => <Link key={q} href={`/search?q=${encodeURIComponent(q)}`}>{q}</Link>)}</div><button type="button" onClick={() => { try { localStorage.removeItem(`anime-searches:${userId}`); } catch {} setRecent([]); }}>Clear recent searches</button></section> : null;
}
