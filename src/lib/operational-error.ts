/** Inspect known codes only. Raw driver/provider messages may contain secrets. */
export function databaseFailureCode(problem: unknown, depth = 0): string {
  if (!problem || typeof problem !== 'object' || depth > 5) return 'DATABASE_UNAVAILABLE';
  const value = problem as Record<string, unknown>;
  if (['P1000', '28P01', '28000'].includes(String(value.code)) || value.kind === 'AuthenticationFailed') return 'DATABASE_AUTHENTICATION_FAILED';
  if (['P2021', 'P2022', '42P01', '42703'].includes(String(value.code))) return 'DATABASE_SCHEMA_UNAVAILABLE';
  for (const key of ['cause', 'meta', 'driverAdapterError']) {
    const code = databaseFailureCode(value[key], depth + 1);
    if (code !== 'DATABASE_UNAVAILABLE') return code;
  }
  return 'DATABASE_UNAVAILABLE';
}

export class AuthRateLimitUnavailableError extends Error {
  readonly status = 503;
  constructor(problem: unknown) {
    super('Sign-in protection is temporarily unavailable. Please retry shortly.');
    this.name = 'AuthRateLimitUnavailableError';
    // Intentionally omit the raw cause from the thrown/logged error.
    console.error(JSON.stringify({ event: 'auth_operation_failed', stage: 'rate-limit', reason: databaseFailureCode(problem) }));
  }
}
