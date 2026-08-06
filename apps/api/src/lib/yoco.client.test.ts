import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { YocoClient, YocoError } from './yoco.client.js';

describe('YocoClient', () => {
  it('verifies via POST /checkouts (not GET /webhooks) and returns verification shape', async () => {
    const calls: Array<{
      url: string;
      method: string;
      authorization: string | null;
      idempotencyKey: string | null;
      body: string | null;
    }> = [];

    const secretKey = 'sk_test_example_secret_key';
    const fingerprint = createHash('sha256').update(secretKey).digest('hex').slice(0, 16);

    const client = new YocoClient({
      secretKey,
      environment: 'test',
      fetchImpl: async (input, init) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        calls.push({
          url,
          method: String(init?.method ?? 'GET'),
          authorization: headers.get('Authorization'),
          idempotencyKey: headers.get('Idempotency-Key'),
          body: typeof init?.body === 'string' ? init.body : null,
        });

        if (url.endsWith('/checkouts') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: 'ch_probe_1',
              status: 'created',
              amount: 200,
              currency: 'ZAR',
              processingMode: 'test',
              merchantId: 'mer_probe_1',
              redirectUrl: 'https://pay.yoco.com/r/probe',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (url.endsWith('/webhooks')) {
          return new Response(JSON.stringify({ subscriptions: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response('not found', { status: 404 });
      },
    });

    const result = await client.verifyConnection();

    assert.equal(calls[0]?.url, 'https://payments.yoco.com/api/checkouts');
    assert.equal(calls[0]?.method, 'POST');
    assert.equal(calls[0]?.authorization, `Bearer ${secretKey}`);
    assert.equal(calls[0]?.idempotencyKey, `titan-yoco-verify-${fingerprint}`);
    assert.match(String(calls[0]?.body), /"amount":200/);
    assert.match(String(calls[0]?.body), /"currency":"ZAR"/);

    assert.equal(result.connected, true);
    assert.equal(result.environment, 'test');
    assert.equal(result.displayName, 'Yoco Checkout (test)');
    assert.equal(result.keyFingerprint, fingerprint);
    assert.equal(result.webhookCapability, 'available');
    assert.equal(result.subscriptionCount, 0);
  });

  it('still connects when GET /webhooks 404s after successful checkout create', async () => {
    const client = new YocoClient({
      secretKey: 'sk_live_example_secret_key',
      environment: 'test',
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith('/checkouts') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: 'ch_probe_live',
              status: 'created',
              amount: 200,
              currency: 'ZAR',
              processingMode: 'live',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({
            type: 'https://developer.yoco.com/docs/api/error-codes/not-found',
            title: 'Not Found',
            detail: 'The requested resource does not exist',
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    const result = await client.testConnection();
    assert.equal(result.connected, true);
    assert.equal(result.environment, 'live');
    assert.equal(result.displayName, 'Yoco Checkout (live)');
    assert.equal(result.webhookCapability, 'unknown');
    assert.equal(result.subscriptionCount, null);
  });

  it('maps legacy fetchBusiness fields from verification', async () => {
    const client = new YocoClient({
      secretKey: 'sk_test_example_secret_key',
      environment: 'test',
      fetchImpl: async (_input, init) => {
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: 'ch_1',
              status: 'created',
              amount: 200,
              currency: 'ZAR',
              processingMode: 'test',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({ subscriptions: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const legacy = await client.fetchBusiness();
    assert.equal(legacy.name, 'Yoco Checkout (test)');
    assert.match(legacy.businessId, /^[a-f0-9]{16}$/);
    assert.equal(legacy.verification.connected, true);
  });

  it('maps 403 on checkout create to AUTH_FAILED', async () => {
    const client = new YocoClient({
      secretKey: 'sk_live_bad',
      environment: 'live',
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    await assert.rejects(
      () => client.testConnection(),
      (error: unknown) =>
        error instanceof YocoError &&
        error.code === 'AUTH_FAILED' &&
        /rejected the provided secret key/i.test(error.message),
    );
  });

  it('surfaces non-auth checkout create errors with status', async () => {
    const client = new YocoClient({
      secretKey: 'sk_test_example',
      environment: 'test',
      fetchImpl: async (_input, init) => {
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              type: 'https://developer.yoco.com/docs/api/error-codes/not-found',
              title: 'Not Found',
              detail: 'The requested resource does not exist',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });

    await assert.rejects(
      () => client.verifyConnection(),
      (error: unknown) =>
        error instanceof YocoError &&
        error.code === 'API_ERROR' &&
        /Yoco API returned 404/.test(error.message),
    );
  });
});
