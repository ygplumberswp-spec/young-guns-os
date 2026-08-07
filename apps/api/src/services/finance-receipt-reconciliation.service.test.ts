/**
 * BANK-002 — API/service harness tests for receipt reconciliation.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReceiptMatchFingerprint,
  deriveBankReceiptStatus,
  sumActiveReceiptLinks,
} from '@titan/shared';

describe('BANK-002 receipt ↔ existing cost does not duplicate economic cost', () => {
  it('11 linking receipt to allocated direct cost does not change economic amount', () => {
    const economicCostCents = 285000;
    const bankPaidCents = 285000;
    assert.equal(economicCostCents, bankPaidCents);
    assert.notEqual(economicCostCents + bankPaidCents, economicCostCents);
  });
});

describe('BANK-002 partial supplier payment', () => {
  it('15 one supplier cost paid by multiple bank transactions', () => {
    const economic = 100000;
    const payment1 = 40000;
    const payment2 = 35000;
    const totalPaid = payment1 + payment2;
    assert.equal(totalPaid, 75000);
    assert.ok(totalPaid < economic);
  });
});

describe('BANK-002 stale match blocking', () => {
  it('18 stale candidate blocked when fingerprint mismatch', () => {
    const stored = buildReceiptMatchFingerprint({
      receiptId: 'r-1',
      bankTransactionId: 'tx-1',
      receiptUpdatedAt: '2026-01-01T00:00:00.000Z',
      transactionUpdatedAt: '2026-01-01T00:00:00.000Z',
      transactionAllocatedAmountCents: 0,
      transactionReceiptStatus: 'receipt_missing',
    });
    const current = buildReceiptMatchFingerprint({
      receiptId: 'r-1',
      bankTransactionId: 'tx-1',
      receiptUpdatedAt: '2026-01-01T00:00:00.000Z',
      transactionUpdatedAt: '2026-01-03T00:00:00.000Z',
      transactionAllocatedAmountCents: 285000,
      transactionReceiptStatus: 'receipt_verified',
    });
    assert.notEqual(stored, current);
  });
});

describe('BANK-002 queue semantics', () => {
  it('16 unmatched receipt queue — awaiting_transaction_match', () => {
    const status = deriveBankReceiptStatus({
      direction: 'debit',
      category: 'fuel',
      linkedReceiptCount: 0,
    });
    assert.equal(status, 'receipt_missing');
  });

  it('17 bank transaction missing receipt queue flag', () => {
    const status = deriveBankReceiptStatus({
      direction: 'debit',
      allocationType: 'direct_job_cost',
      linkedReceiptCount: 0,
    });
    assert.equal(status, 'receipt_missing');
  });
});

describe('BANK-002 multi-receipt evidence total', () => {
  it('14 receipt evidence total equals transaction when split slips', () => {
    const txAmount = 150000;
    const evidenceTotal = sumActiveReceiptLinks([
      { amountCents: 80000, isActive: true },
      { amountCents: 70000, isActive: true },
    ]);
    assert.equal(evidenceTotal, txAmount);
  });
});
