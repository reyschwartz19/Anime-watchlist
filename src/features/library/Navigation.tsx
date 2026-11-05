'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/features/auth/SignOutButton';

const links = [
  ['/library', 'My List'],
  ['/search', 'Search'],
  ['/recommendations', 'Discover'],
  ['/profile', 'Profile'],
] as const;

export function Navigation() {
  const pathname = usePathname();
  return <header className="site-nav">
    <Link href="/library">Anime Watchlist</Link>
    <nav aria-label="Main navigation">
      {links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}
      <SignOutButton />
    </nav>
  </header>;
}
