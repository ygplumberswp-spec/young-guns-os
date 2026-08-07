/**
 * LIVE-001B — WhatsApp Meta client: read-only verify + honest errors + secret redaction.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapWhatsappHttpStatusToErrorCode,
  redactWhatsappSecretMaterial,
  WhatsappClient,
  WhatsappError,
} from './whatsapp.client.js';

describe('WhatsApp client secret redaction + status mapping', () => {
  it('redacts bearer tokens and opaque Meta tokens from error text', () => {
    const redacted = redactWhatsappSecretMaterial(
      'Unauthorized Bearer EAABsbCS1iHgTOKENVALUE1234567890abcdef more',
    );
    assert.match(redacted, /Bearer \[REDACTED\]/);
    assert.doesNotMatch(redacted, /EAABsbCS1iHgTOKENVALUE/);
  });

  it('maps provider HTTP statuses honestly', () => {
    assert.equal(mapWhatsappHttpStatusToErrorCode(401), 'AUTH_EXPIRED');
    assert.equal(mapWhatsappHttpStatusToErrorCode(403), 'FORBIDDEN');
    assert.equal(mapWhatsappHttpStatusToErrorCode(429), 'RATE_LIMITED');
    assert.equal(mapWhatsappHttpStatusToErrorCode(500), 'PROVIDER_ERROR');
    assert.equal(mapWhatsappHttpStatusToErrorCode(503), 'PROVIDER_ERROR');
    assert.equal(mapWhatsappHttpStatusToErrorCode(400), 'API_ERROR');
  });
});

describe('WhatsAppClient.verifyConnection (LIVE-001B read-only)', () => {
  it('performs a single GET on the phone number resource and never hits /messages', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
      return new Response(
        JSON.stringify({
          id: 'pn_123',
          display_phone_number: '+27 00 000 0000',
          verified_name: 'Young Guns Staging',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const client = new WhatsappClient({
        accessToken: 'EAABsbCS1iHgSECRETTOKENVALUE1234567890',
        phoneNumberId: 'pn_123',
      });
      const verified = await client.verifyConnection();
      assert.equal(verified.displayPhoneNumber, '+27 00 000 0000');
      assert.equal(verified.verifiedName, 'Young Guns Staging');
      assert.equal(calls.length, 1);
      assert.equal(calls[0]!.method, 'GET');
      assert.match(calls[0]!.url, /\/pn_123\?fields=/);
      assert.doesNotMatch(calls[0]!.url, /\/messages/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('surfaces 401/403/429/5xx as typed WhatsappError codes without leaking tokens', async () => {
    for (const [status, code] of [
      [401, 'AUTH_EXPIRED'],
      [403, 'FORBIDDEN'],
      [429, 'RATE_LIMITED'],
      [503, 'PROVIDER_ERROR'],
    ] as const) {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            error: {
              message: `fail Bearer EAABsbCS1iHgLEAKEDTOKENVALUE1234567890 status=${status}`,
            },
          }),
          { status, headers: { 'Content-Type': 'application/json' } },
        )) as typeof fetch;

      try {
        const client = new WhatsappClient({
          accessToken: 'token',
          phoneNumberId: 'pn',
        });
        await assert.rejects(
          () => client.verifyConnection(),
          (err: unknown) =>
            err instanceof WhatsappError &&
            err.code === code &&
            !/LEAKEDTOKENVALUE/.test(err.message) &&
            err.httpStatus === status,
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });
});
