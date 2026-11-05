const destinations = new Set(['/', '/library', '/search', '/recommendations', '/profile', '/onboarding']);
const referenceOrigin = 'https://local.invalid';

/** Authentication redirects accept known local routes only, retaining their queries. */
export function safeAuthDestination(input: unknown): string {
  if (typeof input !== 'string' || !input.startsWith('/') || input.startsWith('//') || input.length > 4096) return '/library';
  try {
    const url = new URL(input, referenceOrigin);
    if (url.origin !== referenceOrigin || !destinations.has(url.pathname)) return '/library';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/library';
  }
}

export function authViewHref(view: string, destination: unknown, email?: string): string {
  const query = new URLSearchParams({ returnTo: safeAuthDestination(destination) });
  if (email) query.set('email', email);
  return `/auth/${view}?${query.toString()}`;
}
