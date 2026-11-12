import { getCurrentUser } from '@/lib/current-user';
import { AuthRateLimitUnavailableError } from '@/lib/operational-error';
import { AuthenticationUnavailableError } from '@/lib/auth-session';
import { RateLimitError } from '@/lib/rate-limit';

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
  } catch (problem) {
    if (problem instanceof RateLimitError) return Response.json({ error: problem.message, code: 'AUTH_RATE_LIMITED' }, { status: 429, headers: { ...headers, 'Retry-After': String(problem.retryAfterSeconds) } });
    if (problem instanceof AuthRateLimitUnavailableError || problem instanceof AuthenticationUnavailableError) {
      return Response.json({ error: 'Account verification is temporarily unavailable. Retry to continue.', code: problem instanceof AuthRateLimitUnavailableError ? 'AUTH_RATE_LIMIT_UNAVAILABLE' : 'AUTH_UNAVAILABLE' }, { status: 503, headers });
    }
    return Response.json({ error: 'Your profile could not be loaded. Retry to continue.', code: 'PROFILE_UNAVAILABLE' }, { status: 503, headers });
  }
}
