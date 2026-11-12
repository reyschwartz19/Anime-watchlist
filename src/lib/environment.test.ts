import assert from 'node:assert/strict';
import test from 'node:test';
import { appOrigin, authConfiguration, databaseUrl, previewCanonicalOrigin, validatePreviewDatabasePair } from './environment';

const env = {
  APP_URL: 'https://branch.example.test',
  DATABASE_URL: 'postgresql://role:encoded%40password@ep-preview-pooler.region.aws.neon.tech/neondb?sslmode=require',
  DATABASE_URL_UNPOOLED: 'postgresql://role:encoded%40password@ep-preview.region.aws.neon.tech/neondb?sslmode=require',
  NEON_AUTH_BASE_URL: 'https://ep-preview.neonauth.region.aws.neon.tech/neondb/auth',
  NEON_AUTH_COOKIE_SECRET: 'synthetic-cookie-secret-at-least-32-characters',
};

test('valid preview pair uses pooled app and direct migration connections', () => {
  assert.doesNotThrow(() => validatePreviewDatabasePair(env));
  assert.equal(databaseUrl('DATABASE_URL', env), env.DATABASE_URL);
  assert.equal(authConfiguration(env).origin, env.APP_URL);
});

test('database validation rejects mismatched endpoint, role, password, database, TLS and literal quotes without leaking values', () => {
  for (const url of [
    env.DATABASE_URL_UNPOOLED.replace('ep-preview.', 'ep-production.'),
    env.DATABASE_URL_UNPOOLED.replace('role:', 'different-role:'),
    env.DATABASE_URL_UNPOOLED.replace('encoded%40password', 'different-secret'),
    env.DATABASE_URL_UNPOOLED.replace('/neondb', '/otherdb'),
    env.DATABASE_URL_UNPOOLED.replace('sslmode=require', 'sslmode=disable'),
    `"${env.DATABASE_URL_UNPOOLED}"`,
  ]) {
    assert.throws(() => validatePreviewDatabasePair({ ...env, DATABASE_URL_UNPOOLED: url }), error => {
      assert.doesNotMatch(String(error), /encoded|different-secret|postgresql:\/\//);
      return true;
    });
  }
});

test('auth environment rejects quoted secrets, malformed origins and invalid verification methods', () => {
  for (const change of [{ APP_URL: 'https://example.test/path' }, { APP_URL: 'https://name:secret@example.test' }, { NEON_AUTH_BASE_URL: 'https://auth.test/auth?token=private' }, { NEON_AUTH_COOKIE_SECRET: '"private-cookie-secret-at-least-32-characters"' }, { NEON_AUTH_EMAIL_VERIFICATION_METHOD: 'unknown' }]) {
    assert.throws(() => authConfiguration({ ...env, ...change }), error => !String(error).includes('private'));
  }
  assert.equal(appOrigin({ APP_URL: 'http://localhost:3000' }), 'http://localhost:3000');
  assert.throws(() => appOrigin({ APP_URL: 'http://localhost:3000', VERCEL: '1' }));
});

test('only exact platform deployment redirects to canonical preview; production and unrelated hosts remain isolated', () => {
  const preview = { ...env, VERCEL_ENV: 'preview', VERCEL_URL: 'app-build-team.vercel.app' };
  assert.equal(previewCanonicalOrigin('https://app-build-team.vercel.app', preview), env.APP_URL);
  for (const host of [env.APP_URL, 'https://evil.vercel.app', 'https://app-build-team.vercel.app.evil.test']) {
    assert.equal(previewCanonicalOrigin(host, preview), null);
  }
  assert.equal(previewCanonicalOrigin('https://app-build-team.vercel.app', { ...preview, VERCEL_ENV: 'production' }), null);
});
