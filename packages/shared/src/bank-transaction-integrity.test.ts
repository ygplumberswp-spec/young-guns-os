import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  buildBankTransactionFingerprintCanonical,
  computeDirectCostSettlementAfterAllocation,
  deriveDirectCostSettlementStatus,
  resolveDirectCostCashPaidCents,
} from './bank-transaction-control.js';
import { computeJobProfitability } from './job-profitability.js';
import {
  computeJobFinancialSourceFingerprintFromSources,
} from './job-financial-fingerprint-hash.js';
import { isFinancialReviewStale } from './job-cost-control.js';

function hashCanonical(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

describe('BANK-001A account-scoped dedupe', () => {
  it('1 same account identical transaction produces identical fingerprint', () => {
    const input = {
      companyId: 'co-1',
      bankAccountId: 'acct-a',
      provider: 'manual_import',
      transactionDate: '2026-08-07',
      amountCents: 100000,
      direction: 'debit' as const,
      reference: 'TRANSFER',
      description: 'TRANSFER',
    };
    const a = hashCanonical(buildBankTransactionFingerprintCanonical(input));
    const b = hashCanonical(buildBankTransactionFingerprintCanonical({ ...input }));
    assert.equal(a, b);
  });

  it('2 different accounts identical transaction produce distinct fingerprints', () => {
    const base = {
      companyId: 'co-1',
      provider: 'manual_import',
      transactionDate: '2026-08-07',
      amountCents: 100000,
      direction: 'debit' as const,
      reference: 'TRANSFER',
      description: 'TRANSFER',
    };
    const acctA = hashCanonical(
      buildBankTransactionFingerprintCanonical({ ...base, bankAccountId: 'acct-a' }),
    );
    const acctB = hashCanonical(
      buildBankTransactionFingerprintCanonical({ ...base, bankAccountId: 'acct-b' }),
    );
    assert.notEqual(acctA, acctB);
  });

  it('3 same account different reference remains distinct', () => {
    const base = {
      companyId: 'co-1',
      bankAccountId: 'acct-a',
      provider: 'manual_import',
      transactionDate: '2026-08-07',
      amountCents: 100000,
      direction: 'debit' as const,
      description: 'PAYMENT',
    };
    const a = hashCanonical(
      buildBankTransactionFingerprintCanonical({ ...base, reference: 'REF-A' }),
    );
    const b = hashCanonical(
      buildBankTransactionFingerprintCanonical({ ...base, reference: 'REF-B' }),
    );
    assert.notEqual(a, b);
  });

  it('13 internal transfer sides on different accounts remain distinct', () => {
    const debit = hashCanonical(
      buildBankTransactionFingerprintCanonical({
        companyId: 'co-1',
        bankAccountId: 'acct-a',
        provider: 'manual_import',
        transactionDate: '2026-08-07',
        amountCents: 1_000_000,
        direction: 'debit',
        reference: 'TRANSFER',
        description: 'TO ACCT B',
      }),
    );
    const credit = hashCanonical(
      buildBankTransactionFingerprintCanonical({
        companyId: 'co-1',
        bankAccountId: 'acct-b',
        provider: 'manual_import',
        transactionDate: '2026-08-07',
        amountCents: 1_000_000,
        direction: 'credit',
        reference: 'TRANSFER',
        description: 'FROM ACCT A',
      }),
    );
    assert.notEqual(debit, credit);
  });

  it('external provider id scoped to bank account', () => {
    const a = buildBankTransactionFingerprintCanonical({
      companyId: 'co-1',
      bankAccountId: 'acct-a',
      provider: 'fnb_feed',
      externalTransactionId: 'tx-123',
      transactionDate: '2026-08-07',
      amountCents: 100,
      direction: 'debit',
    });
    const b = buildBankTransactionFingerprintCanonical({
      companyId: 'co-1',
      bankAccountId: 'acct-b',
      provider: 'fnb_feed',
      externalTransactionId: 'tx-123',
      transactionDate: '2026-08-07',
      amountCents: 100,
      direction: 'debit',
    });
    assert.notEqual(a, b);
    assert.match(a, /acct-a/);
    assert.match(b, /acct-b/);
  });
});

describe('BANK-001A partial payment semantics', () => {
  it('6 R500 against R1000 cost → cashSpent R500 economic R1000', () => {
    const result = computeJobProfitability({
      jobId: 'job-1',
      currency: 'ZAR',
      jobStatus: 'completed',
      labourRateCentsPerHour: 8000,
      thresholds: { excellentMarginBps: 3500, healthyMarginBps: 2500, warningMarginBps: 1500 },
      materialLines: [],
      purchaseOrders: [],
      invoices: [],
      payments: [],
      quotes: [],
      labourEntries: [],
      adjustments: [],
      directCosts: [
        {
          id: 'dc-1',
          category: 'miscellaneous',
          description: 'Expense',
          amountCents: 100000,
          amountPaidCents: 50000,
          sourceType: 'manual',
          sourceId: 'm-1',
          costDate: '2026-08-07T00:00:00.000Z',
          enteredByUserId: 'u-1',
          isPaid: false,
          notes: null,
        },
      ],
      includeSensitiveCosts: true,
    });
    assert.equal(result.summary.otherDirectCostCents, 100000);
    assert.equal(result.cash.cashSpentCents, 50000);
    assert.equal(deriveDirectCostSettlementStatus({ amountCents: 100000, amountPaidCents: 50000, isPaid: false }), 'partially_paid');
  });

  it('7 second R500 → cashSpent R1000 economic remains R1000', () => {
    const settlement = computeDirectCostSettlementAfterAllocation({
      amountCents: 100000,
      currentAmountPaidCents: 50000,
      allocationAmountCents: 50000,
    });
    assert.equal(settlement.amountPaidCents, 100000);
    assert.equal(settlement.isPaid, true);
    assert.equal(resolveDirectCostCashPaidCents({ amountCents: 100000, amountPaidCents: 100000, isPaid: true }), 100000);
  });

  it('9 partial payment does not mark full-paid incorrectly', () => {
    const partial = computeDirectCostSettlementAfterAllocation({
      amountCents: 100000,
      currentAmountPaidCents: 0,
      allocationAmountCents: 50000,
    });
    assert.equal(partial.isPaid, false);
    assert.equal(partial.amountPaidCents, 50000);
  });
});

describe('BANK-001A JPE review fingerprint on partial bank cash', () => {
  it('16 partial bank payment allocation changes fingerprint and marks review stale', () => {
    const base = {
      jobId: 'job-1',
      invoices: [],
      quotes: [],
      adjustments: [],
      materialLines: [],
      purchaseOrders: [],
      labourEntries: [],
      payments: [],
      directCosts: [
        {
          id: 'dc-1',
          category: 'miscellaneous',
          amountCents: 100000,
          sourceType: 'manual',
          sourceId: 'm-1',
          isPaid: false,
          receiptDocumentId: null,
        },
      ],
    };
    const fpA = computeJobFinancialSourceFingerprintFromSources(base);
    const fpB = computeJobFinancialSourceFingerprintFromSources({
      ...base,
      directCosts: [
        {
          id: 'dc-1',
          category: 'miscellaneous',
          amountCents: 100000,
          amountPaidCents: 50000,
          sourceType: 'manual',
          sourceId: 'm-1',
          isPaid: false,
          receiptDocumentId: null,
        },
      ],
    });
    assert.notEqual(fpA, fpB);
    assert.equal(isFinancialReviewStale(fpA, fpA, 'financially_complete'), false);
    assert.equal(isFinancialReviewStale(fpA, fpB, 'financially_complete'), true);
  });
});
