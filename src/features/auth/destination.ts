const destinations = new Set(['/', '/library', '/search', '/recommendations', '/profile', '/onboarding']);
const referenceOrigin = 'https://local.invalid';

/** Authentication redirects accept known local routes only, retaining their queries. */
export function safeAuthDestination(input: unknown): string {
  if (typeof input !== 'string' || !input.startsWith('/') || input.startsWith('//') || /[\u0000-\u001f\\]/.test(input) || input.length > 4096) return '/recommendations';
  try {
    const url = new URL(input, referenceOrigin);
    const detailId = /^\/anime\/([1-9]\d*)$/.exec(url.pathname)?.[1];
    const detail = detailId !== undefined && Number(detailId) <= 2_147_483_647;
    if (url.origin !== referenceOrigin || (!destinations.has(url.pathname) && !detail)) return '/recommendations';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/recommendations';
  }
}

export function authViewHref(view: string, destination: unknown, email?: string): string {
  const query = new URLSearchParams({ returnTo: safeAuthDestination(destination) });
  if (email) query.set('email', email);
  return `/auth/${view}?${query.toString()}`;
}
