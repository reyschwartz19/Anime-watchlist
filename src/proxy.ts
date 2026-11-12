import { NextRequest, NextResponse } from 'next/server';
import { getAuth, isAuthConfigured } from '@/lib/auth';
import { previewEnabled } from '@/lib/preview';
import { previewCanonicalOrigin } from '@/lib/environment';

// Navigation context only. This proxy makes no authentication/ownership claim;
// every private page/action verifies the managed session on the server.
export async function proxy(request: NextRequest) {
  const canonical = previewCanonicalOrigin(request.nextUrl.origin);
  if (canonical) {
    // Session verifier/challenge cookies belong to the initiating host. Never
    // transfer an in-flight exchange to another hostname; restart there instead.
    const destination = request.nextUrl.searchParams.has('neon_auth_session_verifier')
      ? new URL('/auth/sign-in?error=restart_on_canonical_origin', canonical)
      : new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, canonical);
    if (request.method === 'GET' || request.method === 'HEAD') {
      const response = NextResponse.redirect(destination, 307);
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    }
    return Response.json({ code: 'CANONICAL_ORIGIN_REQUIRED', error: 'Open the stable branch URL and try again.' }, { status: 409 });
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-anime-path', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  // Neon OAuth returns a session verifier plus its challenge cookie, not an
  // established app session. Let the installed SDK exchange it and forward all
  // Set-Cookie headers before the callback resolves our authoritative profile.
  // Private pages/actions still verify ownership independently below this proxy.
  if (!previewEnabled() && isAuthConfigured() &&
      request.nextUrl.searchParams.has('neon_auth_session_verifier')) {
    return getAuth().middleware({ loginUrl: '/auth/sign-in', publicRoutes: ['/auth/callback'] })(new NextRequest(request, { headers: requestHeaders }));
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/', '/auth/:path*', '/anime/:path*', '/library/:path*', '/search/:path*', '/recommendations/:path*', '/profile/:path*', '/onboarding/:path*'],
};
