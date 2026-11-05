import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityReceipt, hashConnectionIdentity, verifyIdentityReceipt } from './migration-identity';

const now = new Date('2026-11-04T10:00:00.000Z');
const identity = { userId: 'internal-user', authProviderId: 'provider-user', email: 'viewer@example.test', emailVerified: true };
const options = { authBaseUrl: 'https://preview.neonauth.example/db/auth', databaseUrl: 'postgresql://role:secret@preview-pooler.example/db?sslmode=require', secret: 'a'.repeat(64), now };
const expected = { ...options, destinationUserId: identity.userId };

test('only a verified login can mint a destination receipt; provider ID is separate', () => {
  assert.throws(() => createIdentityReceipt({ ...identity, emailVerified: false }, options));
  const receipt = createIdentityReceipt(identity, options);
  assert.equal(verifyIdentityReceipt(receipt, expected).authProviderId, 'provider-user');
  assert.notEqual(receipt.payload.authProviderId, receipt.payload.userId);
});

test('receipt rejects another user, branch, database, role, or signing key', () => {
  const receipt = createIdentityReceipt(identity, options);
  for (const mismatch of [
    { destinationUserId: 'other-user' },
    { authBaseUrl: 'https://other.neonauth.example/db/auth' },
    { databaseUrl: 'postgresql://role:secret@other.example/db' },
    { databaseUrl: 'postgresql://other:secret@preview.example/db' },
    { secret: 'b'.repeat(64) },
  ]) assert.throws(() => verifyIdentityReceipt(receipt, { ...expected, ...mismatch }));
});

test('receipt expires, rejects future issuance and cannot be modified', () => {
  const receipt = createIdentityReceipt(identity, options);
  assert.throws(() => verifyIdentityReceipt(receipt, { ...expected, now: new Date(now.getTime() + 15 * 60_000) }));
  assert.throws(() => verifyIdentityReceipt(receipt, { ...expected, now: new Date(now.getTime() - 60_000) }));
  assert.throws(() => verifyIdentityReceipt({ ...receipt, payload: { ...receipt.payload, userId: 'other-user' } }, expected));
  assert.throws(() => verifyIdentityReceipt({}, expected));
});

test('pooled and direct URLs bind to the same database; passwords are not stored', () => {
  assert.equal(hashConnectionIdentity(options.databaseUrl), hashConnectionIdentity('postgresql://role:rotated@preview.example:5432/db'));
  const receipt = createIdentityReceipt(identity, options);
  assert.ok(!JSON.stringify(receipt).includes('role:secret'));
  assert.equal(verifyIdentityReceipt(receipt, { ...expected, databaseUrl: 'postgresql://role:rotated@preview.example/db' }).userId, identity.userId);
});
