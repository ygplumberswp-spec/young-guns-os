/**
 * LIVE-001D — WhatsApp reconnect payload validation (no Meta calls).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  saveWhatsappConnectionSchema,
  WHATSAPP_ACCESS_TOKEN_MAX_CHARS,
} from './whatsapp-connection-schema.js';

describe('saveWhatsappConnectionSchema (LIVE-001D)', () => {
  it('accepts reconnect payload with blank/null/omitted webhook verify token', () => {
    const base = {
      accessToken: `EAA${'x'.repeat(200)}`,
      phoneNumberId: '109876543210987',
      businessAccountId: '102345678901234',
    };

    for (const webhookVerifyToken of [null, '', '   ', undefined] as const) {
      const body =
        webhookVerifyToken === undefined
          ? { ...base }
          : { ...base, webhookVerifyToken };
      const parsed = saveWhatsappConnectionSchema.safeParse(body);
      assert.equal(parsed.success, true, `webhook=${String(webhookVerifyToken)}`);
      if (parsed.success) {
        assert.equal(parsed.data.phoneNumberId, base.phoneNumberId);
        assert.equal(parsed.data.businessAccountId, base.businessAccountId);
        assert.ok(parsed.data.accessToken);
        // Blank optional webhook is omitted — never fails validation.
        assert.equal(parsed.data.webhookVerifyToken, undefined);
      }
    }
  });

  it('accepts Meta access tokens longer than the old 2000-char cap', () => {
    const token = `EAA${'y'.repeat(2500)}`;
    assert.ok(token.length > 2000);
    assert.ok(token.length <= WHATSAPP_ACCESS_TOKEN_MAX_CHARS);
    const parsed = saveWhatsappConnectionSchema.safeParse({
      accessToken: token,
      phoneNumberId: '1',
      businessAccountId: '2',
      webhookVerifyToken: null,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.accessToken, token);
    }
  });

  it('strips Bearer prefix and snake_case / wabaId aliases', () => {
    const parsed = saveWhatsappConnectionSchema.safeParse({
      access_token: `Bearer EAA${'z'.repeat(100)}`,
      phone_number_id: '555',
      wabaId: '777',
      webhook_verify_token: '',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.accessToken?.startsWith('EAA'), true);
      assert.equal(parsed.data.accessToken?.startsWith('Bearer'), false);
      assert.equal(parsed.data.phoneNumberId, '555');
      assert.equal(parsed.data.businessAccountId, '777');
      assert.equal(parsed.data.webhookVerifyToken, undefined);
    }
  });

  it('still rejects missing required phone / WABA ids', () => {
    const parsed = saveWhatsappConnectionSchema.safeParse({
      accessToken: 'EAAshort',
      webhookVerifyToken: null,
    });
    assert.equal(parsed.success, false);
  });

  it('rejects absurdly oversized tokens (DoS guard) without accepting empty required ids', () => {
    const parsed = saveWhatsappConnectionSchema.safeParse({
      accessToken: `EAA${'x'.repeat(WHATSAPP_ACCESS_TOKEN_MAX_CHARS + 1)}`,
      phoneNumberId: '1',
      businessAccountId: '2',
    });
    assert.equal(parsed.success, false);
  });
});
