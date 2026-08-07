import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaymentLinkIdempotencyKey,
  buildPaymentLinkReference,
  buildPaymentLinkRequest,
  describeApproveAndIssue,
  evaluatePaymentLinkEligibility,
  formatMinorUnitsAsDecimal,
  fromYocoMinorUnits,
  isLivePaymentLinkStatus,
  isYocoPaymentUrl,
  parseYocoPaymentWebhook,
  PAYMENT_LINK_STATUSES,
  requireYocoPaymentUrl,
  resolveExistingLinkAction,
  resolveWebhookOutcome,
  shouldInvalidatePreparedLink,
  toYocoMinorUnits,
  YOCO_MINIMUM_AMOUNT_CENTS,
  YOCO_PAYMENT_CREATED_EVENT,
  YOCO_PAYMENT_LINK_SCOPES,
  YOCO_PAYMENT_LINKS_ENDPOINT,
  YocoPaymentLinkError,
} from './yoco-payment-links.js';

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

test('the official Yoco payment-link endpoint and scopes are used', () => {
  assert.equal(YOCO_PAYMENT_LINKS_ENDPOINT, 'https://api.yoco.com/v1/payment_links/');
  assert.deepEqual([...YOCO_PAYMENT_LINK_SCOPES], [
    'business/orders:read',
    'business/orders:write',
  ]);
});

// ---------------------------------------------------------------------------
// Money conversion
// ---------------------------------------------------------------------------

test('cents convert to Yoco minor units without floating point', () => {
  assert.equal(toYocoMinorUnits(1), 1);
  assert.equal(toYocoMinorUnits(200), 200);
  assert.equal(toYocoMinorUnits(1_293_750), 1_293_750);
  assert.equal(toYocoMinorUnits(993_750), 993_750);
});

test('fractional, zero, negative and non-finite amounts are refused', () => {
  for (const bad of [10.5, 0.01, -1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => toYocoMinorUnits(bad), YocoPaymentLinkError, `accepted ${bad}`);
  }
  assert.throws(() => toYocoMinorUnits('100' as unknown as number), YocoPaymentLinkError);
  assert.throws(() => toYocoMinorUnits(Number.MAX_VALUE), /safe integer/);
});

test('a rand-to-cents float mistake cannot slip through', () => {
  // 129.375 rand would be a float; the contract is integer cents only.
  assert.throws(() => toYocoMinorUnits(12937.5), /whole cents/);
});

test('amounts returned by Yoco must be integers to be recorded', () => {
  assert.equal(fromYocoMinorUnits(993_750), 993_750);
  assert.throws(() => fromYocoMinorUnits(993_750.5), /non-integer/);
  assert.throws(() => fromYocoMinorUnits('993750'), /non-integer/);
  assert.throws(() => fromYocoMinorUnits(undefined), /non-integer/);
});

test('decimal formatting is exact for display', () => {
  assert.equal(formatMinorUnitsAsDecimal(1_293_750), '12937.50');
  assert.equal(formatMinorUnitsAsDecimal(993_750), '9937.50');
  assert.equal(formatMinorUnitsAsDecimal(5), '0.05');
  assert.equal(formatMinorUnitsAsDecimal(100), '1.00');
  assert.equal(formatMinorUnitsAsDecimal(199), '1.99');
});

test('formatting a large balance keeps every cent', () => {
  assert.equal(formatMinorUnitsAsDecimal(123_456_789), '1234567.89');
});

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

const issuedInvoice = {
  documentType: 'invoice' as const,
  invoiceStatus: 'sent',
  isIssued: true,
  outstandingCents: 993_750,
  currency: 'ZAR',
};

test('an issued invoice with an outstanding balance is eligible', () => {
  assert.deepEqual(evaluatePaymentLinkEligibility(issuedInvoice), { eligible: true });
});

test('quotes and reports never get a payment link', () => {
  for (const documentType of ['quote', 'report'] as const) {
    const result = evaluatePaymentLinkEligibility({ ...issuedInvoice, documentType });
    assert.equal(result.eligible, false);
    if (result.eligible) return;
    assert.equal(result.code, 'NOT_AN_INVOICE');
  }
});

test('a paid or zero-balance invoice never gets a payment link', () => {
  const paid = evaluatePaymentLinkEligibility({ ...issuedInvoice, invoiceStatus: 'paid' });
  assert.equal(paid.eligible, false);
  if (!paid.eligible) assert.equal(paid.code, 'INVOICE_PAID');

  const zero = evaluatePaymentLinkEligibility({ ...issuedInvoice, outstandingCents: 0 });
  assert.equal(zero.eligible, false);
  if (!zero.eligible) assert.equal(zero.code, 'NO_OUTSTANDING_BALANCE');

  const negative = evaluatePaymentLinkEligibility({ ...issuedInvoice, outstandingCents: -500 });
  assert.equal(negative.eligible, false);
});

