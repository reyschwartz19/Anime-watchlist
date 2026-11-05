/** Request guards shared by the auth proxy and its focused security tests. */
export class AuthRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function validateAuthDestination(value: unknown, origin: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\\]/.test(value)) throw new AuthRequestError(400, 'Choose a valid return destination.');
  let destination: URL;
  try { destination = new URL(value, origin); } catch { throw new AuthRequestError(400, 'Choose a valid return destination.'); }
  if (destination.origin !== origin || destination.username || destination.password) throw new AuthRequestError(400, 'Return destinations must stay on this app.');
}

export function validateAuthDestinations(value: Record<string, unknown>, origin: string): void {
  for (const name of ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL', 'redirectTo']) validateAuthDestination(value[name], origin);
}

export async function boundedAuthBody(request: Request, maximum = 16_384): Promise<string> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new AuthRequestError(413, 'This authentication request is too large.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    void reader.cancel().catch(() => {});
    reject(new AuthRequestError(408, 'The authentication request timed out. Try again.'));
  }, 5000); });
  try {
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) {
          void reader.cancel().catch(() => {});
          throw new AuthRequestError(413, 'This authentication request is too large.');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new AuthRequestError(400, 'Choose valid authentication details.'); }
    };
    return await Promise.race([read(), timedOut]);
  } finally { if (timer) clearTimeout(timer); }
}

export function authRequestIdentity(headers: Headers, vercel: boolean): string {
  // Vercel overwrites x-forwarded-for with the client IP. Do not trust supplied
  // IP headers on arbitrary self-hosted proxies: use a conservative shared key.
  const forwarded = vercel ? headers.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
  return forwarded && forwarded.length <= 64 && /^[a-fA-F0-9:.]+$/.test(forwarded) ? forwarded : 'shared-untrusted-proxy';
}

/** Preserve machine-readable auth recovery codes, never raw upstream messages. */
export function sanitizedAuthError(value: unknown, status: number): { code: string; message: string } {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const inner = record.error && typeof record.error === 'object' ? record.error as Record<string, unknown> : record;
  const code = typeof inner.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(inner.code) ? inner.code : 'AUTH_REQUEST_FAILED';
  let message = 'This request could not be completed. Check your details and try again.';
  if (/EXPIRED/.test(code)) message = 'This code or link has expired. Request a new one.';
  else if (/INVALID_OTP|OTP_INVALID/.test(code)) message = 'That verification code is not valid. Check the email and try again.';
  else if (/INVALID_TOKEN/.test(code)) message = 'This link is not valid. Request a new one.';
  else if (code === 'EMAIL_NOT_VERIFIED') message = 'Verify your email to continue.';
  else if (status === 401 || /INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD/.test(code)) message = 'The email or password was not accepted. Check your details and try again.';
  else if (status === 429 || /TOO_MANY|RATE_LIMIT/.test(code)) message = 'Too many authentication requests. Wait a moment and try again.';
  return { code, message };
}
