import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveInvoiceReconciliationState,
  jobProfitabilityFromSources,
} from './xero-reconciliation.js';

test('Yoco payment alone does not prove Xero reconciliation', () => {
  const snapshot = deriveInvoiceReconciliationState({
    invoiceId: 'inv-1',
    publicInvoiceNumber: 'INV-001',
    invoiceTotalCents: 10_000,
    amountPaidCents: 10_000,
    balanceDueCents: 0,
    yocoPaymentEventId: 'yoco-1',
    xeroPaymentId: null,
    bankTransactionId: null,
    isReconciledInXero: false,
    lastUpdatedAt: '2026-08-06T00:00:00.000Z',
    hasRefund: false,
    hasCreditNote: false,
    hasOverpayment: false,
    hasPrepayment: false,
  });
  assert.equal(snapshot.state, 'yoco_payment_received');
  assert.equal(snapshot.reconciliationProven, false);
  assert.ok(snapshot.staleDataWarning?.includes('Xero payment'));
});

test('bank reconciliation confirmed only with Xero evidence', () => {
  const snapshot = deriveInvoiceReconciliationState({
    invoiceId: 'inv-1',
    publicInvoiceNumber: 'INV-001',
    invoiceTotalCents: 10_000,
    amountPaidCents: 10_000,
    balanceDueCents: 0,
    yocoPaymentEventId: 'yoco-1',
    xeroPaymentId: 'xpay-1',
    bankTransactionId: 'bank-1',
    isReconciledInXero: true,
    lastUpdatedAt: '2026-08-06T00:00:00.000Z',
    hasRefund: false,
    hasCreditNote: false,
    hasOverpayment: false,
    hasPrepayment: false,
  });
  assert.equal(snapshot.state, 'bank_reconciliation_confirmed');
  assert.equal(snapshot.reconciliationProven, true);
});

test('unpaid invoices excluded from collected cash in job profit', () => {
  const profit = jobProfitabilityFromSources({
    quotedRevenueCents: 10_000,
    invoicedRevenueCents: 10_000,
    collectedCashCents: 0,
    vatCents: 0,
    directCostCents: 2_000,
  });
  assert.equal(profit.revenueExVatCents, 0);
  assert.ok(profit.warnings.some((w) => w.includes('No collected cash')));
});

test('VAT excluded from revenue in job profit', () => {
  const profit = jobProfitabilityFromSources({
    quotedRevenueCents: 11_500,
    invoicedRevenueCents: 11_500,
    collectedCashCents: 11_500,
    vatCents: 1_500,
    directCostCents: 5_000,
  });
  assert.equal(profit.revenueExVatCents, 10_000);
  assert.equal(profit.grossProfitCents, 5_000);
});
