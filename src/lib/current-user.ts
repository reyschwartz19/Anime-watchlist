import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getVerifiedAuthSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

/** Every caller gets a remotely verified session; no browser-supplied ownership. */
export async function getCurrentUser() {
  const identity = await getVerifiedAuthSession();
  if (!identity) return null;
  return getDb().appUser.upsert({
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
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const path = (await headers()).get('x-anime-path') ?? '/library';
    const safePath = /^\/(library|search|recommendations|profile|onboarding)(?:[/?]|$)/.test(path) ? path : '/library';
    redirect(`/auth?returnTo=${encodeURIComponent(safePath)}`);
  }
  return user;
}
