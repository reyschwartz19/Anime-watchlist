import Link from 'next/link';

export default function NotFound() {
  return <main className="app-shell stack"><h1>Page not found</h1><Link href="/library">Open my list</Link></main>;
}
