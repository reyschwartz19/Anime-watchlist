import assert from 'node:assert/strict';
import test from 'node:test';
import { providerErrorCode, providerErrorMessage } from './provider-errors';
test('classifies native and SDK-wrapped credential errors with actionable recovery', () => {
  assert.match(providerErrorMessage({ code: 'API_ERROR', error: { code: 'INVALID_OTP' } }), /not valid/);
  assert.match(providerErrorMessage({ code: 'OTP_EXPIRED' }), /expired.*new one/);
  assert.match(providerErrorMessage({ status: 429 }), /Wait/);
  assert.equal(providerErrorCode({ code: 'API_ERROR', error: { code: 'EMAIL_NOT_VERIFIED' } }), 'EMAIL_NOT_VERIFIED');
});
