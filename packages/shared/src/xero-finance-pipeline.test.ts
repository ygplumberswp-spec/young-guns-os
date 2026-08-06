import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinanceDashboardSnapshot,
  extractXeroLineItemsFromRaw,
  mapXeroLineItemsToTitan,
  mapXeroQuoteStatus,
  normalizeContactEmail,
  normalizeContactPhone,
  pickCustomerMatchCandidate,
} from './xero-finance-pipeline.js';

test('normalizeContactEmail lowercases and trims', () => {
  assert.equal(normalizeContactEmail('  Ada@Example.COM '), 'ada@example.com');
  assert.equal(normalizeContactEmail(''), null);
  assert.equal(normalizeContactEmail(null), null);
});

test('normalizeContactPhone keeps digit identity only when long enough', () => {
  assert.equal(normalizeContactPhone('+27 82 123 4567'), '27821234567');
  assert.equal(normalizeContactPhone('123'), null);
});

test('pickCustomerMatchCandidate prefers xero id over email/phone', () => {
  assert.deepEqual(
    pickCustomerMatchCandidate({
      mappedCustomerId: 'c-xero',
      emailMatchCustomerId: 'c-email',
      phoneMatchCustomerId: 'c-phone',
    }),
    { customerId: 'c-xero', matchType: 'xero_id' },
  );
  assert.deepEqual(
    pickCustomerMatchCandidate({
      emailMatchCustomerId: 'c-email',
      phoneMatchCustomerId: 'c-phone',
    }),
    { customerId: 'c-email', matchType: 'email' },
  );
  assert.equal(pickCustomerMatchCandidate({}), null);
});

test('mapXeroQuoteStatus maps accepted/declined honestly', () => {
  assert.equal(mapXeroQuoteStatus('ACCEPTED'), 'accepted');
  assert.equal(mapXeroQuoteStatus('DECLINED'), 'declined');
  assert.equal(mapXeroQuoteStatus('SENT'), 'sent');
  assert.equal(mapXeroQuoteStatus('DRAFT'), 'draft');
  assert.equal(mapXeroQuoteStatus(null), 'draft');
});

test('mapXeroLineItemsToTitan maps account codes and amounts without invention', () => {
  const mapped = mapXeroLineItemsToTitan([
    {
      lineItemId: 'li-1',
      description: 'Labour',
      quantity: 2,
      unitAmount: 100,
      lineAmount: 200,
      taxAmount: 30,
      accountCode: '200',
    },
  ]);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0]!.unitPriceCents, 10000);
  assert.equal(mapped[0]!.lineTotalCents, 20000);
  assert.equal(mapped[0]!.lineVatCents, 3000);
  assert.equal(mapped[0]!.accountCode, '200');
  assert.equal(mapped[0]!.sourceExternalId, 'li-1');
  assert.deepEqual(mapXeroLineItemsToTitan([]), []);
});

test('extractXeroLineItemsFromRaw reads LineItems from Xero payload', () => {
  const lines = extractXeroLineItemsFromRaw({
    LineItems: [
      {
        LineItemID: 'a',
        Description: 'Pipe',
        Quantity: 1,
        UnitAmount: 50,
        LineAmount: 50,
        TaxAmount: 7.5,
        AccountCode: '260',
      },
    ],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.accountCode, '260');
});

test('buildFinanceDashboardSnapshot uses real totals and zeros when empty', () => {
  const empty = buildFinanceDashboardSnapshot({ invoices: [], payments: [], quotes: [] });
  assert.equal(empty.revenueCents, 0);
  assert.equal(empty.outstandingCents, 0);
  assert.equal(empty.quotePipelineCount, 0);
  assert.deepEqual(empty.monthlyTurnover, []);

  const now = new Date('2026-08-03T12:00:00.000Z');
  const snap = buildFinanceDashboardSnapshot({
    now,
    invoices: [
      {
        status: 'paid',
        totalCents: 10_000,
        amountCents: 10_000,
        amountPaidCents: 10_000,
        issuedAt: '2026-07-15T00:00:00.000Z',
      },
      {
        status: 'sent',
        totalCents: 5_000,
        amountCents: 5_000,
        amountPaidCents: 0,
        dueDate: '2026-07-01T00:00:00.000Z',
        issuedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
    payments: [{ amountCents: 10_000, paidAt: '2026-07-16T00:00:00.000Z' }],
    quotes: [
      { status: 'sent', totalCents: 8_000, amountCents: 8_000 },
      { status: 'accepted', totalCents: 9_000, amountCents: 9_000 },
    ],
  });

  assert.equal(snap.revenueCents, 10_000);
  assert.equal(snap.outstandingCents, 5_000);
  assert.equal(snap.overdueCents, 5_000);
  assert.equal(snap.paidInvoiceCount, 1);
  assert.equal(snap.quotePipelineCount, 1);
  assert.equal(snap.quotePipelineCents, 8_000);
  assert.equal(snap.paymentTrends[0]?.amountCents, 10_000);
});
