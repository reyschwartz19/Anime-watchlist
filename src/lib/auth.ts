import 'server-only';

import { createNeonAuth } from '@neon/auth/next/server';
import { headers } from 'next/headers';
import { fetchVerifiedAuthSession, hasNeonSessionCookie, type VerifiedAuthSession } from './auth-session';
import { previewEnabled, previewIdentity } from './preview';
import { enforceAuthLimit } from './rate-limit';
import { authRequestIdentity } from './auth-request';
import { authConfiguration } from './environment';
export { AuthenticationUnavailableError, type VerifiedAuthSession } from './auth-session';

export function isAuthConfigured(): boolean {
  try {
    authConfiguration();
    return true;
  } catch {
    return false;
  }
}

let auth: ReturnType<typeof createNeonAuth> | undefined;

/** Lazily constructed so builds never need credentials or contact the service. */
export function getAuth() {
  if (!auth) {
    const { baseUrl, secret } = authConfiguration();
    auth = createNeonAuth({
      baseUrl,
      cookies: { secret, sameSite: 'lax' },
      // Provider failures can contain upstream request details. The UI uses
      // sanitized errors; never emit auth tokens or email addresses to logs.
      logLevel: 'silent',
    });
  }
  return auth;
}

/**
 * Authoritative verification, never an optimistic signed-cookie check.
 *
 * @neon/auth 0.8.2's server factory can return its signed session_data cookie.
 * Its runtime cache-bypass currently expects the STRING "true", although the
 * inherited Better Auth query type expects a boolean. Requesting the same
 * managed endpoint directly avoids relying on that type/runtime mismatch.
 * Source: neondatabase/neon-pkgs/packages/auth/src/server/client-factory.ts.
 * No module/session cache is used for this request, so revocation is checked
 * again at every private operation that calls this function.
 */
export async function getVerifiedAuthSession(): Promise<VerifiedAuthSession | null> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  if (previewEnabled()) return previewIdentity(cookie);
  if (!hasNeonSessionCookie(cookie)) return null;

  const { baseUrl, origin } = authConfiguration();
  await enforceAuthLimit(authRequestIdentity(requestHeaders, process.env.VERCEL === '1'), false);
  return fetchVerifiedAuthSession({ baseUrl, origin, cookie });
}
