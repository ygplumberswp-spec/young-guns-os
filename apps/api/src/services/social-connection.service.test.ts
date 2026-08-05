import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDefaultSocialConnectionAdapters,
  detectSocialConnectionOauthConfigured,
} from '../lib/social-connection-provider.adapter.js';
import { hashOAuthState } from '../lib/crypto.js';

describe('social-connection provider adapters', () => {
  it('detects oauth configuration from env flags', () => {
    const configured = detectSocialConnectionOauthConfigured();
    assert.equal(typeof configured.facebook, 'boolean');
    assert.equal(typeof configured.tiktok, 'boolean');
  });

  it('mock oauth produces authorize URLs when configured', () => {
    const prevMeta = process.env.META_APP_ID;
    const prevMock = process.env.SOCIAL_CONNECTION_MOCK_OAUTH;
    process.env.META_APP_ID = 'test-app';
    process.env.SOCIAL_CONNECTION_MOCK_OAUTH = '1';
    try {
      const adapters = createDefaultSocialConnectionAdapters();
      const url = adapters.facebook.buildAuthorizeUrl('state-abc', 'https://app/callback');
      assert.ok(url?.includes('mock=1'));
      assert.ok(url?.includes('facebook'));
    } finally {
      if (prevMeta === undefined) delete process.env.META_APP_ID;
      else process.env.META_APP_ID = prevMeta;
      if (prevMock === undefined) delete process.env.SOCIAL_CONNECTION_MOCK_OAUTH;
      else process.env.SOCIAL_CONNECTION_MOCK_OAUTH = prevMock;
    }
  });

  it('OAuth state hashing is deterministic', () => {
    assert.equal(hashOAuthState('abc'), hashOAuthState('abc'));
    assert.notEqual(hashOAuthState('abc'), hashOAuthState('def'));
  });

  it('TikTok requires provider review by default', () => {
    const adapters = createDefaultSocialConnectionAdapters();
    assert.equal(adapters.tiktok.requiresProviderReview(), true);
  });
});
