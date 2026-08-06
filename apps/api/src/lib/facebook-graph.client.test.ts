import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertFacebookBasicOAuthUrl,
  FACEBOOK_FORBIDDEN_BASIC_OAUTH_SCOPES,
  FACEBOOK_OAUTH_BASIC_SCOPES,
  parseFacebookOAuthScopesFromAuthorizeUrl,
  usesFacebookLoginForBusinessConfig,
} from '@titan/shared';
import { FacebookGraphClient } from './facebook-graph.client.js';

const TEST_CONFIG = {
  appId: '1234567890',
  appSecret: 'test-secret-not-logged',
  redirectUri: 'https://young-guns-os-staging.up.railway.app/api/v1/facebook-business/oauth/callback',
};

describe('FacebookGraphClient OAuth URL (least-privilege)', () => {
  it('initial OAuth URL requests pages_show_list only', () => {
    const client = new FacebookGraphClient(TEST_CONFIG);
    const url = client.buildAuthorizeUrl('state-token-abc');
    const scopes = parseFacebookOAuthScopesFromAuthorizeUrl(url);
    assert.deepEqual(scopes, FACEBOOK_OAUTH_BASIC_SCOPES);
    const check = assertFacebookBasicOAuthUrl(url);
    assert.equal(check.ok, true, check.violations.join('; '));
  });

  it('does not request messaging, leads, insights or visitor-content scopes', () => {
    const client = new FacebookGraphClient(TEST_CONFIG);
    const url = client.buildAuthorizeUrl('state-token-abc');
    const forbidden = [
      'pages_messaging',
      'leads_retrieval',
      'read_insights',
      'pages_read_user_content',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_engagement',
      'pages_manage_metadata',
    ];
    for (const scope of forbidden) {
      assert.equal(url.includes(scope), false, `URL must not include ${scope}`);
    }
  });

  it('does not include Instagram scopes', () => {
    const client = new FacebookGraphClient(TEST_CONFIG);
    const url = client.buildAuthorizeUrl('state-token-abc');
    assert.equal(url.includes('instagram'), false);
  });

  it('never exposes app secret in authorize URL', () => {
    const client = new FacebookGraphClient(TEST_CONFIG);
    const url = client.buildAuthorizeUrl('state-token-abc');
    assert.equal(url.includes('test-secret'), false);
    assert.equal(url.includes('app_secret'), false);
  });

  it('uses config_id flow without scope when META_LOGIN_CONFIG_ID is configured', () => {
    const client = new FacebookGraphClient({
      ...TEST_CONFIG,
      loginConfigId: '9876543210',
    });
    const url = client.buildAuthorizeUrl('state-token-abc');
    assert.equal(usesFacebookLoginForBusinessConfig(url), true);
    assert.equal(new URL(url).searchParams.get('scope'), null);
    assert.equal(new URL(url).searchParams.get('config_id'), '9876543210');
  });

  it('rejects config_id combined with scope parameter', () => {
    const url =
      'https://www.facebook.com/v21.0/dialog/oauth?client_id=1&redirect_uri=https%3A%2F%2Fexample.com&state=s&config_id=cfg&scope=pages_show_list';
    const check = assertFacebookBasicOAuthUrl(url);
    assert.equal(check.ok, false);
    assert.match(check.violations.join(' '), /config_id flow must not combine scope/);
  });

  it('flags legacy full scope bundle as invalid for basic connect', () => {
    const legacyScope = FACEBOOK_FORBIDDEN_BASIC_OAUTH_SCOPES.slice(0, 3).join(',');
    const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=1&redirect_uri=https%3A%2F%2Fexample.com&state=s&scope=pages_show_list,${legacyScope}`;
    const check = assertFacebookBasicOAuthUrl(url);
    assert.equal(check.ok, false);
    assert.ok(check.violations.length > 0);
  });
});
