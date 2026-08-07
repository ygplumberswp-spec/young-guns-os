import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decryptGmailCredentials,
  encryptGmailCredentials,
  hashOAuthState,
} from '../lib/crypto.js';
import { GMAIL_OAUTH_SCOPES } from '../lib/gmail.client.js';
import { resolveGmailOAuthConfig } from '../config.js';
import { createDeterministicGmailOAuthState } from './gmail-oauth.service.js';

const TEST_ENCRYPTION_KEY = 'test-integrations-encryption-key-32chars!!';

describe('Gmail OAuth foundation', () => {
  it('hashOAuthState is stable and does not echo raw state', () => {
    const state = 'gmail-oauth-state-value';
    assert.equal(hashOAuthState(state), hashOAuthState(state));
    assert.notEqual(hashOAuthState(state), state);
  });

  it('encrypts access + refresh tokens with INTEGRATIONS_ENCRYPTION_KEY', () => {
    const encrypted = encryptGmailCredentials(
      {
        version: 1,
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
        expiresAt: '2030-01-01T00:00:00.000Z',
        emailAddress: 'yg@younggunsplumbing.co.za',
        scope: GMAIL_OAUTH_SCOPES.join(' '),
      },
      TEST_ENCRYPTION_KEY,
    );
    assert.equal(encrypted.includes('access-secret'), false);
    assert.equal(encrypted.includes('refresh-secret'), false);
    const decrypted = decryptGmailCredentials(encrypted, TEST_ENCRYPTION_KEY);
    assert.equal(decrypted.accessToken, 'access-secret');
    assert.equal(decrypted.refreshToken, 'refresh-secret');
    assert.equal(decrypted.emailAddress, 'yg@younggunsplumbing.co.za');
  });

  it('resolveGmailOAuthConfig returns not configured without client secrets', () => {
    const result = resolveGmailOAuthConfig(
      {
        GOOGLE_CLIENT_ID: undefined,
        GOOGLE_CLIENT_SECRET: undefined,
        GOOGLE_REDIRECT_URI: undefined,
      } as never,
      'https://young-guns-os-staging.up.railway.app',
    );
    assert.equal(result.configured, false);
  });

  it('resolveGmailOAuthConfig builds staging redirect URI when configured', () => {
    const result = resolveGmailOAuthConfig(
      {
        GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_REDIRECT_URI: undefined,
      } as never,
      'https://young-guns-os-staging.up.railway.app',
    );
    assert.equal(result.configured, true);
    if (result.configured) {
      assert.equal(
        result.redirectUri,
        'https://young-guns-os-staging.up.railway.app/api/v1/communications-platform/gmail/oauth/callback',
      );
      assert.equal(result.clientId, 'client-id.apps.googleusercontent.com');
    }
  });

  it('resolveGmailOAuthConfig prefers explicit GOOGLE_REDIRECT_URI', () => {
    const result = resolveGmailOAuthConfig(
      {
        GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_REDIRECT_URI:
          'https://young-guns-os-staging.up.railway.app/api/v1/communications-platform/gmail/oauth/callback',
      } as never,
      'http://localhost:3000',
    );
    assert.equal(result.configured, true);
    if (result.configured) {
      assert.equal(
        result.redirectUri,
        'https://young-guns-os-staging.up.railway.app/api/v1/communications-platform/gmail/oauth/callback',
      );
    }
  });

  it('oauth status honesty: app-configured without tenant tokens is disconnected not not_configured', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const oauthSource = readFileSync(join(here, 'gmail-oauth.service.ts'), 'utf8');
    const healthSource = readFileSync(join(here, 'communications-platform.service.ts'), 'utf8');
    assert.ok(
      oauthSource.includes(": 'disconnected'") || oauthSource.includes(': "disconnected"'),
      'getOAuthStatus must use disconnected when OAuth app is configured but tenant is not connected',
    );
    assert.ok(
      healthSource.includes("oauthAppReady ? 'disconnected'"),
      'toHealth must map OAuth-app-ready empty tenant to disconnected',
    );
    assert.ok(
      !oauthSource.includes("account?.status ?? 'not_configured'"),
      'must not default tenant status to not_configured when OAuth app exists',
    );
  });

  it('Gmail scopes include readonly, compose, send, and modify', () => {
    assert.ok(GMAIL_OAUTH_SCOPES.some((s) => s.endsWith('gmail.readonly')));
    assert.ok(GMAIL_OAUTH_SCOPES.some((s) => s.endsWith('gmail.compose')));
    assert.ok(GMAIL_OAUTH_SCOPES.some((s) => s.endsWith('gmail.send')));
    assert.ok(GMAIL_OAUTH_SCOPES.some((s) => s.endsWith('gmail.modify')));
  });

  it('createDeterministicGmailOAuthState is stable for tests', () => {
    assert.equal(
      createDeterministicGmailOAuthState('tenant:user'),
      createDeterministicGmailOAuthState('tenant:user'),
    );
  });
});
