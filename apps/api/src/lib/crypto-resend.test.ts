import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decryptResendCredentials, encryptResendCredentials } from './crypto.js';

const KEY = 'test-integrations-encryption-key-32ch';

describe('Resend credential encryption', () => {
  it('round-trips api key and webhook secret', () => {
    const encrypted = encryptResendCredentials(
      { apiKey: 're_test_abc', webhookSecret: 'whsec_dGVzdA==' },
      KEY,
    );
    const decrypted = decryptResendCredentials(encrypted, KEY);
    assert.equal(decrypted.apiKey, 're_test_abc');
    assert.equal(decrypted.webhookSecret, 'whsec_dGVzdA==');
  });

  it('rejects empty api key payloads', () => {
    const encrypted = encryptResendCredentials({ apiKey: '   ' }, KEY);
    assert.throws(() => decryptResendCredentials(encrypted, KEY));
  });
});
