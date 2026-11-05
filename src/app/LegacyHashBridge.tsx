'use client';

import { useEffect } from 'react';
import { resolveLegacyHash } from '@/lib/legacy-links';

export function LegacyHashBridge() {
  useEffect(() => {
    const navigate = () => {
      const destination = resolveLegacyHash(window.location.hash);
      if (destination) window.location.replace(destination);
      else if (window.location.pathname === '/') window.location.replace('/library');
    };
    navigate();
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  return null;
}
