import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  assertFacebookContentFeaturesOAuthUrl,
  FACEBOOK_CAPABILITY_REQUIREMENTS,
  resolveFacebookCapability,
  resolveFacebookConnectionState,
} from './facebook-business.js';
import {
  FACEBOOK_OAUTH_CONTENT_FEATURE_SCOPES,
  FACEBOOK_PARTIAL_STATE_LABEL_ACCOUNT_SELECTION,
  FACEBOOK_PARTIAL_STATE_LABEL_VERIFICATION,
  isFacebookStalePendingVerificationFailure,
  resolveFacebookEffectiveVerification,
  resolveFacebookPartialStateLabel,
} from './facebook-connection-health.js';
import {
  resolveFacebookConnectionActionPlan,
} from './facebook-connection-actions.js';
import { FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE } from './facebook-page-discovery-session.js';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(
  join(here, '../../../apps/api/src/services/facebook-business.service.ts'),
  'utf8',
);
const pageSource = readFileSync(
  join(here, '../../../apps/web/src/pages/facebook-business/FacebookBusinessPage.tsx'),
  'utf8',
);
const graphSource = readFileSync(
  join(here, '../../../apps/api/src/lib/facebook-graph.client.ts'),
  'utf8',
);

const NOW = new Date('2026-08-06T08:00:00.000Z');

