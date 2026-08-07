/**
 * BANK-001 — API/service tests for bank transaction allocation + JPE cash semantics.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeJobProfitability } from '@titan/shared';
import {
  assertAllocationWithinTransaction,
  canManageBankTransactionControl,
  canViewBankTransactionControl,
  computeAllocationTotals,
} from '@titan/shared';

const DEFAULT_THRESHOLDS = {
  excellentMarginBps: 3500,
  healthyMarginBps: 2500,
  warningMarginBps: 1500,
};

function baseInput(
  overrides: Partial<Parameters<typeof computeJobProfitability>[0]> = {},
): Parameters<typeof computeJobProfitability>[0] {
  return {
    jobId: 'job-1',
    currency: 'ZAR',
    jobStatus: 'completed',
    labourRateCentsPerHour: 8000,
    thresholds: DEFAULT_THRESHOLDS,
    materialLines: [],
    purchaseOrders: [],
    invoices: [],
    payments: [],
    quotes: [],
    labourEntries: [],
    directCosts: [],
    adjustments: [],
    includeSensitiveCosts: true,
    ...overrides,
  };
}

describe('BANK-001 allocation + JPE integration semantics', () => {
  it('9 cashSpent updates once when existing expense matched to bank debit', () => {
    const result = computeJobProfitability(
      baseInput({
        directCosts: [
          {
            id: 'dc-1',
            category: 'miscellaneous',
            description: 'Expense',
            amountCents: 100000,
            sourceType: 'manual',
            sourceId: 'manual-1',
            costDate: '2026-02-01T00:00:00.000Z',
            enteredByUserId: 'user-1',
            isPaid: true,
            notes: null,
          },
        ],
      }),
    );

    assert.equal(result.summary.otherDirectCostCents, 100000);
    assert.equal(result.cash.cashSpentCents, 100000);
    assert.notEqual(result.summary.otherDirectCostCents, 200000);
  });

  it('10 economic cost unpaid + bank match simulation — only paid costs in cashSpent', () => {
    const before = computeJobProfitability(
      baseInput({
        directCosts: [
          {
            id: 'dc-1',
            category: 'miscellaneous',
            description: 'Expense',
            amountCents: 100000,
            sourceType: 'manual',
            sourceId: 'manual-1',
            costDate: '2026-02-01T00:00:00.000Z',
            enteredByUserId: 'user-1',
            isPaid: false,
            notes: null,
          },
        ],
      }),
    );
    assert.equal(before.summary.otherDirectCostCents, 100000);
    assert.equal(before.cash.cashSpentCents, 0);

    const after = computeJobProfitability(
      baseInput({
        directCosts: [
          {
            id: 'dc-1',
            category: 'miscellaneous',
            description: 'Expense',
            amountCents: 100000,
            sourceType: 'manual',
            sourceId: 'manual-1',
            costDate: '2026-02-01T00:00:00.000Z',
            enteredByUserId: 'user-1',
            isPaid: true,
            notes: null,
          },
        ],
      }),
    );
    assert.equal(after.summary.otherDirectCostCents, 100000);
    assert.equal(after.cash.cashSpentCents, 100000);
  });

  it('5 over-allocation rejected at service boundary', () => {
    assert.throws(
      () => assertAllocationWithinTransaction(500000, [{ amountCents: 600000 }]),
      /exceeds transaction amount/,
    );
  });

  it('4 partial allocation exposes remaining cents', () => {
    const totals = computeAllocationTotals(500000, [{ amountCents: 300000 }]);
    assert.equal(totals.unallocatedAmountCents, 200000);
  });
});

describe('BANK-001 RBAC (shared helpers)', () => {
  it('18 technician blocked from bank control', () => {
    const tech = { roleName: 'Technician', permissions: [] as string[] };
    assert.equal(canViewBankTransactionControl(tech), false);
    assert.equal(canManageBankTransactionControl(tech), false);
  });

  it('owner finance access permitted', () => {
    const owner = { roleName: 'Company Owner', permissions: ['*'] };
    assert.equal(canManageBankTransactionControl(owner), true);
  });
});
