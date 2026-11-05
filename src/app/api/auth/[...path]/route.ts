import { getAuth, isAuthConfigured } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { enforceAuthLimit, RateLimitError } from '@/lib/rate-limit';
import { AuthRequestError, authRequestIdentity, boundedAuthBody, sanitizedAuthError, validateAuthDestinations } from '@/lib/auth-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function handler(method: Method) {
  return async (request: NextRequest, context: Context) => {
    const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
    if (!isAuthConfigured()) {
      return Response.json({ error: { message: 'Authentication is not configured yet.' } }, { status: 503, headers: privateHeaders });
    }
    try {
      const params = await context.params;
      if (!Array.isArray(params.path) || !params.path.length || params.path.length > 8 ||
          params.path.some(value => typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(value) || value === '.' || value === '..') || request.url.length > 8192) {
        throw new AuthRequestError(400, 'Choose a valid authentication request.');
      }
      const expectedOrigin = new URL(process.env.APP_URL!).origin;
      if (method !== 'GET' && request.headers.get('origin') !== expectedOrigin) throw new AuthRequestError(403, 'This authentication request must come from this app.');
      await enforceAuthLimit(authRequestIdentity(request.headers, process.env.VERCEL === '1'), method !== 'GET');
      validateAuthDestinations(Object.fromEntries(request.nextUrl.searchParams.entries()), expectedOrigin);
      let guarded = request;
      if (method !== 'GET') {
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AuthRequestError(415, 'Send authentication details as JSON.');
        const body = await boundedAuthBody(request);
        let value: unknown;
        try { value = JSON.parse(body || '{}'); } catch { throw new AuthRequestError(400, 'Choose valid authentication details.'); }
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthRequestError(400, 'Choose valid authentication details.');
        validateAuthDestinations(value as Record<string, unknown>, expectedOrigin);
        guarded = new NextRequest(request, { body });
      }
      const response = await getAuth().handler()[method](guarded, { params: Promise.resolve(params) });
      if (response.status >= 500) return Response.json({ error: { message: 'Authentication is unavailable. Please try again shortly.' } }, { status: 503, headers: privateHeaders });
      if (response.status >= 400) {
        let value: unknown;
        try { value = await response.json(); } catch { value = null; }
        const safe = sanitizedAuthError(value, response.status);
        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete('content-length');
        for (const [name, value] of Object.entries(privateHeaders)) responseHeaders.set(name, value);
        return Response.json(safe, { status: response.status, headers: responseHeaders });
      }
      for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
      return response;
    } catch (problem) {
      if (problem instanceof AuthRequestError) return Response.json({ error: { message: problem.message } }, { status: problem.status, headers: privateHeaders });
      if (problem instanceof RateLimitError) return Response.json({ error: { message: problem.message } }, { status: 429, headers: { ...privateHeaders, 'Retry-After': String(problem.retryAfterSeconds) } });
      return Response.json({ error: { message: 'Authentication is unavailable. Please try again shortly.' } }, { status: 503, headers: privateHeaders });
    }
  };
}

export const GET = handler('GET');
export const POST = handler('POST');
export const PUT = handler('PUT');
export const PATCH = handler('PATCH');
export const DELETE = handler('DELETE');
