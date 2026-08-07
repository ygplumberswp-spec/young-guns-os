import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaymentQrSvg, encodeQrMatrix } from '@titan/shared';
import { YocoError } from './yoco.client.js';
import { YocoPaymentLinkClient } from './yoco-payment-links.client.js';
import {
  describeYocoSignatureFailure,
  extractYocoWebhookHeaders,
  signYocoWebhookPayload,
  verifyYocoWebhookSignature,
} from './yoco-webhook-signing.js';

const linkInput = {
  invoiceNumber: 'INV-2025-0421',
  customerName: 'John van der Merwe',
  customerReference: 'CUST-00123',
  outstandingCents: 993_750,
  currency: 'ZAR',
  companyTradingName: 'Young Guns Plumbing',
  correlationId: 'corr-1',
  invoiceId: 'inv-1',
  customerId: 'cust-1',
  companyId: 'co-1',
  idempotencyKey: 'titan-invoice-inv-1-v1-993750',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Records the outgoing request so the contract can be asserted. */
function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const resolved = { url: String(url), init: init ?? {} };
    calls.push(resolved);
    return handler(resolved.url, resolved.init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

// ---------------------------------------------------------------------------
// Payment-link creation
// ---------------------------------------------------------------------------

test('a payment link is created against the official endpoint with the right auth and payload', async () => {
  const { impl, calls } = stubFetch(() =>
    jsonResponse({
      id: 'pl_abc',
      orderId: 'or_1',
      url: 'https://pay.yoco.com/r/abc123',
      amount: 993_750,
      currency: 'ZAR',
      status: 'active',
    }),
  );

  const client = new YocoPaymentLinkClient({ secretKey: 'sk_test_secret', fetchImpl: impl });
  const result = await client.createPaymentLink(linkInput);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.yoco.com/v1/payment_links/');
  assert.equal(calls[0]!.init.method, 'POST');

  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer sk_test_secret');
  assert.equal(headers['Idempotency-Key'], 'titan-invoice-inv-1-v1-993750');

  const sent = JSON.parse(String(calls[0]!.init.body));
  assert.equal(sent.amount, 993_750);
  assert.equal(sent.currency, 'ZAR');
  assert.equal(sent.reference, 'INV-2025-0421/CUST-00123');
  assert.equal(sent.metadata.titan_invoice_id, 'inv-1');

  assert.equal(result.paymentLinkId, 'pl_abc');
  assert.equal(result.orderId, 'or_1');
  assert.equal(result.paymentUrl, 'https://pay.yoco.com/r/abc123');
  assert.equal(result.amountCents, 993_750);
});

test('a Bearer prefix on the stored key is tolerated and never doubled', async () => {
  const { impl, calls } = stubFetch(() =>
    jsonResponse({ id: 'pl_a', url: 'https://pay.yoco.com/r/a', amount: 993_750 }),
  );
  const client = new YocoPaymentLinkClient({ secretKey: '  Bearer sk_test_x ', fetchImpl: impl });
  await client.createPaymentLink(linkInput);

  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer sk_test_x');
});

test('a missing secret key fails before any network call', () => {
  assert.throws(() => new YocoPaymentLinkClient({ secretKey: '   ' }), YocoError);
});

test('a link for the wrong amount is rejected rather than shown to a customer', async () => {
  const { impl } = stubFetch(() =>
    jsonResponse({ id: 'pl_a', url: 'https://pay.yoco.com/r/a', amount: 500_000 }),
  );
  const client = new YocoPaymentLinkClient({ secretKey: 'sk_test_x', fetchImpl: impl });

  await assert.rejects(
    () => client.createPaymentLink(linkInput),
    /created a link for 500000 cents but 993750 was requested/,
  );
});

test('a non-Yoco or insecure payment URL is rejected', async () => {
  for (const url of [
    'https://example.com/pay/abc',
    'http://pay.yoco.com/r/abc',
    'https://pay.yoco.com.evil.test/r/abc',
  ]) {
    const { impl } = stubFetch(() => jsonResponse({ id: 'pl_a', url, amount: 993_750 }));
    const client = new YocoPaymentLinkClient({ secretKey: 'sk_test_x', fetchImpl: impl });
    await assert.rejects(() => client.createPaymentLink(linkInput), /refusing to publish/, url);
  }
});

test('a response with no URL or no id fails loudly', async () => {
  const noUrl = stubFetch(() => jsonResponse({ id: 'pl_a', amount: 993_750 }));
  await assert.rejects(
    () => new YocoPaymentLinkClient({ secretKey: 'sk_x', fetchImpl: noUrl.impl }).createPaymentLink(linkInput),
    /refusing to publish/,
  );

  const noId = stubFetch(() => jsonResponse({ url: 'https://pay.yoco.com/r/a', amount: 993_750 }));
  await assert.rejects(
    () => new YocoPaymentLinkClient({ secretKey: 'sk_x', fetchImpl: noId.impl }).createPaymentLink(linkInput),
    /missing an id/,
  );
});

test('auth, API, and malformed-body failures map to clear Yoco errors', async () => {
  const cases: Array<[Response, RegExp]> = [
    [new Response('nope', { status: 401 }), /rejected the secret key/],
    [new Response('forbidden', { status: 403 }), /business\/orders:write scope/],
    [new Response('boom', { status: 500 }), /returned 500/],
    [new Response('', { status: 200, headers: { 'content-type': 'application/json' } }), /empty response/],
    [new Response('{not json', { status: 200, headers: { 'content-type': 'application/json' } }), /invalid JSON/],
    [jsonResponse([1, 2, 3]), /unexpected payload/],
  ];

  for (const [response, expected] of cases) {
    const { impl } = stubFetch(() => response);
    const client = new YocoPaymentLinkClient({ secretKey: 'sk_x', fetchImpl: impl });
    await assert.rejects(() => client.createPaymentLink(linkInput), expected);
  }
});

test('a network failure surfaces as a Yoco network error, not a silent success', async () => {
  const impl = (async () => {
    throw new Error('socket hang up');
  }) as unknown as typeof fetch;
  const client = new YocoPaymentLinkClient({ secretKey: 'sk_x', fetchImpl: impl });

  await assert.rejects(() => client.createPaymentLink(linkInput), (error: unknown) => {
    assert.ok(error instanceof YocoError);
    assert.equal((error as YocoError).code, 'NETWORK_ERROR');
    return true;
  });
});

test('an ineligible amount never reaches the network', async () => {
  const { impl, calls } = stubFetch(() => jsonResponse({}));
  const client = new YocoPaymentLinkClient({ secretKey: 'sk_x', fetchImpl: impl });

  await assert.rejects(() => client.createPaymentLink({ ...linkInput, outstandingCents: 0 }));
  assert.equal(calls.length, 0, 'no request should be sent for an invalid amount');
});

// ---------------------------------------------------------------------------
// QR matches the real link
// ---------------------------------------------------------------------------

test('the QR encodes exactly the URL Yoco returned', async () => {
  const paymentUrl = 'https://pay.yoco.com/r/4Xy9zQ';
  const { impl } = stubFetch(() => jsonResponse({ id: 'pl_a', url: paymentUrl, amount: 993_750 }));
  const client = new YocoPaymentLinkClient({ secretKey: 'sk_x', fetchImpl: impl });
  const result = await client.createPaymentLink(linkInput);

  const svg = buildPaymentQrSvg(result.paymentUrl);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(!svg.includes('<image'), 'the QR must be vector, not a raster placeholder');

  // Same payload in, same symbol out: the QR cannot be pointing anywhere else.
  const expected = encodeQrMatrix(paymentUrl, { errorCorrectionLevel: 'H' });
  const rendered = encodeQrMatrix(result.paymentUrl, { errorCorrectionLevel: 'H' });
  assert.deepEqual(rendered.modules, expected.modules);
});

test('a failed link creation produces no QR at all', async () => {
  const { impl } = stubFetch(() => new Response('boom', { status: 500 }));
  const client = new YocoPaymentLinkClient({ secretKey: 'sk_x', fetchImpl: impl });

  let paymentUrl: string | null = null;
  try {
    paymentUrl = (await client.createPaymentLink(linkInput)).paymentUrl;
  } catch {
    paymentUrl = null;
  }
  assert.equal(paymentUrl, null);
  // There is no code path that renders a QR without a real URL.
  assert.throws(() => buildPaymentQrSvg(paymentUrl ?? ''), /valid absolute URL/);
});

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

const secret = `whsec_${Buffer.from('titan-yoco-staging-secret').toString('base64')}`;
const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment.created' });
const webhookId = 'msg_2b';
const nowSeconds = 1_754_746_800;

function signedHeaders(overrides: Partial<Record<string, string>> = {}) {
  const signature = signYocoWebhookPayload({
    webhookSecret: secret,
    webhookId,
    webhookTimestamp: String(nowSeconds),
    rawBody,
  });
  return {
    'webhook-id': webhookId,
    'webhook-timestamp': String(nowSeconds),
    'webhook-signature': `v1,${signature}`,
    ...overrides,
  };
}

test('a correctly signed Yoco webhook verifies', () => {
  const result = verifyYocoWebhookSignature({
    webhookSecret: secret,
    rawBody,
    headers: extractYocoWebhookHeaders(signedHeaders()),
    nowSeconds,
  });
  assert.deepEqual(result, { ok: true });
});

test('headers are matched case-insensitively as Node lowercases them', () => {
  const headers = extractYocoWebhookHeaders({
    'Webhook-Id': webhookId,
    'WEBHOOK-TIMESTAMP': String(nowSeconds),
    'webhook-signature': `v1,${signYocoWebhookPayload({
      webhookSecret: secret,
      webhookId,
      webhookTimestamp: String(nowSeconds),
      rawBody,
    })}`,
  });
  assert.deepEqual(
    verifyYocoWebhookSignature({ webhookSecret: secret, rawBody, headers, nowSeconds }),
    { ok: true },
  );
});

test('a tampered body fails verification', () => {
  const result = verifyYocoWebhookSignature({
    webhookSecret: secret,
    rawBody: JSON.stringify({ id: 'evt_1', type: 'payment.created', amount: 1 }),
    headers: extractYocoWebhookHeaders(signedHeaders()),
    nowSeconds,
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' });
});

test('a wrong secret fails verification', () => {
  const result = verifyYocoWebhookSignature({
    webhookSecret: `whsec_${Buffer.from('someone-elses-secret').toString('base64')}`,
    rawBody,
    headers: extractYocoWebhookHeaders(signedHeaders()),
    nowSeconds,
  });
  assert.deepEqual(result, { ok: false, reason: 'invalid_signature' });
});

test('missing headers, bad timestamps and replays are refused', () => {
  const base = { webhookSecret: secret, rawBody, nowSeconds };

  for (const missing of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
    const headers = signedHeaders();
    delete (headers as Record<string, string | undefined>)[missing];
    assert.deepEqual(
      verifyYocoWebhookSignature({ ...base, headers: extractYocoWebhookHeaders(headers) }),
      { ok: false, reason: 'missing_headers' },
      missing,
    );
  }

  assert.deepEqual(
    verifyYocoWebhookSignature({
      ...base,
      headers: extractYocoWebhookHeaders(signedHeaders({ 'webhook-timestamp': 'not-a-time' })),
    }),
    { ok: false, reason: 'bad_timestamp' },
  );

  // An old delivery cannot be replayed.
  assert.deepEqual(
    verifyYocoWebhookSignature({ ...base, headers: extractYocoWebhookHeaders(signedHeaders()), nowSeconds: nowSeconds + 3_600 }),
    { ok: false, reason: 'stale_timestamp' },
  );
});

test('an unusable stored secret is reported rather than treated as a pass', () => {
  const result = verifyYocoWebhookSignature({
    webhookSecret: 'not-a-whsec-secret',
    rawBody,
    headers: extractYocoWebhookHeaders(signedHeaders()),
    nowSeconds,
  });
  assert.deepEqual(result, { ok: false, reason: 'bad_secret' });
});

test('a signature header without a v1 scheme is refused', () => {
  assert.deepEqual(
    verifyYocoWebhookSignature({
      webhookSecret: secret,
      rawBody,
      headers: extractYocoWebhookHeaders(signedHeaders({ 'webhook-signature': 'v2,abc' })),
      nowSeconds,
    }),
    { ok: false, reason: 'invalid_signature' },
  );
});

test('signature rotation is supported: any listed v1 signature may match', () => {
  const good = signYocoWebhookPayload({
    webhookSecret: secret,
    webhookId,
    webhookTimestamp: String(nowSeconds),
    rawBody,
  });
  const headers = extractYocoWebhookHeaders(
    signedHeaders({ 'webhook-signature': `v1,anoldsignature v1,${good}` }),
  );
  assert.deepEqual(
    verifyYocoWebhookSignature({ webhookSecret: secret, rawBody, headers, nowSeconds }),
    { ok: true },
  );
});

test('every failure reason has an honest human-readable description', () => {
  for (const reason of [
    'missing_headers',
    'body_too_large',
    'bad_timestamp',
    'stale_timestamp',
    'bad_secret',
    'invalid_signature',
  ] as const) {
    assert.ok(describeYocoSignatureFailure(reason).length > 10, reason);
  }
});
