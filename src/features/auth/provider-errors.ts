export interface AuthProviderError {
  code?: string;
  message?: string;
  status?: number;
  error?: { code?: string; message?: string };
}
/** Neon may normalize the outer error while retaining Better Auth's inner code. */
export function providerErrorCode(error?: AuthProviderError | null): string {
  return error?.error?.code ?? error?.code ?? '';
}
export function providerErrorMessage(error: AuthProviderError): string {
  const code = providerErrorCode(error);
  if (code === 'AUTH_RATE_LIMIT_UNAVAILABLE') return 'Sign-in protection is temporarily unavailable. Retry shortly.';
  if (code === 'CANONICAL_ORIGIN_REQUIRED') return 'Open the stable app URL and sign in again.';
  if (error.status === 503 || ['AUTH_PROVIDER_UNAVAILABLE', 'AUTH_UNAVAILABLE', 'AUTH_CONFIGURATION_UNAVAILABLE'].includes(code)) return 'Sign-in is temporarily unavailable. Retry shortly.';
  if (/OTP_EXPIRED|TOKEN_EXPIRED|EXPIRED/i.test(code)) return 'This code or link has expired. Request a new one below.';
  if (/INVALID_OTP|OTP_INVALID/i.test(code)) return 'That verification code is not valid. Check the email and try again.';
  if (/INVALID_TOKEN/i.test(code)) return 'This link is not valid. Request a new link below.';
  if (error.status === 429 || /TOO_MANY|RATE_LIMIT/i.test(code)) return 'Too many requests. Wait a moment before trying again.';
  return error.message || error.error?.message || 'This request could not be completed. Please try again.';
}
