import { EnvironmentError, environmentChecks } from './environment';

export type AuthDatabasePhase = 'configuration' | 'database-initialization' | 'transaction-start' | 'advisory-lock' | 'budget-read' | 'budget-write' | 'transaction-commit';

const environmentKeys = new Set(['APP_URL', 'NEON_AUTH_BASE_URL', 'NEON_AUTH_COOKIE_SECRET', 'NEON_AUTH_EMAIL_VERIFICATION_METHOD', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'DATABASE_URL / DATABASE_URL_UNPOOLED', 'AUTH_READ_RPM', 'AUTH_WRITE_RPM']);
const networkCodes = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE']);
const tlsCodes = new Set(['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID']);
const adapterKinds = new Set(['AuthenticationFailed', 'DatabaseAccessDenied', 'DatabaseDoesNotExist', 'DatabaseNotReachable', 'ConnectionClosed', 'SocketTimeout', 'TlsConnectionError', 'TooManyConnections', 'TransactionWriteConflict', 'TableDoesNotExist', 'ColumnNotFound', 'postgres']);
const errorNames = new Set(['Error', 'TypeError', 'AggregateError', 'EnvironmentError', 'TimeoutError', 'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError', 'PrismaClientInitializationError', 'PrismaClientValidationError', 'DriverAdapterError', 'TransactionManagerError']);

/** Closed-schema diagnostic: no message, stack, SQL, URLs, params or arbitrary metadata. */
export function databaseDiagnostic(problem: unknown) {
  const prismaCodes = new Set<string>();
  const postgresCodes = new Set<string>();
  const driverCodes = new Set<string>();
  const kinds = new Set<string>();
  const names = new Set<string>();
  const seen = new Set<object>();
  let environment: { key: string; check: string } | undefined;
  let timeout: 'connection' | 'transaction-start' | 'transaction-execution' | undefined;

  function visit(input: unknown, depth = 0) {
    if (!input || typeof input !== 'object' || depth > 8 || seen.has(input) || seen.size >= 32) return;
    seen.add(input);
    const value = input as Record<string, unknown>;
    if (typeof value.name === 'string' && errorNames.has(value.name)) names.add(value.name);
    if (value.name === 'TimeoutError') timeout ??= 'connection';
    if (input instanceof EnvironmentError && environmentKeys.has(input.key) && environmentChecks.includes(input.check)) {
      environment = { key: input.key, check: input.check };
    }
    for (const field of ['code', 'originalCode']) {
      const code = value[field];
      if (typeof code !== 'string') continue;
      if (/^P[1-6]\d{3}$/.test(code)) prismaCodes.add(code);
      else if (/^(?:[0-9][0-9A-Z]|XX|HV|F0|P0)[0-9A-Z]{3}$/.test(code)) postgresCodes.add(code);
      else if (networkCodes.has(code) || tlsCodes.has(code)) driverCodes.add(code);
    }
    if (typeof value.kind === 'string' && adapterKinds.has(value.kind)) kinds.add(value.kind);
    // pg and Prisma sometimes throw code-less timeout errors. Match fixed SDK
    // phrases only and emit an enum; the message itself is never logged.
    if (typeof value.message === 'string') {
      if (value.message.includes('Unable to start a transaction in the given time.')) timeout = 'transaction-start';
      else if (value.message.includes('cannot be executed on an expired transaction')) timeout = 'transaction-execution';
      else if (value.message.includes('timeout exceeded when trying to connect') || value.message.includes('Connection terminated due to connection timeout')) timeout ??= 'connection';
    }
    for (const field of ['cause', 'meta', 'driverAdapterError']) visit(value[field], depth + 1);
    if (Array.isArray(value.errors)) for (const item of value.errors.slice(0, 8)) visit(item, depth + 1);
  }
  visit(problem);
  const has = (...codes: string[]) => codes.some(code => prismaCodes.has(code) || postgresCodes.has(code) || driverCodes.has(code) || kinds.has(code));
  let reason = 'DATABASE_UNCLASSIFIED_ERROR';
  if (environment) reason = 'ENVIRONMENT_VALIDATION_FAILED';
  else if (has('P1000', '28P01', '28000', 'AuthenticationFailed')) reason = 'DATABASE_AUTHENTICATION_FAILED';
  else if (has('P2021', 'P2022', '42P01', '42703', 'TableDoesNotExist', 'ColumnNotFound')) reason = 'DATABASE_SCHEMA_UNAVAILABLE';
  else if (has('P1011', 'TlsConnectionError') || [...driverCodes].some(code => tlsCodes.has(code))) reason = 'DATABASE_TLS_FAILED';
  else if (timeout === 'transaction-start') reason = 'DATABASE_TRANSACTION_START_TIMEOUT';
  else if (timeout === 'transaction-execution') reason = 'DATABASE_TRANSACTION_EXECUTION_TIMEOUT';
  else if (timeout === 'connection' || has('P1002', 'P2024', 'ETIMEDOUT', 'SocketTimeout')) reason = 'DATABASE_CONNECTION_TIMEOUT';
  else if (has('P2028', 'P2034', '40001', '40P01', 'TransactionWriteConflict')) reason = 'DATABASE_TRANSACTION_FAILED';
  else if (has('53300', 'TooManyConnections')) reason = 'DATABASE_CONNECTION_LIMIT';
  else if (has('P1001', 'P1017', 'DatabaseNotReachable', 'ConnectionClosed') || [...driverCodes].some(code => networkCodes.has(code))) reason = 'DATABASE_NETWORK_FAILED';
  else if (prismaCodes.size) reason = 'DATABASE_PRISMA_ERROR';
  else if (postgresCodes.size || kinds.size) reason = 'DATABASE_DRIVER_ERROR';
  return { reason, ...(environment ? { environment } : {}), ...(timeout ? { timeout } : {}),
    prismaCodes: [...prismaCodes], postgresCodes: [...postgresCodes], driverCodes: [...driverCodes], adapterKinds: [...kinds], errorNames: [...names] };
}

export function databaseFailureCode(problem: unknown): string {
  return databaseDiagnostic(problem).reason;
}

export class AuthRateLimitUnavailableError extends Error {
  readonly status = 503;
  constructor(problem: unknown, phase?: AuthDatabasePhase) {
    super('Sign-in protection is temporarily unavailable. Please retry shortly.');
    this.name = 'AuthRateLimitUnavailableError';
    const diagnostic = databaseDiagnostic(problem);
    // Temporary Preview-only detail for the persistent 503 investigation.
    // Remove after a deployed failing request has identified the underlying code.
    console.error(JSON.stringify({ event: 'auth_operation_failed', stage: 'rate-limit', reason: diagnostic.reason,
      ...(process.env.VERCEL_ENV === 'preview' ? { diagnostic: { ...diagnostic, phase } } : {}) }));
  }
}
