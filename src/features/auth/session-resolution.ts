import { safeAuthDestination } from './destination';

export interface ResolvedProfile {
  internalUserId: string;
  email: string;
  emailVerified: boolean;
  onboarded: boolean;
}

export function parseResolvedProfile(value: unknown): ResolvedProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Your profile could not be read. Retry to continue.');
  const data = value as Record<string, unknown>;
  if (typeof data.internalUserId !== 'string' || !data.internalUserId || typeof data.email !== 'string' || typeof data.emailVerified !== 'boolean' || typeof data.onboarded !== 'boolean') {
    throw new Error('Your profile could not be read. Retry to continue.');
  }
  return data as unknown as ResolvedProfile;
}

export function resolvedDestination(profile: ResolvedProfile, requested: unknown): string {
  if (!profile.emailVerified) return `/auth/verify-email?${new URLSearchParams({ email: profile.email, returnTo: safeAuthDestination(requested) })}`;
  if (!profile.onboarded) return '/onboarding';
  const destination = safeAuthDestination(requested);
  return ['/', '/onboarding', '/library'].includes(destination) ? '/recommendations' : destination;
}

/** Only a 401 represents no session. A failed profile read never means new user. */
export async function resolveSession(requested: unknown, upstream: typeof fetch = fetch): Promise<{ kind: 'signed-out' } | { kind: 'authenticated'; destination: string }> {
  const response = await upstream('/api/me', { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (response.status === 401) return { kind: 'signed-out' };
  if (!response.ok) throw new Error('Your account could not be loaded. Retry to continue; your profile has not changed.');
  return { kind: 'authenticated', destination: resolvedDestination(parseResolvedProfile(await response.json()), requested) };
}

export function oauthErrorMessage(code: string | null): string {
  if (code === 'access_denied' || code === 'user_cancelled' || code === 'user_canceled') return 'Google sign-in was cancelled. Try again or continue with email.';
  return 'Google could not complete sign-in. Try again or continue with email.';
}
