import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Pure server/CLI module: never import from a Client Component.
export type IdentityPayload = {
  version: 1;
  userId: string;
  authProviderId: string;
  email: string;
  emailVerified: true;
  authBaseUrl: string;
  databaseFingerprint: string;
  issuedAt: string;
  expiresAt: string;
};

export type IdentityReceipt = { payload: IdentityPayload; signature: string };

export function normalizeAuthBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use the branch-specific HTTPS managed auth URL.');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('Invalid managed auth base URL.');
  return url.href.replace(/\/+$/, '');
}

/** Bind receipts to a database endpoint, database and role; exclude passwords. */
export function hashConnectionIdentity(connectionString: string): string {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A PostgreSQL connection URL is required.');
  const hostname = url.hostname.replace(/-pooler(?=\.)/, '').toLowerCase();
  return createHash('sha256').update(JSON.stringify([hostname, url.port || '5432', url.pathname, url.username])).digest('hex');
}

function requireSecret(secret: string) {
  if (secret.length < 32) throw new Error('MIGRATION_IDENTITY_SECRET must contain at least 32 characters.');
}

function sign(payload: IdentityPayload, secret: string): string {
  requireSecret(secret);
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('base64url');
}

export function createIdentityReceipt(
  identity: { userId: string; authProviderId: string; email: string; emailVerified: boolean },
  options: { authBaseUrl: string; databaseUrl: string; secret: string; now?: Date },
): IdentityReceipt {
  if (!identity.userId || !identity.authProviderId || !identity.email || !identity.emailVerified) {
    throw new Error('A server-verified session with verified email and an internal user ID is required.');
  }
  const now = options.now ?? new Date();
  const payload: IdentityPayload = {
    version: 1,
    userId: identity.userId,
    authProviderId: identity.authProviderId,
    email: identity.email,
    emailVerified: true,
    authBaseUrl: normalizeAuthBaseUrl(options.authBaseUrl),
    databaseFingerprint: hashConnectionIdentity(options.databaseUrl),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
  };
  return { payload, signature: sign(payload, options.secret) };
}

export function verifyIdentityReceipt(
  value: unknown,
  expected: { destinationUserId: string; authBaseUrl: string; databaseUrl: string; secret: string; now?: Date },
): IdentityPayload {
  if (!value || typeof value !== 'object') throw new Error('Destination identity receipt is missing.');
  const receipt = value as Partial<IdentityReceipt>;
  if (!receipt.payload || typeof receipt.signature !== 'string') throw new Error('Invalid destination identity receipt.');
  const p = receipt.payload;
  const actual = Buffer.from(receipt.signature, 'base64url');
  const valid = Buffer.from(sign(p, expected.secret), 'base64url');
  if (actual.length !== valid.length || !timingSafeEqual(actual, valid)) throw new Error('Destination identity signature is invalid.');
  const now = (expected.now ?? new Date()).getTime();
  const issuedAt = Date.parse(p.issuedAt);
  const expiresAt = Date.parse(p.expiresAt);
  if (p.version !== 1 || p.emailVerified !== true || !p.authProviderId || !p.email ||
      !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 30_000 || expiresAt <= now ||
      expiresAt <= issuedAt || expiresAt - issuedAt > 15 * 60_000) {
    throw new Error('Destination identity receipt is expired or malformed; sign in and download a fresh receipt.');
  }
  if (p.userId !== expected.destinationUserId || p.authBaseUrl !== normalizeAuthBaseUrl(expected.authBaseUrl) ||
      p.databaseFingerprint !== hashConnectionIdentity(expected.databaseUrl)) {
    throw new Error('Destination identity receipt does not match the requested user and database/auth branch.');
  }
  return p;
}
