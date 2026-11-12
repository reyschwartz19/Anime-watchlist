'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, List, Search, UserRound } from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';

const links = [
  { href: '/recommendations', label: 'Discover', Icon: House },
  { href: '/library', label: 'My List', Icon: List },
  { href: '/search', label: 'Search', Icon: Search },
  { href: '/profile', label: 'Profile', Icon: UserRound },
];

export function Navigation() {
  const pathname = usePathname();
  if (pathname === '/onboarding') return <header className="focused-header"><Link href="/onboarding"><Wordmark /></Link></header>;
  return <header className="site-nav">
    <Link href="/recommendations" className="brand-link"><Wordmark /></Link>
    <nav aria-label="Main navigation">
      {links.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}><Icon size={24} strokeWidth={2} aria-hidden="true" /><span>{label}</span></Link>)}
    </nav>
    <Link className="profile-shortcut" href="/profile" aria-label="Your profile"><UserRound size={26} aria-hidden="true" /></Link>
  </header>;
}
