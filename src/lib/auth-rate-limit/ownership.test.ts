import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { AuthRateLimitUnavailableError, databaseFailureCode } from '../operational-error';

let calls = 0;
let code = 'P1000';
mock.module('server-only', { namedExports: {} });
mock.module('../preview.ts', { namedExports: { previewEnabled: () => false } });
mock.module('../db.ts', { namedExports: { getDb: () => ({ $transaction: async () => { calls++; throw { code, message: 'secret-database-url-never-log' }; } }) } });
const { enforceAuthLimit } = await import('../rate-limit');

test('real authentication limiter fails closed on database authentication and connection failures with safe classification', async () => {
  const messages: string[] = [];
  const logger = mock.method(console, 'error', (message: unknown) => { messages.push(String(message)); });
  try {
    await assert.rejects(enforceAuthLimit('test-ip', true), AuthRateLimitUnavailableError);
    code = 'P1001';
    await assert.rejects(enforceAuthLimit('test-ip', false), AuthRateLimitUnavailableError);
    assert.equal(calls, 2);
    assert.match(messages[0], /DATABASE_AUTHENTICATION_FAILED/);
    assert.match(messages[1], /DATABASE_NETWORK_FAILED/);
    assert.doesNotMatch(messages.join(''), /secret-database-url/);
  } finally { logger.mock.restore(); }
});

test('classifies nested Prisma adapter failures without copying raw diagnostics', () => {
  assert.equal(databaseFailureCode({ meta: { driverAdapterError: { cause: { kind: 'AuthenticationFailed' } } } }), 'DATABASE_AUTHENTICATION_FAILED');
  assert.equal(databaseFailureCode({ code: '28P01' }), 'DATABASE_AUTHENTICATION_FAILED');
  assert.equal(databaseFailureCode({ code: '42P01' }), 'DATABASE_SCHEMA_UNAVAILABLE');
});
