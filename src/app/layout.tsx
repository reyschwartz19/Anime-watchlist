import type { Metadata } from 'next';
import { LegacyHashBridge } from './LegacyHashBridge';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anime Watchlist',
  description: 'Find anime, save your library, and discover stories for your taste.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><LegacyHashBridge />{children}</body></html>;
}
