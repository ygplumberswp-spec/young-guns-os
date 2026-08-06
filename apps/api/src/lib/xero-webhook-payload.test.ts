import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseXeroWebhookPayload } from './xero-webhook-payload.js';

describe('xero webhook payload parsing', () => {
  it('accepts empty validation envelope', () => {
    const result = parseXeroWebhookPayload(JSON.stringify({ events: [] }));
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.payload.events, []);
  });

  it('accepts omitted events as empty', () => {
    const result = parseXeroWebhookPayload('{}');
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.payload.events, []);
  });

  it('rejects malformed JSON', () => {
    const result = parseXeroWebhookPayload('not-json{{{');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'INVALID_JSON');
  });

  it('rejects non-object root', () => {
    assert.equal(parseXeroWebhookPayload('[]').ok, false);
    assert.equal(parseXeroWebhookPayload('"text"').ok, false);
  });

  it('rejects events when not an array', () => {
    const result = parseXeroWebhookPayload(JSON.stringify({ events: 'bad' }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'INVALID_STRUCTURE');
  });

  it('rejects structurally invalid event entries', () => {
    const result = parseXeroWebhookPayload(
      JSON.stringify({
        events: [{ eventCategory: 'INVOICE' }],
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'INVALID_STRUCTURE');
  });

  it('accepts well-formed INVOICE envelope', () => {
    const result = parseXeroWebhookPayload(
      JSON.stringify({
        events: [
          {
            resourceUrl: 'https://api.xero.com/api.xro/2.0/Invoices/a1',
            resourceId: 'a1',
            eventType: 'UPDATE',
            eventCategory: 'INVOICE',
            tenantId: 'tenant-1',
            tenantType: 'ORGANISATION',
          },
        ],
      }),
    );
    assert.equal(result.ok, true);
  });
});
