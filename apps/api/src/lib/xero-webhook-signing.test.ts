import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  signXeroWebhookPayload,
  verifyXeroWebhookSignature,
} from './xero-webhook-signing.js';

describe('xero webhook signing', () => {
  const key = 'test-webhook-key';
  const body = JSON.stringify({
    events: [
      {
        resourceUrl: 'https://api.xero.com/api.xro/2.0/Invoices/a1',
        resourceId: 'a1',
        eventDateUtc: '2026-08-06T10:00:00.000Z',
        eventType: 'UPDATE',
        eventCategory: 'INVOICE',
        tenantId: 'tenant-1',
        tenantType: 'ORGANISATION',
      },
    ],
    firstEventSequence: 1,
    lastEventSequence: 1,
    entropy: 'entropy',
  });

  it('accepts a valid signature (intent-to-receive)', () => {
    const signature = signXeroWebhookPayload(key, body);
    const result = verifyXeroWebhookSignature({
      webhookKey: key,
      rawBody: body,
      signatureHeader: signature,
    });
    assert.equal(result.ok, true);
  });

  it('rejects an invalid signature with 401 semantics', () => {
    const result = verifyXeroWebhookSignature({
      webhookKey: key,
      rawBody: body,
      signatureHeader: 'invalid',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'invalid_signature');
  });

  it('rejects missing signature header', () => {
    const result = verifyXeroWebhookSignature({
      webhookKey: key,
      rawBody: body,
      signatureHeader: null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'missing_signature');
  });

  it('is replay-safe — same payload verifies consistently', () => {
    const signature = signXeroWebhookPayload(key, body);
    for (let i = 0; i < 3; i++) {
      const result = verifyXeroWebhookSignature({
        webhookKey: key,
        rawBody: body,
        signatureHeader: signature,
      });
      assert.equal(result.ok, true);
    }
  });
});
