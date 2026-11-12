import {
  extractNeonAuthCookies,
  NEON_AUTH_SERVER_PROXY_HEADER,
  NEON_AUTH_SESSION_COOKIE_NAME,
  NEON_AUTH_SESSION_DATA_COOKIE_NAME,
} from '@neon/auth/server';

export type VerifiedAuthSession = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
};

export class AuthenticationUnavailableError extends Error {
  readonly status = 503;

  constructor() {
    super('Authentication is unavailable. Please try again shortly.');
    this.name = 'AuthenticationUnavailableError';
  }
}

export function hasNeonSessionCookie(cookie: string | null): boolean {
  return extractNeonAuthCookies(cookie ?? '').split('; ')
    .some((part) => part.startsWith(`${NEON_AUTH_SESSION_COOKIE_NAME}=`));
}

/**
 * Calls the managed service even if a signed local session snapshot exists.
 * Cookie extraction and proxy identification use the official SDK constants.
 * A local snapshot never provides authority: omit it entirely from this call.
 */
export async function fetchVerifiedAuthSession(
  { baseUrl, origin, cookie }: { baseUrl: string; origin: string; cookie: string | null },
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<VerifiedAuthSession | null> {
  const forwardedCookie = extractNeonAuthCookies(cookie ?? '')
    .split('; ')
    .filter((part) => !part.startsWith(`${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=`))
    .join('; ');
  if (!forwardedCookie.split('; ').some((part) => part.startsWith(`${NEON_AUTH_SESSION_COOKIE_NAME}=`))) {
    return null;
  }
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/get-session`);
  url.searchParams.set('disableCookieCache', 'true');

  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'GET',
      headers: { Cookie: forwardedCookie, Origin: origin, [NEON_AUTH_SERVER_PROXY_HEADER]: 'nextjs' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AuthenticationUnavailableError();
  }
  if (response.status === 401) return null;
  if (!response.ok) throw new AuthenticationUnavailableError();

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new AuthenticationUnavailableError();
  }
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new AuthenticationUnavailableError();
  const body = value as Record<string, unknown>;
  if (body.session === null && body.user === null) return null;
  if (!body.session || typeof body.session !== 'object' || !body.user || typeof body.user !== 'object') {
    throw new AuthenticationUnavailableError();
  }
  const session = body.session as Record<string, unknown>;
  const user = body.user as Record<string, unknown>;
  const expires = typeof session.expiresAt === 'string' ? Date.parse(session.expiresAt) : NaN;
  if (!Number.isFinite(expires)) throw new AuthenticationUnavailableError();
  if (expires <= now()) return null;
  if (typeof session.id !== 'string' || typeof user.id !== 'string' || !user.id || session.userId !== user.id ||
      typeof user.email !== 'string' || typeof user.emailVerified !== 'boolean') {
    throw new AuthenticationUnavailableError();
  }
  return {
    id: user.id,
    email: user.email,
    name: typeof user.name === 'string' ? user.name : null,
    image: typeof user.image === 'string' ? user.image : null,
    emailVerified: user.emailVerified,
  };
}
