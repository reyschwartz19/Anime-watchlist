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
  if (/OTP_EXPIRED|TOKEN_EXPIRED|EXPIRED/i.test(code)) return 'This code or link has expired. Request a new one below.';
  if (/INVALID_OTP|OTP_INVALID/i.test(code)) return 'That verification code is not valid. Check the email and try again.';
  if (/INVALID_TOKEN/i.test(code)) return 'This link is not valid. Request a new link below.';
  if (error.status === 429 || /TOO_MANY|RATE_LIMIT/i.test(code)) return 'Too many requests. Wait a moment before trying again.';
  return error.message || error.error?.message || 'This request could not be completed. Please try again.';
}
