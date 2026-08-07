import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  FACEBOOK_FORBIDDEN_WEBHOOK_FIELDS,
  FACEBOOK_SUBSCRIBED_WEBHOOK_FIELDS,
  resolveFacebookWebhookFieldsForSubscription,
} from '@titan/shared';

const here = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(here, 'facebook-business.service.ts'), 'utf8');
const graphSource = readFileSync(join(here, '../lib/facebook-graph.client.ts'), 'utf8');

describe('Facebook Business webhook subscription service (J-6.7F14)', () => {
  it('1. subscribeWebhooks uses Owner-only guard', () => {
    assert.ok(serviceSource.includes('async subscribeWebhooks(actor'));
    assert.ok(serviceSource.includes('this.assertManageConnection(actor)'));
  });

  it('2. subscription uses resolveFacebookWebhookFieldsForSubscription not legacy bundle', () => {
    assert.ok(serviceSource.includes('resolveFacebookWebhookFieldsForSubscription'));
    assert.ok(!serviceSource.includes('fields: [...FACEBOOK_SUBSCRIBED_WEBHOOK_FIELDS]'));
  });

  it('3. provider status check after subscribe', () => {
    assert.ok(serviceSource.includes('getPageWebhookSubscription'));
    assert.ok(serviceSource.includes("eventType: subscribed ? 'webhook_subscribed' : 'webhook_subscribe_partial'"));
  });

  it('4. subscription failure preserves connection state', () => {
    const block = serviceSource.slice(
      serviceSource.indexOf('async subscribeWebhooks'),
      serviceSource.indexOf('private async attemptWebhookSubscription'),
    );
    assert.ok(block.includes('stateAfter: row.state'));
    assert.ok(block.includes('webhook_subscribe_failed'));
    assert.ok(!block.includes('state: \'disconnected\''));
  });

  it('5. idempotent resubscription via repeated subscribe action', () => {
    assert.ok(serviceSource.includes('await graph.subscribePageWebhooks'));
    assert.ok(serviceSource.includes('providerSubscribedFields'));
  });

  it('6. correct subscribed fields feed and mention only', () => {
    assert.deepEqual(FACEBOOK_SUBSCRIBED_WEBHOOK_FIELDS, ['feed', 'mention']);
    const fields = resolveFacebookWebhookFieldsForSubscription(['pages_manage_metadata']);
    assert.deepEqual(fields, ['feed', 'mention']);
    for (const forbidden of FACEBOOK_FORBIDDEN_WEBHOOK_FIELDS) {
      assert.equal(fields.includes(forbidden as never), false);
    }
  });

  it('7. status persistence in connection metadata', () => {
    assert.ok(serviceSource.includes('lastWebhookSubscriptionAttemptAt'));
    assert.ok(serviceSource.includes('lastWebhookSubscriptionError'));
    assert.ok(serviceSource.includes('lastWebhookEventReceivedAt'));
    assert.ok(serviceSource.includes('lastWebhookEventProcessedAt'));
    assert.ok(serviceSource.includes('lastWebhookStatusCheckAt'));
  });

  it('8. graph client exposes subscribed_apps GET', () => {
    assert.ok(graphSource.includes('getPageWebhookSubscription'));
    assert.ok(graphSource.includes('/subscribed_apps'));
  });

  it('9. OAuth auto-subscribe delegates to attemptWebhookSubscription', () => {
    assert.ok(serviceSource.includes('attemptWebhookSubscription'));
    assert.ok(serviceSource.includes('context: \'Content features granted\''));
  });

  it('10. background processing failure records processingError', () => {
    assert.ok(serviceSource.includes('async processWebhookDeliveries'));
    assert.ok(serviceSource.includes('processingError: describeGraphError(error)'));
  });
});
