import { NextRequest, NextResponse } from 'next/server';
import { getAuth, isAuthConfigured } from '@/lib/auth';
import { previewEnabled } from '@/lib/preview';

// Navigation context only. This proxy makes no authentication/ownership claim;
// every private page/action verifies the managed session on the server.
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-anime-path', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  // Neon OAuth returns a session verifier plus its challenge cookie, not an
  // established app session. Let the installed SDK exchange it and forward all
  // Set-Cookie headers before the callback resolves our authoritative profile.
  // Private pages/actions still verify ownership independently below this proxy.
  if (!previewEnabled() && isAuthConfigured() &&
      (request.nextUrl.pathname === '/auth/callback' || request.nextUrl.searchParams.has('neon_auth_session_verifier'))) {
    return getAuth().middleware({ loginUrl: '/auth/sign-in', publicRoutes: ['/auth/callback'] })(new NextRequest(request, { headers: requestHeaders }));
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/auth/callback', '/anime/:path*', '/library/:path*', '/search/:path*', '/recommendations/:path*', '/profile/:path*', '/onboarding/:path*'],
};
