import Link from 'next/link';

// A public handoff is intentional: SSR cannot see /#/search (the fragment), and
// an immediate server redirect would erase that legacy destination before JS.
export default function HomePage() {
  return <main className="app-shell stack">
    <h1>Anime Watchlist</h1>
    <p>Keep your collection and find your next story.</p>
    <div className="row"><Link className="button" href="/library">Open my list</Link><Link href="/auth">Sign in</Link></div>
  </main>;
}
