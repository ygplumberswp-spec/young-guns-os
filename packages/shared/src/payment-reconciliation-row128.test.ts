import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow128SafetyGates,
  projectPaymentBalanceTruth,
  provePaymentReconciliationHops,
  reviewAuraPaymentAllocation,
  suggestAuraPaymentAllocation,
} from './payment-reconciliation-row128.js';

describe('Row 128 payment reconciliation', () => {
  it('AURA suggests only; uncertain needs human review; no Xero write', () => {
    const aura = suggestAuraPaymentAllocation({
      transactionAmountCents: 10000,
      transactionDate: '2024-06-01',
      description: 'INV-1 payment',
      reference: 'INV-1',
      invoices: [
        {
          id: 'inv-1',
          label: 'Invoice INV-1',
          amountCents: 10000,
          reference: 'INV-1',
          date: '2024-06-01',
        },
        {
          id: 'inv-2',
          label: 'Invoice INV-2',
          amountCents: 10000,
          reference: 'INV-2',
          date: '2024-06-01',
        },
      ],
    });
    assert.equal(aura.kind, 'SUGGEST');
    assert.equal(aura.canIndependentlyReconcile, false);
    assert.equal(aura.xeroWritePerformed, false);

    assert.throws(() =>
      reviewAuraPaymentAllocation({
        currentState: 'REVIEW_REQUIRED',
        nextState: 'RECONCILED',
        reviewedByUserId: 'u1',
        reviewedAt: '2024-06-02T00:00:00.000Z',
        evidence: { note: 'confirmed' },
        aura,
        forceAuraReconcile: true,
      }),
    );

    const review = reviewAuraPaymentAllocation({
      currentState: 'REVIEW_REQUIRED',
      nextState: 'RECONCILED',
      reviewedByUserId: 'u1',
      reviewedAt: '2024-06-02T00:00:00.000Z',
      evidence: { invoiceId: 'inv-1' },
      aura,
    });
    assert.equal(review.humanConfirmed, true);

    const balance = projectPaymentBalanceTruth({
      invoiceOutstandingCents: 0,
      jobBalanceOwingCents: 0,
      customerOutstandingCents: 0,
    });
    const hops = provePaymentReconciliationHops({
      hasBankOrXeroPayment: true,
      aura,
      review,
      balance,
      xeroWrites: 0,
    });
    assert.ok(hops.every((h) => h.status === 'SUPPORTED'));
    assert.equal(assertRow128SafetyGates({ row92AutomationEnabled: false }).auraSuggestionOnly, true);
  });
});
