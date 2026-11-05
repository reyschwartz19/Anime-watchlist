import { getAuth, isAuthConfigured } from '@/lib/auth';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function handler(method: Method) {
  return async (request: NextRequest, context: Context) => {
    if (!isAuthConfigured()) {
      return Response.json({ error: { message: 'Authentication is not configured yet.' } }, { status: 503 });
    }
    return getAuth().handler()[method](request, context);
  };
}

export const GET = handler('GET');
export const POST = handler('POST');
export const PUT = handler('PUT');
export const PATCH = handler('PATCH');
export const DELETE = handler('DELETE');
