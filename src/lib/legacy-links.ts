const legacyRoutes: Record<string, string> = {
  '/': '/library',
  '/auth': '/auth',
  '/onboarding': '/onboarding',
  '/search': '/search',
  '/recommendations': '/recommendations',
  '/profile': '/profile',
};

/** Fragments never reach the server: resolve only known local hash routes. */
export function resolveLegacyHash(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  try {
    const url = new URL(hash.slice(1), 'https://legacy.invalid');
    if (url.origin !== 'https://legacy.invalid') return null;
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const target = legacyRoutes[pathname];
    return target ? `${target}${url.search}` : '/library';
  } catch {
    return '/library';
  }
}