describe('Facebook connection state J-6.7F13', () => {
  it('1. stored Page + successful verification resolves to connected', () => {
    const result = resolveFacebookConnectionState({
      appConfigured: true,
      hasStoredToken: true,
      pageSelected: true,
      pageName: 'Young Guns Plumbing - Cape Town',
      tokenExpiresAt: null,
      grantedPermissions: ['pages_show_list', 'business_management', 'pages_read_engagement'],
      lastVerification: {
        ok: true,
        authError: false,
        permissionError: false,
        providerUnavailable: false,
        checkedAt: NOW,
        message: 'Facebook responded successfully.',
      },
      disconnectedAt: null,
      now: NOW,
    });
    assert.equal(result.state, 'connected');
    assert.equal(result.label, 'Connected');
  });

  it('2. stale pending failure ignored when pages_read_engagement is granted', () => {
    const effective = resolveFacebookEffectiveVerification({
      timestamps: {
        lastConnectionAttemptAt: '2026-08-06T07:15:41.745Z',
        lastSuccessfulVerificationAt: null,
        lastFailedVerificationAt: '2026-08-06T07:15:41.745Z',
        lastSuccessfulSyncAt: null,
      },
      lastVerificationOk: false,
      lastVerifiedAt: new Date('2026-08-06T07:08:56.244Z'),
      lastVerificationMessage: FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE,
      lastVerificationAuthError: false,
      lastVerificationPermissionError: false,
      lastVerificationProviderUnavailable: false,
      pageSelected: true,
      grantedPermissions: ['pages_show_list', 'business_management', 'pages_read_engagement'],
      failedVerificationMessage: FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE,
    });
    assert.equal(effective, null);
    assert.equal(
      isFacebookStalePendingVerificationFailure({
        message: FACEBOOK_PAGE_DETAILS_VERIFICATION_PENDING_MESSAGE,
        pageSelected: true,
        grantedPermissions: ['pages_read_engagement'],
      }),
      true,
    );
  });

  it('3. no Page ID resolves to account selection required partial label', () => {
    const result = resolveFacebookConnectionState({
      appConfigured: true,
      hasStoredToken: true,
      pageSelected: false,
      tokenExpiresAt: null,
      grantedPermissions: ['pages_show_list'],
      lastVerification: null,
      disconnectedAt: null,
      now: NOW,
    });
    assert.equal(result.state, 'partial');
    assert.equal(result.label, FACEBOOK_PARTIAL_STATE_LABEL_ACCOUNT_SELECTION);
  });

  it('4. failed real verification on stored Page uses verification required label', () => {
    const result = resolveFacebookConnectionState({
      appConfigured: true,
      hasStoredToken: true,
      pageSelected: true,
      pageName: 'Young Guns Plumbing - Cape Town',
      tokenExpiresAt: null,
      grantedPermissions: ['pages_show_list', 'business_management'],
      lastVerification: {
        ok: false,
        authError: true,
        permissionError: false,
        providerUnavailable: false,
        checkedAt: NOW,
        message: 'Invalid OAuth access token.',
      },
      disconnectedAt: null,
      now: NOW,
    });
    assert.equal(result.state, 'reauthorisation_required');
  });

  it('5. clean URL guard remains on Facebook Business page', () => {
    assert.ok(pageSource.includes('clearFacebookOAuthReturnParams'));
    assert.ok(pageSource.includes('!connection?.pageId'));
    assert.ok(pageSource.includes('showPageDiscovery'));
  });

  it('6. Choose Page hidden when Page is stored via action plan', () => {
    const plan = resolveFacebookConnectionActionPlan('partial', { pageStored: true });
    assert.equal(plan.primary, 'check_health');
    assert.equal(plan.secondary.includes('choose_page'), false);
  });

  it('7. Check health shown for stored verified Page', () => {
    const plan = resolveFacebookConnectionActionPlan('connected', { missingContentFeatures: true });
    assert.equal(plan.primary, 'check_health');
    assert.ok(plan.secondary.includes('enable_content_features'));
  });

  it('8. content upgrade OAuth scope list is controlled', () => {
    assert.deepEqual(FACEBOOK_OAUTH_CONTENT_FEATURE_SCOPES, [
      'pages_show_list',
      'business_management',
      'pages_read_engagement',
      'pages_read_user_content',
      'pages_manage_posts',
      'pages_manage_engagement',
      'pages_manage_metadata',
      'read_insights',
    ]);
    assert.ok(graphSource.includes('buildContentFeaturesAuthorizeUrl'));
    assert.ok(serviceSource.includes('startContentFeaturesOAuth'));
    assert.ok(!graphSource.includes('pages_messaging'));
    assert.ok(!graphSource.includes('leads_retrieval'));
  });

  it('9. content OAuth callback preserves existing connection on partial grant', () => {
    assert.ok(serviceSource.includes("oauthTier === 'content_features'"));
    assert.ok(serviceSource.includes('declinedScopes'));
    assert.ok(serviceSource.includes('pageAccessToken: existingCredentials.pageAccessToken'));
  });

  it('10. granted scopes persisted on content OAuth callback', () => {
    assert.ok(serviceSource.includes('grantedPermissions,'));
    assert.ok(serviceSource.includes('declinedOAuthScopes: declinedScopes'));
  });

  it('11. declined scopes surfaced in redirect query', () => {
    assert.ok(serviceSource.includes('facebook=content-features-partial'));
    assert.ok(serviceSource.includes('declined='));
  });

  it('12. callback returns to clean Facebook Business URL', () => {
    assert.ok(serviceSource.includes('encodeFacebookContentFeaturesOAuthReturnPath'));
    assert.ok(pageSource.includes('content-features-granted'));
    assert.ok(pageSource.includes('clearFacebookOAuthReturnParams()'));
  });

  it('13. content OAuth does not auto-start page selection', () => {
    const block = serviceSource.slice(
      serviceSource.indexOf("if (oauthTier === 'content_features')"),
      serviceSource.indexOf("if (oauthTier === 'reconnect_wizard')"),
    );
    assert.equal(block.includes('pageId: null'), false);
    assert.equal(block.includes('discoverPagesForSelection'), false);
  });

  it('14. publishing requires pages_manage_posts', () => {
    const granted = resolveFacebookCapability('publish_posts', ['pages_read_engagement']);
    assert.equal(granted.available, false);
    const ready = resolveFacebookCapability('publish_posts', ['pages_manage_posts']);
    assert.equal(ready.available, true);
    assert.deepEqual(FACEBOOK_CAPABILITY_REQUIREMENTS.publish_posts, ['pages_manage_posts']);
  });

  it('15. comment reply requires pages_manage_engagement', () => {
    assert.deepEqual(FACEBOOK_CAPABILITY_REQUIREMENTS.reply_comments, ['pages_manage_engagement']);
  });

  it('16. webhooks capability path requires pages_manage_metadata in OAuth scopes', () => {
    assert.ok(FACEBOOK_OAUTH_CONTENT_FEATURE_SCOPES.includes('pages_manage_metadata'));
  });

  it('17. insights require read_insights', () => {
    assert.deepEqual(FACEBOOK_CAPABILITY_REQUIREMENTS.read_insights, ['read_insights']);
  });

  it('18. frontend refresh path uses load after actions', () => {
    assert.ok(pageSource.includes('await load()'));
    assert.ok(pageSource.includes('handleEnableContentFeatures'));
  });

  it('19. mobile/desktop action component exposes content features button', () => {
    assert.ok(pageSource.includes('onEnableContentFeatures'));
    assert.ok(pageSource.includes('startFacebookContentFeaturesOAuth'));
  });

  it('20. API never exposes tokens in web client', () => {
    assert.equal(pageSource.includes('pageAccessToken'), false);
    assert.equal(pageSource.includes('accessToken: page.'), false);
  });

  it('partial label distinguishes account selection from verification', () => {
    assert.equal(resolveFacebookPartialStateLabel(false), FACEBOOK_PARTIAL_STATE_LABEL_ACCOUNT_SELECTION);
    assert.equal(resolveFacebookPartialStateLabel(true), FACEBOOK_PARTIAL_STATE_LABEL_VERIFICATION);
  });

  it('assertFacebookContentFeaturesOAuthUrl rejects messenger and lead scopes', () => {
    const ok = assertFacebookContentFeaturesOAuthUrl(
      'https://www.facebook.com/v21.0/dialog/oauth?scope=pages_show_list,business_management,public_profile,pages_read_engagement,pages_read_user_content,pages_manage_posts,pages_manage_engagement,pages_manage_metadata,read_insights',
    );
    assert.equal(ok.ok, true);
    const bad = assertFacebookContentFeaturesOAuthUrl(
      'https://www.facebook.com/v21.0/dialog/oauth?scope=pages_messaging,leads_retrieval',
    );
    assert.equal(bad.ok, false);
  });

  it('later successful verification wins over older failure timestamps', () => {
    const effective = resolveFacebookEffectiveVerification({
      timestamps: {
        lastConnectionAttemptAt: '2026-08-06T08:00:00.000Z',
        lastSuccessfulVerificationAt: '2026-08-06T08:00:00.000Z',
        lastFailedVerificationAt: '2026-08-06T07:15:41.745Z',
        lastSuccessfulSyncAt: null,
      },
      lastVerificationOk: true,
      lastVerifiedAt: new Date('2026-08-06T08:00:00.000Z'),
      lastVerificationMessage: 'Facebook responded successfully.',
      lastVerificationAuthError: false,
      lastVerificationPermissionError: false,
      lastVerificationProviderUnavailable: false,
      pageSelected: true,
      grantedPermissions: ['pages_read_engagement'],
    });
    assert.equal(effective?.ok, true);
  });
});
