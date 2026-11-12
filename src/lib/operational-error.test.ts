import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { EnvironmentError } from './environment';
import { AuthRateLimitUnavailableError, databaseDiagnostic } from './operational-error';

test('safe diagnostics separate environment, Prisma, PostgreSQL, network, TLS and transaction failures', () => {
  const cases = [
    [new EnvironmentError('DATABASE_URL_UNPOOLED', 'private-value', 'missing'), 'ENVIRONMENT_VALIDATION_FAILED'],
    [{ code: 'P2028', message: 'Transaction API error: Unable to start a transaction in the given time.' }, 'DATABASE_TRANSACTION_START_TIMEOUT'],
    [{ code: 'P2028', message: 'A query cannot be executed on an expired transaction.' }, 'DATABASE_TRANSACTION_EXECUTION_TIMEOUT'],
    [{ code: 'P2028' }, 'DATABASE_TRANSACTION_FAILED'],
    [{ code: 'P2034' }, 'DATABASE_TRANSACTION_FAILED'],
    [{ code: 'P1001' }, 'DATABASE_NETWORK_FAILED'],
    [{ code: 'P2024' }, 'DATABASE_CONNECTION_TIMEOUT'],
    [new Error('Connection terminated due to connection timeout'), 'DATABASE_CONNECTION_TIMEOUT'],
    [{ code: 'EAI_AGAIN' }, 'DATABASE_NETWORK_FAILED'],
    [{ code: 'ETIMEDOUT' }, 'DATABASE_CONNECTION_TIMEOUT'],
    [{ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'DATABASE_TLS_FAILED'],
    [{ meta: { driverAdapterError: { cause: { originalCode: '40001', kind: 'TransactionWriteConflict' } } } }, 'DATABASE_TRANSACTION_FAILED'],
    [{ code: 'P2010', meta: { code: '42P01' } }, 'DATABASE_SCHEMA_UNAVAILABLE'],
    [{ code: '53300' }, 'DATABASE_CONNECTION_LIMIT'],
    [{ code: 'P2002' }, 'DATABASE_PRISMA_ERROR'],
    [{ code: 'P0001' }, 'DATABASE_DRIVER_ERROR'],
  ] as const;
  for (const [error, expected] of cases) assert.equal(databaseDiagnostic(error).reason, expected);
});

test('nested and circular driver failures retain only known code fields and never secrets', () => {
  const failure: Record<string, unknown> = {
    code: 'P2028', name: 'PrismaClientKnownRequestError', message: 'secret-database-url', stack: 'private-stack',
    meta: { params: 'secret-connection-parameters', driverAdapterError: { cause: { kind: 'postgres', originalCode: '57014', message: 'private-query', detail: 'private-password' } } },
    errors: [Object.assign(new Error('secret-hostname'), { code: 'ECONNRESET' })],
  };
  failure.cause = failure;
  const result = databaseDiagnostic(failure);
  assert.deepEqual(result.prismaCodes, ['P2028']);
  assert.deepEqual(result.postgresCodes, ['57014']);
  assert.deepEqual(result.driverCodes, ['ECONNRESET']);
  assert.doesNotMatch(JSON.stringify(result), /secret|private|params|message|stack/);
});

test('temporary detailed diagnostics are emitted only in Preview and raw causes never escape', () => {
  const original = process.env.VERCEL_ENV;
  const logs: string[] = [];
  const logger = mock.method(console, 'error', (message: unknown) => logs.push(String(message)));
  try {
    process.env.VERCEL_ENV = 'preview';
    const error = new AuthRateLimitUnavailableError(new EnvironmentError('DATABASE_URL_UNPOOLED', 'private-secret', 'neon-tls'), 'database-initialization');
    assert.equal(error.status, 503);
    const entry = JSON.parse(logs[0]);
    assert.deepEqual(entry.diagnostic.environment, { key: 'DATABASE_URL_UNPOOLED', check: 'neon-tls' });
    assert.equal(entry.diagnostic.phase, 'database-initialization');
    process.env.VERCEL_ENV = 'production';
    new AuthRateLimitUnavailableError({ code: 'P2028', message: 'private-secret' }, 'transaction-start');
    assert.equal(JSON.parse(logs[1]).diagnostic, undefined);
    assert.doesNotMatch(logs.join('') + JSON.stringify(error), /private-secret/);
  } finally {
    logger.mock.restore();
    if (original === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = original;
  }
});
