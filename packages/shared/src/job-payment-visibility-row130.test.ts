import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InvoiceSummary, PaymentSummary } from './finance.js';
import {
  assertRow130SafetyGates,
  CANONICAL_JOB_PAYMENT_VISIBILITY,
  proveJobPaymentVisibilityCoverage,
  resolveJobPaymentVisibility,
} from './job-payment-visibility-row130.js';

function inv(p: Partial<InvoiceSummary> & Pick<InvoiceSummary, 'id' | 'status' | 'totalCents'>): InvoiceSummary {
  return {
    invoiceNumber: p.id,
    internalNumber: p.id,
    displayInvoiceNumber: p.id,
    displayOfficialInvoiceNumber: p.id,
    xeroInvoiceNumber: null,
    xeroReference: null,
    numberAuthority: 'internal_pending_xero',
    stage: 'standard',
    customerId: 'c1',
    customerName: 'C',
    jobId: 'j1',
    jobTitle: null,
    jobNumber: null,
    quoteId: null,
    quoteNumber: null,
    quoteVersionNumber: null,
    amountCents: p.totalCents,
    amountPaidCents: 0,
    outstandingCents: p.totalCents,
    isOverdue: false,
    currency: 'ZAR',
    dueDate: null,
    issuedAt: null,
    customerReference: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...p,
  };
}

function pay(p: Partial<PaymentSummary> & Pick<PaymentSummary, 'id' | 'invoiceId' | 'amountCents'>): PaymentSummary {
  return {
    invoiceNumber: p.invoiceId,
    invoiceTitle: '',
    customerName: 'C',
    currency: 'ZAR',
    method: 'bank_transfer',
    reference: null,
    xeroPaymentId: null,
    receiptNumber: null,
    paidAt: '2024-06-01T00:00:00.000Z',
    createdAt: '2024-06-01T00:00:00.000Z',
    ...p,
  };
}

describe('Row 130 job payment visibility', () => {
  it('covers all canonical states; no fake paid; evidence-gated specials', () => {
    const coverage = proveJobPaymentVisibilityCoverage();
    assert.equal(coverage.length, CANONICAL_JOB_PAYMENT_VISIBILITY.length);
    assert.ok(coverage.every((c) => c.resolvable));

    assert.equal(
      resolveJobPaymentVisibility({ quotes: [], invoices: [], payments: [] }).visibility,
      'NO_INVOICE',
    );
    assert.equal(
      resolveJobPaymentVisibility({
        quotes: [],
        invoices: [inv({ id: 'i1', status: 'draft', totalCents: 1000 })],
        payments: [],
      }).visibility,
      'DRAFT_INVOICE',
    );
    assert.equal(
      resolveJobPaymentVisibility({
        quotes: [],
        invoices: [
          inv({
            id: 'i1',
            status: 'sent',
            totalCents: 1000,
            outstandingCents: 1000,
            dueDate: '2020-01-01',
          }),
        ],
        payments: [],
        evidence: { asOfDate: '2024-01-01' },
      }).visibility,
      'OVERDUE',
    );
    assert.equal(
      resolveJobPaymentVisibility({
        quotes: [],
        invoices: [inv({ id: 'i1', status: 'paid', totalCents: 1000, outstandingCents: 0, amountPaidCents: 1000 })],
        payments: [pay({ id: 'p1', invoiceId: 'i1', amountCents: 1000 })],
      }).visibility,
      'PAID_IN_FULL',
    );
    assert.equal(
      resolveJobPaymentVisibility({
        quotes: [],
        invoices: [inv({ id: 'i1', status: 'sent', totalCents: 1000, outstandingCents: 1000 })],
        payments: [],
        evidence: { hasDispute: true },
      }).visibility,
      'DISPUTED',
    );
    assert.equal(
      resolveJobPaymentVisibility({
        quotes: [],
        invoices: [inv({ id: 'i1', status: 'sent', totalCents: 1000 })],
        payments: [pay({ id: 'r1', invoiceId: 'i1', amountCents: -1000, reference: 'refund full' })],
      }).visibility,
      'REFUNDED',
    );
    const empty = resolveJobPaymentVisibility({ quotes: [], invoices: [], payments: [] });
    assert.equal(empty.fakePaidUnpaid, false);
    assert.equal(assertRow130SafetyGates({ row92AutomationEnabled: false }).fakePaidUnpaid, false);
  });
});
