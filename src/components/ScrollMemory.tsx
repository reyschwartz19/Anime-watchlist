'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
export function ScrollMemory() {
  const path = usePathname();
  const query = useSearchParams();
  useEffect(() => {
    const key = `shelf-scroll:${path}${query.size ? `?${query}` : ''}`;
    try { const value = sessionStorage.getItem(key); if (value) { requestAnimationFrame(() => window.scrollTo(0, Number(value))); sessionStorage.removeItem(key); } } catch {}
    function remember(e: MouseEvent) {
      const link = (e.target as Element)?.closest('a');
      if (link?.getAttribute('href')?.startsWith('/anime/')) try { sessionStorage.setItem(key, String(window.scrollY)); } catch {}
    }
    document.addEventListener('click', remember);
    return () => document.removeEventListener('click', remember);
  }, [path, query]);
  return null;
}
