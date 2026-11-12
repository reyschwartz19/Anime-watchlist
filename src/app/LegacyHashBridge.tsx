'use client';

import { useEffect } from 'react';
import { resolveLegacyHash } from '@/lib/legacy-links';

export function LegacyHashBridge({ rootDestination }: { rootDestination?: string }) {
  useEffect(() => {
    const navigate = () => {
      // The root page supplies its server-resolved fallback. Its own bridge
      // handles legacy fragments before that fallback; the layout skips it.
      if (window.location.pathname === '/' && !rootDestination) return;
      const destination = resolveLegacyHash(window.location.hash);
      if (destination) window.location.replace(destination);
      else if (rootDestination) window.location.replace(rootDestination);
    };
    navigate();
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [rootDestination]);
  return null;
}