test('a draft invoice and a cancelled invoice are refused', () => {
  const draft = evaluatePaymentLinkEligibility({ ...issuedInvoice, isIssued: false });
  assert.equal(draft.eligible, false);
  if (!draft.eligible) assert.equal(draft.code, 'NOT_ISSUED');

  const cancelled = evaluatePaymentLinkEligibility({ ...issuedInvoice, invoiceStatus: 'cancelled' });
  assert.equal(cancelled.eligible, false);
  if (!cancelled.eligible) assert.equal(cancelled.code, 'INVOICE_CANCELLED');
});

test('balances below the Yoco minimum and non-ZAR currencies are refused', () => {
  const tooSmall = evaluatePaymentLinkEligibility({
    ...issuedInvoice,
    outstandingCents: YOCO_MINIMUM_AMOUNT_CENTS - 1,
  });
  assert.equal(tooSmall.eligible, false);
  if (!tooSmall.eligible) assert.equal(tooSmall.code, 'BELOW_YOCO_MINIMUM');

  const usd = evaluatePaymentLinkEligibility({ ...issuedInvoice, currency: 'USD' });
  assert.equal(usd.eligible, false);
  if (!usd.eligible) assert.equal(usd.code, 'UNSUPPORTED_CURRENCY');
});

test('a fractional outstanding balance is refused rather than rounded', () => {
  const result = evaluatePaymentLinkEligibility({ ...issuedInvoice, outstandingCents: 993_750.4 });
  assert.equal(result.eligible, false);
  if (!result.eligible) assert.equal(result.code, 'INVALID_OUTSTANDING');
});

// ---------------------------------------------------------------------------
// Request payload
// ---------------------------------------------------------------------------

const requestInput = {
  invoiceNumber: 'INV-2025-0421',
  customerName: 'John van der Merwe',
  customerReference: 'CUST-00123',
  outstandingCents: 993_750,
  currency: 'ZAR',
  companyTradingName: 'Young Guns Plumbing',
  correlationId: 'corr-abc',
  invoiceId: 'inv-uuid',
  customerId: 'cust-uuid',
  companyId: 'co-uuid',
};

test('the payload carries an integer ZAR amount, a clear description and both references', () => {
  const payload = buildPaymentLinkRequest(requestInput);

  assert.equal(payload.amount, 993_750);
  assert.ok(Number.isInteger(payload.amount));
  assert.equal(payload.currency, 'ZAR');
  assert.equal(payload.reference, 'INV-2025-0421/CUST-00123');
  assert.match(payload.description, /Young Guns Plumbing/);
  assert.match(payload.description, /INV-2025-0421/);
  assert.match(payload.description, /9937\.50/);
});

test('metadata carries our own identifiers for webhook matching', () => {
  const payload = buildPaymentLinkRequest(requestInput);
  assert.equal(payload.metadata.titan_invoice_id, 'inv-uuid');
  assert.equal(payload.metadata.titan_customer_id, 'cust-uuid');
  assert.equal(payload.metadata.titan_company_id, 'co-uuid');
  assert.equal(payload.metadata.titan_correlation_id, 'corr-abc');
  assert.equal(payload.metadata.titan_invoice_number, 'INV-2025-0421');
});

test('the payload never contains a secret', () => {
  const serialised = JSON.stringify(buildPaymentLinkRequest(requestInput)).toLowerCase();
  for (const forbidden of ['sk_test', 'sk_live', 'secret', 'bearer', 'whsec_']) {
    assert.ok(!serialised.includes(forbidden), `payload leaked ${forbidden}`);
  }
});

test('missing required text and wrong currency are refused', () => {
  assert.throws(() => buildPaymentLinkRequest({ ...requestInput, invoiceNumber: ' ' }), /invoiceNumber/);
  assert.throws(() => buildPaymentLinkRequest({ ...requestInput, customerReference: '' }), /customerReference/);
  assert.throws(() => buildPaymentLinkRequest({ ...requestInput, correlationId: '' }), /correlationId/);
  assert.throws(() => buildPaymentLinkRequest({ ...requestInput, currency: 'GBP' }), /ZAR only/);
  assert.throws(() => buildPaymentLinkRequest({ ...requestInput, outstandingCents: 0 }), /greater than zero/);
});

test('the customer reference combines invoice number and customer reference', () => {
  assert.equal(buildPaymentLinkReference('INV-1', 'CUST-2'), 'INV-1/CUST-2');
});

// ---------------------------------------------------------------------------
// Idempotency and lifecycle
// ---------------------------------------------------------------------------

