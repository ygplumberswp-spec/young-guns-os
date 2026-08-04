import assert from 'node:assert/strict';
import test from 'node:test';
import type { InvoiceSummary, PaymentSummary, QuoteSummary } from './finance.js';
import {
  deriveJobLifecycleLabel,
  deriveJobPaymentLedger,
  deriveJobPaymentState,
} from './job-payment-ledger.js';

const baseQuote = (overrides: Partial<QuoteSummary>): QuoteSummary => ({
  id: 'q1',
  quoteNumber: 'Q-001',
  xeroQuoteNumber: null,
  displayQuoteNumber: 'Draft — Xero quote number pending',
  title: 'Quote',
  status: 'draft',
  versionNumber: 1,
  isImmutable: false,
  customerId: 'cust-1',
  customerName: 'Customer',
  jobId: 'job-1',
  jobTitle: 'Job',
  jobNumber: 'J-001',
  propertyId: null,
  leadId: null,
  estimatorUserId: null,
  amountCents: 10_000_00,
  subtotalCents: 8695_65,
  vatCents: 1304_35,
  totalCents: 10_000_00,
  currency: 'ZAR',
  validUntil: null,
  depositPercent: null,
  issuedAt: null,
  acceptedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const baseInvoice = (overrides: Partial<InvoiceSummary>): InvoiceSummary => ({
  id: 'i1',
  invoiceNumber: 'INV-001',
  internalNumber: 'TITAN-INV-000001',
  displayInvoiceNumber: 'INV-001',
  displayOfficialInvoiceNumber: 'Draft — Xero invoice number pending',
  xeroInvoiceNumber: null,
  xeroReference: null,
  numberAuthority: 'internal_pending_xero',
  title: 'Invoice',
  status: 'sent',
  stage: 'standard',
  customerId: 'cust-1',
  customerName: 'Customer',
  jobId: 'job-1',
  jobTitle: 'Job',
  jobNumber: 'J-001',
  quoteId: null,
  quoteNumber: null,
  quoteVersionNumber: null,
  amountCents: 10_000_00,
  totalCents: 10_000_00,
  amountPaidCents: 0,
  outstandingCents: 10_000_00,
  isOverdue: false,
  currency: 'ZAR',
  dueDate: null,
  issuedAt: null,
  customerReference: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const basePayment = (overrides: Partial<PaymentSummary>): PaymentSummary => ({
  id: 'p1',
  invoiceId: 'i1',
  invoiceNumber: 'INV-001',
  invoiceTitle: 'Invoice',
  customerName: 'Customer',
  amountCents: 5_000_00,
  currency: 'ZAR',
  method: 'bank_transfer',
  reference: null,
  xeroPaymentId: null,
  receiptNumber: null,
  paidAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

test('deriveJobPaymentState returns no_invoice when empty', () => {
  assert.equal(deriveJobPaymentState({ quotes: [], invoices: [], payments: [] }), 'no_invoice');
});

test('deriveJobPaymentState returns deposit_required from accepted quote deposit percent', () => {
  assert.equal(
    deriveJobPaymentState({
      quotes: [baseQuote({ status: 'accepted', depositPercent: 50 })],
      invoices: [],
      payments: [],
    }),
    'deposit_required',
  );
});

test('deriveJobPaymentState returns paid_in_full when settled', () => {
  assert.equal(
    deriveJobPaymentState({
      quotes: [],
      invoices: [baseInvoice({ status: 'paid', outstandingCents: 0 })],
      payments: [basePayment({ amountCents: 10_000_00 })],
    }),
    'paid_in_full',
  );
});

test('deriveJobPaymentLedger avoids false zeroes without finance data', () => {
  const ledger = deriveJobPaymentLedger({ quotes: [], invoices: [], payments: [] });
  assert.equal(ledger.hasFinanceData, false);
  assert.equal(ledger.jobTotalCents, null);
  assert.equal(ledger.balanceOwingCents, null);
});

test('deriveJobLifecycleLabel maps en_route to Travelling', () => {
  const ledger = deriveJobPaymentLedger({ quotes: [], invoices: [], payments: [] });
  assert.equal(
    deriveJobLifecycleLabel({
      status: 'in_progress',
      executionPhase: 'en_route',
      ledger,
    }),
    'Travelling',
  );
});
