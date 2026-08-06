import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signWhatsappWebhookBody, verifyWhatsappWebhookSignature } from './whatsapp-signing.js';

describe('whatsapp webhook signature', () => {
  const secret = 'test-app-secret';
  const body = '{"object":"whatsapp_business_account","entry":[]}';

  it('skips verification when app secret is unset (honest degrade)', () => {
    const result = verifyWhatsappWebhookSignature({
      appSecret: null,
      rawBody: body,
      signatureHeader: undefined,
    });
    assert.deepEqual(result, { ok: true, mode: 'skipped_no_secret' });
  });

  it('verifies a valid Meta X-Hub-Signature-256 header', () => {
    const hex = signWhatsappWebhookBody(secret, body);
    const result = verifyWhatsappWebhookSignature({
      appSecret: secret,
      rawBody: body,
      signatureHeader: `sha256=${hex}`,
    });
    assert.deepEqual(result, { ok: true, mode: 'verified' });
  });

  it('rejects missing signature when secret is configured', () => {
    const result = verifyWhatsappWebhookSignature({
      appSecret: secret,
      rawBody: body,
      signatureHeader: null,
    });
    assert.deepEqual(result, { ok: false, reason: 'missing_signature' });
  });

  it('rejects invalid signature when secret is configured', () => {
    const result = verifyWhatsappWebhookSignature({
      appSecret: secret,
      rawBody: body,
      signatureHeader: 'sha256=deadbeef',
    });
    assert.deepEqual(result, { ok: false, reason: 'invalid_signature' });
  });
});