test('one invoice version at one balance yields one stable idempotency key', () => {
  const key = buildPaymentLinkIdempotencyKey({
    invoiceId: 'inv-1',
    documentVersion: 1,
    outstandingCents: 993_750,
  });
  assert.equal(
    key,
    buildPaymentLinkIdempotencyKey({ invoiceId: 'inv-1', documentVersion: 1, outstandingCents: 993_750 }),
  );
  assert.equal(key, 'titan-invoice-inv-1-v1-993750');
});

test('a different balance or version yields a different key', () => {
  const base = { invoiceId: 'inv-1', documentVersion: 1, outstandingCents: 993_750 };
  const keys = new Set([
    buildPaymentLinkIdempotencyKey(base),
    buildPaymentLinkIdempotencyKey({ ...base, outstandingCents: 500_000 }),
    buildPaymentLinkIdempotencyKey({ ...base, documentVersion: 2 }),
    buildPaymentLinkIdempotencyKey({ ...base, invoiceId: 'inv-2' }),
  ]);
  assert.equal(keys.size, 4);
});

test('the idempotency key rejects an invalid version', () => {
  assert.throws(
    () => buildPaymentLinkIdempotencyKey({ invoiceId: 'i', documentVersion: 0, outstandingCents: 100 }),
    /positive integer/,
  );
});

test('a prepared link is invalidated when the balance or version moves', () => {
  const prepared = { amountCents: 993_750, documentVersion: 1 };
  assert.equal(
    shouldInvalidatePreparedLink(prepared, { outstandingCents: 993_750, documentVersion: 1 }),
    false,
  );
  assert.equal(
    shouldInvalidatePreparedLink(prepared, { outstandingCents: 500_000, documentVersion: 1 }),
    true,
  );
  assert.equal(
    shouldInvalidatePreparedLink(prepared, { outstandingCents: 993_750, documentVersion: 2 }),
    true,
  );
});

test('an existing active link at the same balance is reused, not duplicated', () => {
  const action = resolveExistingLinkAction(
    { status: 'active', amountCents: 993_750, documentVersion: 1 },
    { outstandingCents: 993_750, documentVersion: 1 },
  );
  assert.equal(action.action, 'reuse');
});

test('a stale active link is regenerated rather than left to invite the wrong amount', () => {
  const action = resolveExistingLinkAction(
    { status: 'active', amountCents: 993_750, documentVersion: 1 },
    { outstandingCents: 400_000, documentVersion: 1 },
  );
  assert.equal(action.action, 'regenerate');
  assert.match(action.reason, /balance changed/);
});

test('no existing link, or a dead one, means create', () => {
  assert.equal(
    resolveExistingLinkAction(null, { outstandingCents: 100, documentVersion: 1 }).action,
    'create',
  );
  for (const status of ['paid', 'cancelled', 'superseded', 'failed'] as const) {
    assert.equal(
      resolveExistingLinkAction(
        { status, amountCents: 100, documentVersion: 1 },
        { outstandingCents: 100, documentVersion: 1 },
      ).action,
      'create',
      status,
    );
  }
});

test('only prepared and active links can still take a payment', () => {
  assert.deepEqual(PAYMENT_LINK_STATUSES.filter(isLivePaymentLinkStatus), ['prepared', 'active']);
});

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

test('only real Yoco hosted payment URLs are accepted', () => {
  assert.ok(isYocoPaymentUrl('https://pay.yoco.com/r/abc123'));
  assert.ok(isYocoPaymentUrl('https://pay.yoco.com/pay/ch_1?ref=INV-1'));
  assert.ok(isYocoPaymentUrl('https://checkout.pay.yoco.com/r/abc'));
});

test('spoofed, insecure or missing payment URLs are rejected', () => {
  for (const bad of [
    'http://pay.yoco.com/r/abc',
    'https://pay.yoco.com.evil.test/r/abc',
    'https://yoco.com/r/abc',
    'https://payyoco.com/r/abc',
    'https://example.com/pay',
    'pay.yoco.com/r/abc',
    '',
    '   ',
    null,
    undefined,
    42,
  ]) {
    assert.equal(isYocoPaymentUrl(bad), false, `accepted ${String(bad)}`);
  }
});

test('requiring a payment URL throws rather than publishing a bad link', () => {
  assert.equal(requireYocoPaymentUrl(' https://pay.yoco.com/r/abc '), 'https://pay.yoco.com/r/abc');
  assert.throws(() => requireYocoPaymentUrl('https://example.com/pay'), YocoPaymentLinkError);
  assert.throws(() => requireYocoPaymentUrl(null), /refusing to publish/);
});

// ---------------------------------------------------------------------------
// Approve & Issue
// ---------------------------------------------------------------------------

