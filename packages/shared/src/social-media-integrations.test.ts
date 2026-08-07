import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSocialConnectionHealth,
  buildSocialPlatformHonesty,
  buildSocialProviderInfo,
  buildSocialReplySuggestion,
  canAccessSocialMediaIntegrations,
  canApproveSocialOutbound,
  canWriteSocialMediaIntegrations,
  defaultSocialPermissions,
  emptySocialMonitoringCounts,
  formatSocialConnectionStatus,
  SOCIAL_MEDIA_PRODUCT_COPY,
  SOCIAL_PLATFORMS,
} from './social-media-integrations.js';

describe('social media integrations foundation', () => {
  it('RBAC mirrors marketing agent — Technician/Client denied; Owner approves outbound', () => {
    assert.equal(
      canAccessSocialMediaIntegrations({
        roleName: 'Manager',
        permissions: ['marketing:read'],
      }),
      true,
    );
    assert.equal(
      canAccessSocialMediaIntegrations({
        roleName: 'Technician',
        permissions: ['*', 'marketing:write'],
      }),
      false,
    );
    assert.equal(
      canWriteSocialMediaIntegrations({
        roleName: 'Manager',
        permissions: ['marketing:read'],
      }),
      false,
    );
    assert.equal(
      canApproveSocialOutbound({
        roleName: 'Manager',
        permissions: ['marketing:write'],
      }),
      false,
    );
    assert.equal(
      canApproveSocialOutbound({
        roleName: 'Company Owner',
        permissions: ['marketing:write'],
      }),
      true,
    );
  });

  it('covers five platforms and never enables auto outbound', () => {
    assert.deepEqual(SOCIAL_PLATFORMS, [
      'facebook',
      'instagram',
      'tiktok',
      'linkedin',
      'google_business',
    ]);
    const perms = defaultSocialPermissions();
    assert.equal(perms.allowOutboundPublish, false);
    assert.equal(perms.allowAutoReply, false);
  });

  it('provider/health honesty never claims live verification', () => {
    const provider = buildSocialProviderInfo('facebook', true);
    assert.equal(provider.authorizeUrlAvailable, false);
    assert.equal(provider.syncAvailable, false);
    assert.equal(provider.publishAvailable, false);
    const health = buildSocialConnectionHealth({
      status: 'connected',
      hasCredentials: true,
      oauthAppConfigured: true,
    });
    assert.equal(health.liveProviderVerified, false);
    assert.equal(health.healthy, true);
    const honesty = buildSocialPlatformHonesty({
      oauthConfiguredByPlatform: { facebook: true },
    });
    assert.equal(honesty.find((p) => p.platform === 'facebook')!.liveSyncAvailable, false);
  });

  it('reply suggestions are drafts and never claim sent', () => {
    const suggestion = buildSocialReplySuggestion({
      platform: 'instagram',
      itemKind: 'comment',
      authorName: 'Alex',
      body: 'Do you fix geysers?',
    });
    assert.match(suggestion.body, /not sent/i);
    assert.match(suggestion.body, /Owner approval/i);
    assert.match(suggestion.body, /No automatic replies/i);
  });

  it('empty monitoring counts stay zero — no invented engagement', () => {
    const counts = emptySocialMonitoringCounts();
    assert.equal(counts.total, 0);
    assert.equal(formatSocialConnectionStatus('connected'), 'Credentials stored');
    assert.match(SOCIAL_MEDIA_PRODUCT_COPY.oauthHonesty, /never means a verified live/i);
  });
});
