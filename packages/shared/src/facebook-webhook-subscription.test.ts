import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FACEBOOK_FORBIDDEN_WEBHOOK_FIELDS,
  FACEBOOK_SUBSCRIBED_WEBHOOK_FIELDS,
  FACEBOOK_SYNC_POLICY,
  resolveFacebookWebhookFieldsForSubscription,
  resolveFacebookWebhookStatus,
} from './facebook-business.js';

describe('Facebook webhook subscription (J-6.7F14)', () => {
  it('1. subscribed fields exclude Messenger and Lead Ads', () => {
    assert.deepEqual(FACEBOOK_SUBSCRIBED_WEBHOOK_FIELDS, ['feed', 'mention']);
    assert.ok(FACEBOOK_FORBIDDEN_WEBHOOK_FIELDS.includes('leadgen'));
    assert.ok(FACEBOOK_FORBIDDEN_WEBHOOK_FIELDS.includes('messages'));
    assert.ok(FACEBOOK_FORBIDDEN_WEBHOOK_FIELDS.includes('message_deliveries'));
    for (const forbidden of FACEBOOK_FORBIDDEN_WEBHOOK_FIELDS) {
      assert.equal(
        FACEBOOK_SUBSCRIBED_WEBHOOK_FIELDS.includes(forbidden as never),
        false,
        `must not request ${forbidden}`,
      );
    }
  });

  it('2. resolveFacebookWebhookFieldsForSubscription requires pages_manage_metadata', () => {
    assert.deepEqual(
      resolveFacebookWebhookFieldsForSubscription(['pages_read_engagement', 'pages_manage_posts']),
      [],
    );
    assert.deepEqual(
      resolveFacebookWebhookFieldsForSubscription([
        'pages_manage_metadata',
        'pages_read_engagement',
      ]),
      ['feed', 'mention'],
    );
  });

  it('3. truthful Subscribed state requires provider-confirmed fields', () => {
    const status = resolveFacebookWebhookStatus({
      appConfigured: true,
      webhookVerifyTokenConfigured: true,
      pageSelected: true,
      hasStoredToken: true,
      pagesManageMetadataGranted: true,
      providerSubscribedFields: ['feed', 'mention'],
      requestedFields: ['feed', 'mention'],
      lastSubscriptionError: null,
      lastSubscriptionAttemptAt: '2026-08-06T08:00:00.000Z',
      webhookSubscribedAt: '2026-08-06T08:00:00.000Z',
      lastWebhookEventReceivedAt: null,
      lastWebhookEventProcessedAt: null,
      lastWebhookVerificationAt: '2026-08-06T08:01:00.000Z',
      pollingFallbackActive: true,
      pageId: '394603137072407',
      pageName: 'Young Guns Plumbing - Cape Town',
    });
    assert.equal(status.state, 'subscribed');
    assert.equal(status.label, 'Subscribed');
  });

  it('4. stored timestamp alone does not show Subscribed without provider evidence', () => {
    const status = resolveFacebookWebhookStatus({
      appConfigured: true,
      webhookVerifyTokenConfigured: true,
      pageSelected: true,
      hasStoredToken: true,
      pagesManageMetadataGranted: true,
      providerSubscribedFields: null,
      requestedFields: ['feed', 'mention'],
      lastSubscriptionError: null,
      lastSubscriptionAttemptAt: '2026-08-06T08:00:00.000Z',
      webhookSubscribedAt: '2026-08-06T08:00:00.000Z',
      lastWebhookEventReceivedAt: null,
      lastWebhookEventProcessedAt: null,
      lastWebhookVerificationAt: null,
      pollingFallbackActive: true,
      pageId: '394603137072407',
      pageName: 'Young Guns Plumbing - Cape Town',
    });
    assert.equal(status.state, 'verification_required');
    assert.notEqual(status.label, 'Subscribed');
  });

  it('5. partial when provider confirms only feed', () => {
    const status = resolveFacebookWebhookStatus({
      appConfigured: true,
      webhookVerifyTokenConfigured: true,
      pageSelected: true,
      hasStoredToken: true,
      pagesManageMetadataGranted: true,
      providerSubscribedFields: ['feed'],
      requestedFields: ['feed', 'mention'],
      lastSubscriptionError: null,
      lastSubscriptionAttemptAt: null,
      webhookSubscribedAt: null,
      lastWebhookEventReceivedAt: null,
      lastWebhookEventProcessedAt: null,
      lastWebhookVerificationAt: '2026-08-06T08:01:00.000Z',
      pollingFallbackActive: true,
      pageId: '394603137072407',
      pageName: 'Young Guns Plumbing - Cape Town',
    });
    assert.equal(status.state, 'partial');
    assert.ok(status.canRetrySubscription);
  });

  it('6. polling fallback remains active on subscription failure', () => {
    const status = resolveFacebookWebhookStatus({
      appConfigured: true,
      webhookVerifyTokenConfigured: true,
      pageSelected: true,
      hasStoredToken: true,
      pagesManageMetadataGranted: true,
      providerSubscribedFields: null,
      requestedFields: ['feed', 'mention'],
      lastSubscriptionError: 'Webhook subscription failed: (#200) Permission error',
      lastSubscriptionAttemptAt: '2026-08-06T08:00:00.000Z',
      webhookSubscribedAt: null,
      lastWebhookEventReceivedAt: null,
      lastWebhookEventProcessedAt: null,
      lastWebhookVerificationAt: null,
      pollingFallbackActive: true,
      pageId: '394603137072407',
      pageName: 'Young Guns Plumbing - Cape Town',
    });
    assert.equal(status.pollingFallbackActive, true);
    assert.equal(status.pollingFallbackMinutes, FACEBOOK_SYNC_POLICY.pollingBackfillMinutes);
  });

  it('7. ready_to_subscribe when configured and no provider error', () => {
    const status = resolveFacebookWebhookStatus({
      appConfigured: true,
      webhookVerifyTokenConfigured: true,
      pageSelected: true,
      hasStoredToken: true,
      pagesManageMetadataGranted: true,
      providerSubscribedFields: [],
      requestedFields: ['feed', 'mention'],
      lastSubscriptionError: null,
      lastSubscriptionAttemptAt: null,
      webhookSubscribedAt: null,
      lastWebhookEventReceivedAt: null,
      lastWebhookEventProcessedAt: null,
      lastWebhookVerificationAt: null,
      pollingFallbackActive: true,
      pageId: '394603137072407',
      pageName: 'Young Guns Plumbing - Cape Town',
    });
    assert.equal(status.state, 'ready_to_subscribe');
    assert.equal(status.canSubscribe, true);
  });
});