test('Approve and Issue states the customer, invoice, balance and the one link creation', () => {
  const summary = describeApproveAndIssue({
    customerName: 'John van der Merwe',
    invoiceNumber: 'INV-2025-0421',
    outstandingCents: 993_750,
    currency: 'ZAR',
    yocoConnected: true,
    eligibility: { eligible: true },
  });

  assert.equal(summary.willCreatePaymentLink, true);
  assert.equal(summary.paymentLinkSkippedReason, null);

  const text = summary.statements.join(' ');
  assert.match(text, /John van der Merwe/);
  assert.match(text, /INV-2025-0421/);
  assert.match(text, /9937\.50/);
  assert.match(text, /one Yoco payment link/);
  assert.match(text, /QR code/);
  assert.match(text, /authorises that single link creation/);
});

test('Approve and Issue is honest when Yoco is not connected', () => {
  const summary = describeApproveAndIssue({
    customerName: 'John van der Merwe',
    invoiceNumber: 'INV-2025-0421',
    outstandingCents: 993_750,
    currency: 'ZAR',
    yocoConnected: false,
    eligibility: { eligible: true },
  });

  assert.equal(summary.willCreatePaymentLink, false);
  assert.match(summary.paymentLinkSkippedReason ?? '', /not connected/);
  assert.match(summary.statements.join(' '), /Connect Yoco in Integrations/);
});

test('Approve and Issue explains why a paid invoice gets no link', () => {
  const summary = describeApproveAndIssue({
    customerName: 'John van der Merwe',
    invoiceNumber: 'INV-2025-0421',
    outstandingCents: 0,
    currency: 'ZAR',
    yocoConnected: true,
    eligibility: { eligible: false, code: 'INVOICE_PAID', reason: 'This invoice is already paid' },
  });

  assert.equal(summary.willCreatePaymentLink, false);
  assert.match(summary.statements.join(' '), /already paid/);
});

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

const webhookBody = {
  id: 'evt_123',
  type: 'payment.created',
  payload: {
    id: 'p_abc',
    amount: 993_750,
    currency: 'ZAR',
    paymentLinkId: 'pl_xyz',
    orderId: 'or_555',
    metadata: {
      titan_invoice_id: 'inv-uuid',
      titan_company_id: 'co-uuid',
      ignored: 7,
    },
  },
};

test('a payment.created webhook parses into provider identifiers', () => {
  const event = parseYocoPaymentWebhook(webhookBody);
  assert.equal(event.eventId, 'evt_123');
  assert.equal(event.type, YOCO_PAYMENT_CREATED_EVENT);
  assert.equal(event.paymentId, 'p_abc');
  assert.equal(event.amountCents, 993_750);
  assert.equal(event.paymentLinkId, 'pl_xyz');
  assert.equal(event.orderId, 'or_555');
  assert.equal(event.metadata.titan_invoice_id, 'inv-uuid');
  // Non-string metadata is dropped rather than coerced.
  assert.equal(event.metadata.ignored, undefined);
});

test('a flat webhook body without a payload wrapper still parses', () => {
  const event = parseYocoPaymentWebhook({
    id: 'evt_1',
    type: 'payment.created',
    amount: 500,
    currency: 'ZAR',
  });
  assert.equal(event.paymentId, 'evt_1');
  assert.equal(event.amountCents, 500);
});

test('malformed webhook bodies are refused', () => {
  assert.throws(() => parseYocoPaymentWebhook(null), /must be an object/);
  assert.throws(() => parseYocoPaymentWebhook([]), /must be an object/);
  assert.throws(() => parseYocoPaymentWebhook({ id: 'e' }), /event type/);
  assert.throws(() => parseYocoPaymentWebhook({ type: 'payment.created' }), /event id/);
  assert.throws(
    () => parseYocoPaymentWebhook({ id: 'e', type: 'payment.created', payload: { amount: 1 } }),
    /payment id/,
  );
  assert.throws(
    () => parseYocoPaymentWebhook({ id: 'e', type: 'payment.created', payload: { id: 'p', amount: 1.5 } }),
    /non-integer amount/,
  );
});

test('a verified payment event records a payment but never claims Xero reconciliation', () => {
  const outcome = resolveWebhookOutcome(parseYocoPaymentWebhook(webhookBody));
  assert.equal(outcome.recordPayment, true);
  assert.equal(outcome.markLinkPaid, true);
  assert.equal(outcome.financiallyReconciled, false);
  assert.match(outcome.note, /Xero remains the source of truth/);
});

test('unsupported Yoco events are ignored, not acted on', () => {
  const outcome = resolveWebhookOutcome({
    eventId: 'e',
    type: 'refund.succeeded',
    paymentId: 'p',
    amountCents: 100,
    currency: 'ZAR',
    paymentLinkId: null,
    orderId: null,
    metadata: {},
  });
  assert.equal(outcome.recordPayment, false);
  assert.equal(outcome.markLinkPaid, false);
  assert.match(outcome.note, /Ignored unsupported/);
});
