import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getVerifiedAuthSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { previewEnabled, previewFailure } from '@/lib/preview';
import { authViewHref, safeAuthDestination } from '@/features/auth/destination';
import { databaseFailureCode } from './operational-error';

/** Every caller gets a remotely verified session; no browser-supplied ownership. */
export async function getCurrentUser() {
  const identity = await getVerifiedAuthSession();
  if (!identity) return null;
  if (previewEnabled() && previewFailure((await headers()).get('cookie')) === 'profile') throw new Error('Your profile is temporarily unavailable. Retry to continue.');
  try {
    const user = await getDb().appUser.upsert({
      where: { authProviderId: identity.id },
      // Contact email belongs to the verified login. Imported profile/preferences
      // and their edit marker remain untouched; source email is retained in snapshots.
      update: { email: identity.email },
      create: {
        authProviderId: identity.id,
        email: identity.email,
        displayName: identity.name,
        photoURL: identity.image,
      },
    });
    return { ...user, emailVerified: identity.emailVerified };
  } catch (problem) {
    console.error(JSON.stringify({ event: 'auth_operation_failed', stage: 'profile', reason: databaseFailureCode(problem) }));
    throw new Error('Your profile is temporarily unavailable. Retry to continue.');
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  const path = (await headers()).get('x-anime-path') ?? '/recommendations';
  const safePath = safeAuthDestination(path);
  if (!user) {
    redirect(authViewHref('sign-in', safePath));
  }
  if (!user.emailVerified) redirect(authViewHref('verify-email', safePath, user.email ?? undefined));
  return user;
}
