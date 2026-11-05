import { getVerifiedAuthSession } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  const identity = await getVerifiedAuthSession();
  if (!identity) return Response.json({ error: 'Sign in first.' }, { status: 401, headers });
  const user = await getDb().appUser.upsert({
    where: { authProviderId: identity.id },
    update: { email: identity.email },
    create: { authProviderId: identity.id, email: identity.email, displayName: identity.name, photoURL: identity.image },
  });
  return Response.json({
    internalUserId: user.id,
    authProviderId: identity.id,
    email: identity.email,
    emailVerified: identity.emailVerified,
    onboarded: user.onboarded,
  }, { headers });
}
