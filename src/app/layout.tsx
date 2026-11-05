import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { previewEnabled } from '@/lib/preview';
import { ScrollMemory } from '@/components/ScrollMemory';
import { LegacyHashBridge } from './LegacyHashBridge';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anime Watchlist',
  description: 'Find anime, save your library, and discover stories for your taste.',
};
export const viewport: Viewport = { themeColor: '#F9EBD7' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head><link rel="preload" href="/fonts/anton-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head><body>{previewEnabled() && <div className="fixture-banner">Isolated review fixtures · no live account or provider data</div>}<LegacyHashBridge /><Suspense><ScrollMemory /></Suspense>{children}</body></html>;
}
