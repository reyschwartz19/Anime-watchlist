import Link from 'next/link';
import { getCurrentUser } from '@/lib/current-user';
import { resolvedDestination } from '@/features/auth/session-resolution';
import { LegacyHashBridge } from './LegacyHashBridge';

export const dynamic = 'force-dynamic';

// A public handoff is intentional: SSR cannot see /#/search (the fragment), and
// an immediate server redirect would erase that legacy destination before JS.
export default async function HomePage() {
  const user = await getCurrentUser();
  const destination = user ? resolvedDestination({ internalUserId: user.id, email: user.email ?? '', emailVerified: user.emailVerified, onboarded: user.onboarded }, '/recommendations') : '/auth/sign-in';
  return <main className="app-shell stack">
    <LegacyHashBridge rootDestination={destination} />
    <h1>Anime Watchlist</h1>
    <p role="status">Opening your account…</p>
    <Link className="button" href={destination}>Continue</Link>
  </main>;
}
