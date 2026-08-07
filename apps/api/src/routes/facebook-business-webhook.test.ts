import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { verifyFacebookWebhookSignature } from '../lib/facebook-graph.client.js';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'facebook-business.ts'), 'utf8');
const serviceSource = readFileSync(join(here, '../services/facebook-business.service.ts'), 'utf8');

const APP_SECRET = 'test-app-secret-not-logged';

function signBody(rawBody: string): string {
  const digest = createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

describe('Facebook Business webhook routes (J-6.7F14)', () => {
  it('1. GET /webhook handles Meta verification challenge', () => {
    assert.ok(routeSource.includes("router.get('/webhook'"));
    assert.ok(routeSource.includes("mode !== 'subscribe'"));
    assert.ok(routeSource.includes('hub.verify_token'));
    assert.ok(routeSource.includes('hub.challenge'));
  });

  it('2. invalid verification token returns 403', () => {
    assert.ok(routeSource.includes('token !== verifyToken'));
    assert.ok(routeSource.includes('res.sendStatus(403)'));
  });

  it('3. POST /webhook uses raw body parser', () => {
    assert.ok(routeSource.includes("router.post('/webhook', raw("));
  });

  it('4. valid signed POST uses X-Hub-Signature-256 verification', () => {
    const rawBody = JSON.stringify({
      object: 'page',
      entry: [{ id: '394603137072407', changes: [] }],
    });
    assert.equal(
      verifyFacebookWebhookSignature({
        rawBody,
        signatureHeader: signBody(rawBody),
        appSecret: APP_SECRET,
      }),
      true,
    );
  });

  it('5. invalid signature rejected', () => {
    const rawBody = '{"object":"page"}';
    assert.equal(
      verifyFacebookWebhookSignature({
        rawBody,
        signatureHeader: 'sha256=deadbeef',
        appSecret: APP_SECRET,
      }),
      false,
    );
  });

  it('6. missing signature rejected', () => {
    assert.equal(
      verifyFacebookWebhookSignature({
        rawBody: '{}',
        signatureHeader: undefined,
        appSecret: APP_SECRET,
      }),
      false,
    );
  });

  it('7. fast 200 acknowledgement with background processing', () => {
    assert.ok(routeSource.includes('acknowledgeWebhook'));
    assert.ok(routeSource.includes('processWebhookDeliveries'));
    assert.ok(routeSource.includes('result.accepted ? 200 : 403'));
    assert.ok(routeSource.includes('void facebookBusinessService.processWebhookDeliveries'));
  });

  it('8. Owner subscribe and status routes exist', () => {
    assert.ok(routeSource.includes("router.post('/connection/subscribe-webhooks'"));
    assert.ok(routeSource.includes("router.get('/connection/webhook-status'"));
    assert.ok(routeSource.includes("router.post('/connection/check-webhook-status'"));
  });

  it('9. webhook dedupe and tenant resolution in service', () => {
    assert.ok(serviceSource.includes('acknowledgeWebhook'));
    assert.ok(serviceSource.includes('onConflictDoNothing'));
    assert.ok(serviceSource.includes('eq(fbConnections.pageId, pageId)'));
  });

  it('10. no automatic reply or publication in webhook processing', () => {
    const feedBlock = serviceSource.slice(
      serviceSource.indexOf('private async processFeedWebhook'),
      serviceSource.indexOf('// ─── Notifications'),
    );
    assert.ok(!feedBlock.includes('publishPost'));
    assert.ok(!feedBlock.includes('replyToComment'));
    assert.ok(!feedBlock.includes('approveAndSend'));
  });
});
