import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptXeroCredentials,
  encryptXeroCredentials,
  encryptXeroOAuthCredentials,
  hashOAuthState,
  isXeroOAuthCredentials,
} from '../lib/crypto.js';
import { createDeterministicOAuthState } from './xero-oauth.service.js';

const TEST_ENCRYPTION_KEY = 'test-integrations-encryption-key-32chars';

test('hashOAuthState produces stable hashed values without storing raw state', () => {
  const state = 'opaque-oauth-state-value';
  assert.equal(hashOAuthState(state), hashOAuthState(state));
  assert.notEqual(hashOAuthState(state), hashOAuthState(`${state}-different`));
});

test('encryptXeroOAuthCredentials round-trips OAuth token payloads', () => {
  const encrypted = encryptXeroOAuthCredentials(
    {
      version: 2,
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      expiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
    },
    TEST_ENCRYPTION_KEY,
  );

  const decrypted = decryptXeroCredentials(encrypted, TEST_ENCRYPTION_KEY);

  assert.equal(isXeroOAuthCredentials(decrypted), true);

  if (isXeroOAuthCredentials(decrypted)) {
    assert.equal(decrypted.accessToken, 'access-token-value');
    assert.equal(decrypted.refreshToken, 'refresh-token-value');
    assert.match(decrypted.expiresAt, /^2030-01-01/);
  }
});

test('legacy Xero credentials are detected separately from OAuth credentials', () => {
  const oauthEncrypted = encryptXeroOAuthCredentials(
    {
      version: 2,
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: new Date().toISOString(),
    },
    TEST_ENCRYPTION_KEY,
  );

  const legacyEncrypted = encryptXeroCredentials(
    {
      clientId: 'legacy-client-id',
      clientSecret: 'legacy-client-secret',
    },
    TEST_ENCRYPTION_KEY,
  );

  const oauthCredentials = decryptXeroCredentials(oauthEncrypted, TEST_ENCRYPTION_KEY);
  const legacyCredentials = decryptXeroCredentials(legacyEncrypted, TEST_ENCRYPTION_KEY);

  assert.equal(isXeroOAuthCredentials(oauthCredentials), true);
  assert.equal(isXeroOAuthCredentials(legacyCredentials), false);
});

test('createDeterministicOAuthState supports predictable OAuth test fixtures', () => {
  assert.equal(
    createDeterministicOAuthState('tenant-a:user-a'),
    createDeterministicOAuthState('tenant-a:user-a'),
  );
  assert.notEqual(
    createDeterministicOAuthState('tenant-a:user-a'),
    createDeterministicOAuthState('tenant-b:user-b'),
  );
});

test('OAuth credential payloads do not include legacy client credential fields', () => {
  const encrypted = encryptXeroOAuthCredentials(
    {
      version: 2,
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      expiresAt: new Date().toISOString(),
    },
    TEST_ENCRYPTION_KEY,
  );

  assert.equal(encrypted.includes('access-token-value'), false);
  assert.equal(encrypted.includes('refresh-token-value'), false);
  assert.equal(encrypted.includes('clientId'), false);
});
