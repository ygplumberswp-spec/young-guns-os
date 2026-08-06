import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractResendWebhookHeaders,
  signResendWebhookPayload,
  verifyResendWebhookSignature,
} from './resend-signing.js';

/** Deterministic test secret: whsec_ + base64("test_resend_webhook_secret!") */
const TEST_SECRET = `whsec_${Buffer.from('test_resend_webhook_secret!').toString('base64')}`;

describe('Resend webhook signature verification', () => {
  it('accepts a valid Svix / Standard Webhooks v1 signature', () => {
    const svixId = 'msg_resend_1';
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'email_abc' },
    });

    const signature = signResendWebhookPayload({
      webhookSecret: TEST_SECRET,
      svixId,
      svixTimestamp,
      rawBody,
    });

    const result = verifyResendWebhookSignature({
      webhookSecret: TEST_SECRET,
      rawBody,
      headers: {
        svixId,
        svixTimestamp,
        svixSignature: `v1,${signature}`,
      },
    });

    assert.equal(result.ok, true);
  });

  it('rejects tampered bodies and missing headers', () => {
    const svixId = 'msg_resend_2';
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"type":"email.sent","data":{"email_id":"e1"}}';
    const signature = signResendWebhookPayload({
      webhookSecret: TEST_SECRET,
      svixId,
      svixTimestamp,
      rawBody,
    });

    const tampered = verifyResendWebhookSignature({
      webhookSecret: TEST_SECRET,
      rawBody: rawBody.replace('e1', 'eX'),
      headers: {
        svixId,
        svixTimestamp,
        svixSignature: `v1,${signature}`,
      },
    });
    assert.equal(tampered.ok, false);

    const missing = verifyResendWebhookSignature({
      webhookSecret: TEST_SECRET,
      rawBody,
      headers: {
        svixId: null,
        svixTimestamp,
        svixSignature: `v1,${signature}`,
      },
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.reason, 'missing_headers');
  });

  it('extracts svix headers case-insensitively', () => {
    const headers = extractResendWebhookHeaders({
      'Svix-Id': 'msg_x',
      'svix-timestamp': '1710000000',
      'SVIX-SIGNATURE': 'v1,abc',
    });
    assert.equal(headers.svixId, 'msg_x');
    assert.equal(headers.svixTimestamp, '1710000000');
    assert.equal(headers.svixSignature, 'v1,abc');
  });
});
