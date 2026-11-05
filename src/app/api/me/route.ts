import { getCurrentUser } from '@/lib/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401, headers });
  return Response.json({
    internalUserId: user.id,
    authProviderId: user.authProviderId,
    email: user.email,
    emailVerified: user.emailVerified,
    onboarded: user.onboarded,
  }, { headers });
  } catch {
    return Response.json({ error: 'Your profile could not be loaded. Retry to continue.', code: 'PROFILE_UNAVAILABLE' }, { status: 503, headers });
  }
}
