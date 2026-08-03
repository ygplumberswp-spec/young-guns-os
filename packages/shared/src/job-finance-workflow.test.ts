import assert from 'node:assert/strict';
import test from 'node:test';
import type { InvoiceSummary, QuoteSummary } from './finance.js';
import {
  buildPaymentRecordHref,
  canInvoiceFromAcceptedQuote,
  deriveJobCashChainSteps,
  findAcceptedQuoteForInvoicing,
  suggestNextInvoiceStage,
} from './job-finance-workflow.js';

const baseQuote = (overrides: Partial<QuoteSummary>): QuoteSummary =>
  ({
    id: 'q1',
    quoteNumber: 'Q-001',
    title: 'Repair',
    status: 'accepted',
    versionNumber: 1,
    isImmutable: true,
    customerId: 'c1',
    customerName: 'Customer',
    jobId: 'j1',
    jobTitle: 'Job',
    jobNumber: 'YG-001',
    propertyId: null,
    leadId: null,
    estimatorUserId: null,
    amountCents: 10000,
    subtotalCents: 8700,
    vatCents: 1300,
    totalCents: 10000,
    currency: 'ZAR',
    validUntil: null,
    issuedAt: null,
    acceptedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    depositPercent: null,
    ...overrides,
  }) as QuoteSummary;

const baseInvoice = (overrides: Partial<InvoiceSummary>): InvoiceSummary =>
  ({
    id: 'i1',
    invoiceNumber: 'TITAN-INV-000001',
    internalNumber: 'TITAN-INV-000001',
    displayInvoiceNumber: 'Pending Xero sync (TITAN-INV-000001)',
    title: 'Invoice',
    status: 'sent',
    stage: 'standard',
    customerId: 'c1',
    customerName: 'Customer',
    jobId: 'j1',
    jobTitle: 'Job',
    jobNumber: 'YG-001',
    quoteId: 'q1',
    quoteNumber: 'Q-001',
    quoteVersionNumber: 1,
    amountCents: 10000,
    subtotalCents: 8700,
    vatCents: 1300,
    totalCents: 10000,
    amountPaidCents: 0,
    outstandingCents: 10000,
    currency: 'ZAR',
    dueDate: null,
    isOverdue: false,
    xeroInvoiceNumber: null,
    xeroReference: 'YG-001',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }) as InvoiceSummary;

test('deriveJobCashChainSteps marks completed when snapshot exists', () => {
  const steps = deriveJobCashChainSteps({
    jobStatus: 'in_progress',
    hasCompletionSnapshot: true,
    financeSummary: { invoices: [], payments: [] },
  });
  const completed = steps.find((step) => step.id === 'completed');
  assert.equal(completed?.done, true);
  assert.match(completed?.detail ?? '', /gated mobile completion snapshot/i);
});

test('deriveJobCashChainSteps is honest when office completed without snapshot', () => {
  const steps = deriveJobCashChainSteps({
    jobStatus: 'completed',
    hasCompletionSnapshot: false,
    financeSummary: { invoices: [], payments: [] },
  });
  const completed = steps.find((step) => step.id === 'completed');
  assert.equal(completed?.done, true);
  assert.match(completed?.detail ?? '', /no gated mobile snapshot/i);
});

test('deriveJobCashChainSteps marks paid when outstanding is zero', () => {
  const steps = deriveJobCashChainSteps({
    jobStatus: 'completed',
    hasCompletionSnapshot: true,
    financeSummary: {
      invoices: [baseInvoice({ status: 'paid', outstandingCents: 0, amountPaidCents: 10000 })],
      payments: [{ id: 'p1' } as never],
    },
  });
  assert.equal(steps.find((step) => step.id === 'paid')?.done, true);
});

test('findAcceptedQuoteForInvoicing returns accepted quote only', () => {
  const accepted = findAcceptedQuoteForInvoicing([
    baseQuote({ status: 'sent' }),
    baseQuote({ id: 'q2', status: 'accepted' }),
  ]);
  assert.equal(accepted?.id, 'q2');
});

test('suggestNextInvoiceStage prefers deposit when quote has deposit percent', () => {
  assert.equal(suggestNextInvoiceStage([], { depositPercent: 50 }), 'deposit');
  assert.equal(
    suggestNextInvoiceStage([baseInvoice({ stage: 'deposit' })], { depositPercent: 50 }),
    'final',
  );
});

test('canInvoiceFromAcceptedQuote is true only with accepted quote', () => {
  assert.equal(canInvoiceFromAcceptedQuote([baseQuote({ status: 'sent' })]), false);
  assert.equal(canInvoiceFromAcceptedQuote([baseQuote({ status: 'accepted' })]), true);
});

test('buildPaymentRecordHref encodes invoice and job prefill', () => {
  assert.equal(
    buildPaymentRecordHref({ invoiceId: 'inv-1', jobId: 'job-1' }),
    '/finance/payments/new?invoiceId=inv-1&jobId=job-1',
  );
});
