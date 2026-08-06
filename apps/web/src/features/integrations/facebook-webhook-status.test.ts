import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(
  join(here, '../../pages/facebook-business/FacebookBusinessPage.tsx'),
  'utf8',
);
const clientSource = readFileSync(
  join(here, '../../lib/facebook-business-api-client.ts'),
  'utf8',
);

describe('Facebook webhook UI (J-6.7F14)', () => {
  it('1. Sync & Alerts shows webhook status panel', () => {
    assert.ok(pageSource.includes('Panel title="Webhooks"'));
    assert.ok(pageSource.includes('webhookStatus'));
  });

  it('2. truthful status labels from API not hard-coded Subscribed', () => {
    assert.ok(pageSource.includes('{webhookStatus.label}'));
    assert.ok(pageSource.includes('Provider-confirmed fields'));
    assert.ok(!pageSource.includes('>Subscribed</'));
  });

  it('3. Subscribe Facebook webhooks action for Owner', () => {
    assert.ok(pageSource.includes('Subscribe Facebook webhooks'));
    assert.ok(pageSource.includes('onSubscribeWebhooks'));
    assert.ok(pageSource.includes('canManage'));
  });

  it('4. Check webhook status action', () => {
    assert.ok(pageSource.includes('Check webhook status'));
    assert.ok(pageSource.includes('onCheckWebhookStatus'));
  });

  it('5. polling fallback displayed', () => {
    assert.ok(pageSource.includes('Polling fallback'));
    assert.ok(pageSource.includes('pollingFallbackActive'));
    assert.ok(pageSource.includes('pollingFallbackMinutes'));
  });

  it('6. last event timestamps shown', () => {
    assert.ok(pageSource.includes('Last event received'));
    assert.ok(pageSource.includes('lastWebhookEventReceivedAt'));
    assert.ok(pageSource.includes('Last event processed'));
    assert.ok(pageSource.includes('lastWebhookEventProcessedAt'));
  });

  it('7. API client exposes webhook endpoints', () => {
    assert.ok(clientSource.includes('/connection/webhook-status'));
    assert.ok(clientSource.includes('/connection/subscribe-webhooks'));
    assert.ok(clientSource.includes('/connection/check-webhook-status'));
  });

  it('8. does not display Subscribed without provider evidence in connection tab', () => {
    const connectionPanel = pageSource.slice(
      pageSource.indexOf('<dt>Webhooks</dt>'),
      pageSource.indexOf('<dt>Webhooks</dt>') + 400,
    );
    assert.ok(
      connectionPanel.includes('Sync & Alerts') || connectionPanel.includes('Sync &amp; Alerts'),
    );
    assert.ok(!connectionPanel.includes('webhookSubscribedAt ?'));
  });
});
