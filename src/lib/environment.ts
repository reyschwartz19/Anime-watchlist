/** Validation errors identify keys only; never include supplied values. */
type Environment = Record<string, string | undefined>;
export const environmentChecks = [
  'missing', 'surrounding-whitespace', 'literal-quotes', 'url-format', 'app-origin', 'auth-url',
  'secret-length', 'verification-method', 'postgres-url', 'neon-tls', 'credential-encoding',
  'preview-pooled-host', 'preview-direct-host', 'preview-endpoint', 'preview-database',
  'preview-role', 'preview-password', 'positive-integer',
] as const;
export type EnvironmentCheck = typeof environmentChecks[number];

export class EnvironmentError extends Error {
  constructor(readonly key: string, requirement: string, readonly check: EnvironmentCheck) {
    super(`${key} ${requirement}`);
    this.name = 'EnvironmentError';
  }
}

function required(env: Environment, key: string): string {
  const value = env[key];
  if (!value) throw new EnvironmentError(key, 'must be set.', 'missing');
  if (value !== value.trim()) throw new EnvironmentError(key, 'must not contain surrounding whitespace.', 'surrounding-whitespace');
  if (/^["']|["']$/.test(value)) throw new EnvironmentError(key, 'must not contain literal surrounding quotes.', 'literal-quotes');
  return value;
}

function urlValue(env: Environment, key: string): URL {
  const value = required(env, key);
  try { return new URL(value); }
  catch { throw new EnvironmentError(key, 'must be a valid URL without literal quotes.', 'url-format'); }
}

export function appOrigin(env: Environment = process.env): string {
  const url = urlValue(env, 'APP_URL');
  const local = env.VERCEL !== '1' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new EnvironmentError('APP_URL', 'must be an exact HTTPS origin (HTTP loopback is allowed locally).', 'app-origin');
  }
  return url.origin;
}

export function authConfiguration(env: Environment = process.env) {
  const url = urlValue(env, 'NEON_AUTH_BASE_URL');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new EnvironmentError('NEON_AUTH_BASE_URL', 'must be the HTTPS Auth URL from the intended Neon branch.', 'auth-url');
  }
  const secret = required(env, 'NEON_AUTH_COOKIE_SECRET');
  if (secret.length < 32) throw new EnvironmentError('NEON_AUTH_COOKIE_SECRET', 'must contain at least 32 characters.', 'secret-length');
  const method = env.NEON_AUTH_EMAIL_VERIFICATION_METHOD;
  if (method !== undefined && method !== 'otp' && method !== 'link') {
    throw new EnvironmentError('NEON_AUTH_EMAIL_VERIFICATION_METHOD', 'must be otp or link.', 'verification-method');
  }
  return { baseUrl: url.toString().replace(/\/$/, ''), secret, origin: appOrigin(env) };
}

export function databaseUrl(key: 'DATABASE_URL' | 'DATABASE_URL_UNPOOLED', env: Environment = process.env): string {
  const url = urlValue(env, key);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.pathname.length < 2 || url.hash) {
    throw new EnvironmentError(key, 'must be a PostgreSQL URL with role, password and database.', 'postgres-url');
  }
  if (url.hostname.endsWith('.neon.tech') && !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')) {
    throw new EnvironmentError(key, 'must enable TLS for Neon.', 'neon-tls');
  }
  return required(env, key);
}

export function validatePreviewDatabasePair(env: Environment = process.env) {
  const pooled = new URL(databaseUrl('DATABASE_URL', env));
  const direct = new URL(databaseUrl('DATABASE_URL_UNPOOLED', env));
  const pairKey = 'DATABASE_URL / DATABASE_URL_UNPOOLED';
  function requireMatch(valid: boolean, check: EnvironmentCheck) {
    if (!valid) throw new EnvironmentError(pairKey, 'must pair pooled/direct Neon connections for the same endpoint, role, password and database.', check);
  }
  function decoded(value: string): string {
    try { return decodeURIComponent(value); }
    catch { throw new EnvironmentError(pairKey, 'must use valid percent encoding.', 'credential-encoding'); }
  }
  requireMatch(pooled.hostname.endsWith('.neon.tech') && pooled.hostname.includes('-pooler.'), 'preview-pooled-host');
  requireMatch(!direct.hostname.includes('-pooler.'), 'preview-direct-host');
  requireMatch(pooled.hostname.replace('-pooler.', '.') === direct.hostname, 'preview-endpoint');
  requireMatch(decoded(pooled.pathname) === decoded(direct.pathname), 'preview-database');
  requireMatch(decoded(pooled.username) === decoded(direct.username), 'preview-role');
  requireMatch(decoded(pooled.password) === decoded(direct.password), 'preview-password');
}

/** Only the platform-provided current Preview deployment may hand off to APP_URL. */
export function previewCanonicalOrigin(requestOrigin: string, env: Environment = process.env): string | null {
  if (env.VERCEL_ENV !== 'preview' || !env.VERCEL_URL || requestOrigin !== `https://${env.VERCEL_URL}`) return null;
  const canonical = appOrigin(env);
  return canonical === requestOrigin ? null : canonical;
}
