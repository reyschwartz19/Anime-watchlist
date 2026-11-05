import { NextRequest, NextResponse } from 'next/server';

// Navigation context only. This proxy makes no authentication/ownership claim;
// every private page/action verifies the managed session on the server.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-anime-path', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/library/:path*', '/search/:path*', '/recommendations/:path*', '/profile/:path*', '/onboarding/:path*'],
};
