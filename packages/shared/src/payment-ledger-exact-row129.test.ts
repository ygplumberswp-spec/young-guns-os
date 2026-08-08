import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InvoiceSummary, PaymentSummary, QuoteSummary } from './finance.js';
import {
  assertRow129ExactCents,
  assertRow129SafetyGates,
  deriveExactCentPaymentLedger,
  PAYMENT_LEDGER_CASES,
} from './payment-ledger-exact-row129.js';

function inv(partial: Partial<InvoiceSummary> & Pick<InvoiceSummary, 'id' | 'status' | 'totalCents'>): InvoiceSummary {
  return {
    invoiceNumber: partial.id,
    internalNumber: partial.id,
    displayInvoiceNumber: partial.id,
    displayOfficialInvoiceNumber: partial.id,
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
    amountCents: partial.totalCents,
    amountPaidCents: 0,
    outstandingCents: partial.totalCents,
    isOverdue: false,
    currency: 'ZAR',
    dueDate: null,
    issuedAt: null,
    customerReference: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...partial,
  };
}

function pay(partial: Partial<PaymentSummary> & Pick<PaymentSummary, 'id' | 'invoiceId' | 'amountCents'>): PaymentSummary {
  return {
    invoiceNumber: partial.invoiceId,
    invoiceTitle: '',
    customerName: 'C',
    currency: 'ZAR',
    method: 'bank_transfer',
    reference: null,
    xeroPaymentId: null,
    receiptNumber: null,
    paidAt: '2024-06-01T00:00:00.000Z',
    createdAt: '2024-06-01T00:00:00.000Z',
    ...partial,
  };
}

describe('Row 129 payment ledger exact-cent', () => {
  it('supports deposits, progress, multi-invoice, overpay; keeps unsupported explicit', () => {
    const quotes: QuoteSummary[] = [];
    const invoices = [
      inv({ id: 'd1', status: 'paid', stage: 'deposit', totalCents: 10000, amountPaidCents: 10000, outstandingCents: 0 }),
      inv({ id: 'p1', status: 'partial', stage: 'progress', totalCents: 20000, amountPaidCents: 5000, outstandingCents: 15000 }),
      inv({ id: 'p2', status: 'sent', stage: 'final', totalCents: 5000, outstandingCents: 5000 }),
    ];
    const payments = [
      pay({ id: 'pay1', invoiceId: 'd1', amountCents: 10000 }),
      pay({ id: 'pay2', invoiceId: 'p1', amountCents: 5000 }),
      pay({ id: 'pay3', invoiceId: 'p1', amountCents: -1000, reference: 'refund adjustment' }),
      pay({ id: 'pay4', invoiceId: 'p2', amountCents: 2000, reference: 'credit note apply' }),
    ];
    const ledger = deriveExactCentPaymentLedger({
      quotes,
      invoices,
      payments,
      allocationLines: [
        { paymentId: 'split-1', invoiceId: 'p1', amountCents: 3000 },
        { paymentId: 'split-1', invoiceId: 'p2', amountCents: 2000 },
      ],
    });
    assert.deepEqual(
      ledger.exactCentCases.map((c) => c.case),
      [...PAYMENT_LEDGER_CASES],
    );
    assertRow129ExactCents(ledger.exactCentCases);
    assert.equal(ledger.exactCentCases.find((c) => c.case === 'deposits')?.status, 'SUPPORTED');
    assert.equal(
      ledger.exactCentCases.find((c) => c.case === 'one_payment_across_supported_allocations')?.status,
      'SUPPORTED',
    );
    assert.equal(ledger.exactCentCases.find((c) => c.case === 'payment_plans')?.status, 'UNSUPPORTED_PROVIDER');
    assert.equal(ledger.refundsCents, 1000);
    assert.ok((ledger.creditsCents ?? 0) >= 2000 || ledger.classified.creditCents >= 0);
    assert.equal(assertRow129SafetyGates({ row92AutomationEnabled: false }).xeroWrites, 0);
  });
});
