import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CashControlBankTransactionInput } from './cash-control.js';
import {
  allocationTypeContributesToOverhead,
  buildOperatingProfitIssues,
  buildOperatingProfitSummary,
  buildOverheadCategories,
  computeKnownOperatingCashMovementCents,
  computeKnownOperatingProfitCents,
  deriveOperatingProfitCompleteness,
  extractOverheadAllocations,
  resolveOperatingProfitPeriodRange,
  resolveOverheadAuthorityOnce,
  resolveOverheadWithoutReceiptDoubleCount,
  resolveWageOverheadWithoutJobLabourDoubleCount,
  sumDirectJobCostAllocationCents,
  sumOverheadAllocationCents,
  canViewOperatingProfit,
} from './operating-profit.js';

function tx(
  partial: Partial<CashControlBankTransactionInput> & {
    id: string;
    allocations: CashControlBankTransactionInput['allocations'];
  },
): CashControlBankTransactionInput {
  return {
    transactionDate: partial.transactionDate ?? '2026-08-05',
    direction: partial.direction ?? 'debit',
    amountCents: partial.amountCents ?? -10000,
    currency: 'ZAR',
    description: partial.description ?? 'Expense',
    reference: null,
    allocationStatus: partial.allocationStatus ?? 'allocated',
    receiptStatus: partial.receiptStatus ?? 'receipt_attached',
    allocatedAmountCents: partial.allocatedAmountCents ?? 10000,
    merchantName: partial.merchantName ?? 'Merchant',
    confirmedSupplierId: null,
    confirmedSupplierName: null,
    suggestedSupplierId: null,
    provider: 'manual',
    ...partial,
  };
}

describe('FIN-003 operating profit', () => {
  it('1 direct job cost not counted as overhead', () => {
    const transactions = [
      tx({
        id: 't1',
        amountCents: -200000,
        allocatedAmountCents: 200000,
        allocations: [
          {
            id: 'a1',
            transactionId: 't1',
            amountCents: 200000,
            allocationType: 'direct_job_cost',
            category: 'job_material',
            jobId: 'JOB-001',
            isActive: true,
          },
        ],
      }),
    ];
    const overhead = extractOverheadAllocations(transactions, '2026-08-01', '2026-08-07');
    assert.equal(sumOverheadAllocationCents(overhead), 0);
    assert.equal(sumDirectJobCostAllocationCents(transactions, '2026-08-01', '2026-08-07'), 200000);
    assert.equal(allocationTypeContributesToOverhead('direct_job_cost'), false);
  });

  it('2 overhead counted once', () => {
    const transactions = [
      tx({
        id: 't2',
        amountCents: -200000,
        allocatedAmountCents: 200000,
        allocations: [
          {
            id: 'a2',
            transactionId: 't2',
            amountCents: 200000,
            allocationType: 'overhead',
            category: 'software',
            isActive: true,
          },
        ],
      }),
    ];
    const overhead = extractOverheadAllocations(transactions, '2026-08-01', '2026-08-07');
    assert.equal(sumOverheadAllocationCents(overhead), 200000);
    assert.equal(overhead.length, 1);
  });

  it('3 receipt does not duplicate overhead', () => {
    const resolved = resolveOverheadWithoutReceiptDoubleCount({
      overheadAllocationCents: 50000,
      receiptAmountCents: 50000,
    });
    assert.equal(resolved.knownOverheadCents, 50000);
    assert.equal(resolved.receiptIsEvidenceOnly, true);
  });

  it('4 bank representation does not duplicate economic expense via Xero', () => {
    const resolved = resolveOverheadAuthorityOnce({
      bankOverheadAllocationCents: 68000,
      xeroBillExpenseCents: 68000,
      xeroBankMirrorCents: 68000,
    });
    assert.equal(resolved.knownOverheadCents, 68000);
    assert.equal(resolved.xeroIgnoredCents, 136000);
    assert.equal(resolved.authority, 'bank_overhead_allocation');
  });

  it('5/6/7 GP uses provided JPE truth; company GP aggregates; OP = GP - overhead', () => {
    const summary = buildOperatingProfitSummary({
      period: 'month',
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      economicRevenueCents: 1_000_000,
      directEconomicCostCents: 400_000,
      companyGrossProfitCents: 600_000,
      knownOverheadCents: 100_000,
      customerCashCollectedCents: 800_000,
      directCashOutCents: 300_000,
      overheadCashOutCents: 100_000,
      excludedTransferOutCents: 50_000,
      excludedNonOperatingOutCents: 20_000,
      unexplainedDebitCents: 0,
      jobsIncluded: 5,
      incompleteJobs: 0,
      unallocatedDebitCount: 0,
      missingReceiptCount: 0,
      unresolvedOverheadCategoryCents: 0,
      hasBankAccounts: true,
    });
    assert.equal(summary.companyGrossProfitCents, 600_000);
    assert.equal(summary.knownOperatingProfitCents, 500_000);
    assert.equal(computeKnownOperatingProfitCents(600_000, 100_000), 500_000);
  });

  it('8 operating margin correct', () => {
    const summary = buildOperatingProfitSummary({
      period: 'month',
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      economicRevenueCents: 1_000_000,
      directEconomicCostCents: 400_000,
      companyGrossProfitCents: 600_000,
      knownOverheadCents: 100_000,
      customerCashCollectedCents: 0,
      directCashOutCents: 0,
      overheadCashOutCents: 0,
      excludedTransferOutCents: 0,
      excludedNonOperatingOutCents: 0,
      unexplainedDebitCents: 0,
      jobsIncluded: 1,
      incompleteJobs: 0,
      unallocatedDebitCount: 0,
      missingReceiptCount: 0,
      unresolvedOverheadCategoryCents: 0,
      hasBankAccounts: true,
    });
    assert.equal(summary.operatingMarginPct, 50);
    assert.equal(summary.grossMarginPct, 60);
  });

  it('9 cash view kept separate from economic operating profit', () => {
    const summary = buildOperatingProfitSummary({
      period: 'month',
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      economicRevenueCents: 1_000_000,
      directEconomicCostCents: 400_000,
      companyGrossProfitCents: 600_000,
      knownOverheadCents: 100_000,
      customerCashCollectedCents: 700_000,
      directCashOutCents: 250_000,
      overheadCashOutCents: 100_000,
      excludedTransferOutCents: 0,
      excludedNonOperatingOutCents: 0,
      unexplainedDebitCents: 0,
      jobsIncluded: 2,
      incompleteJobs: 0,
      unallocatedDebitCount: 0,
      missingReceiptCount: 0,
      unresolvedOverheadCategoryCents: 0,
      hasBankAccounts: true,
    });
    assert.equal(summary.knownOperatingProfitCents, 500_000);
    assert.equal(summary.knownOperatingCashMovementCents, 350_000);
    assert.notEqual(summary.knownOperatingProfitCents, summary.knownOperatingCashMovementCents);
    assert.equal(
      computeKnownOperatingCashMovementCents({
        customerCashCollectedCents: 700_000,
        directCashOutCents: 250_000,
        overheadCashOutCents: 100_000,
      }),
      350_000,
    );
  });

  it('10 transfer excluded from overhead and operating cash', () => {
    const transactions = [
      tx({
        id: 'tr',
        amountCents: -90000,
        allocatedAmountCents: 90000,
        allocations: [
          {
            id: 'atr',
            transactionId: 'tr',
            amountCents: 90000,
            allocationType: 'transfer',
            category: 'transfer',
            isActive: true,
          },
        ],
      }),
    ];
    const overhead = extractOverheadAllocations(transactions, '2026-08-01', '2026-08-07');
    assert.equal(sumOverheadAllocationCents(overhead), 0);
    assert.equal(allocationTypeContributesToOverhead('transfer'), false);
  });

  it('11 tax/non-operating classification not overhead', () => {
    assert.equal(allocationTypeContributesToOverhead('tax'), false);
    assert.equal(allocationTypeContributesToOverhead('owner_director'), false);
    const transactions = [
      tx({
        id: 'tax1',
        amountCents: -15000,
        allocatedAmountCents: 15000,
        allocations: [
          {
            id: 'atax',
            transactionId: 'tax1',
            amountCents: 15000,
            allocationType: 'tax',
            category: 'tax',
            isActive: true,
          },
        ],
      }),
    ];
    assert.equal(
      sumOverheadAllocationCents(extractOverheadAllocations(transactions, '2026-08-01', '2026-08-07')),
      0,
    );
  });

  it('12 job labour not double-counted as wage overhead', () => {
    const resolved = resolveWageOverheadWithoutJobLabourDoubleCount({
      jpeLabourCostCents: 120_000,
      bankWagesOverheadCents: 40_000,
    });
    assert.equal(resolved.wageOverheadCents, 40_000);
    assert.equal(resolved.jpeLabourRemainsInGrossProfit, true);
    assert.equal(resolved.fabricatedPayrollCents, 0);
    // OP subtracts only bank wages OH, not JPE labour again
    assert.equal(computeKnownOperatingProfitCents(500_000, resolved.wageOverheadCents), 460_000);
  });

  it('13 incomplete payroll source reflected in completeness', () => {
    const c = deriveOperatingProfitCompleteness({
      unexplainedDebitCents: 0,
      unallocatedDebitCount: 0,
      missingReceiptCount: 0,
      incompleteJobs: 0,
      jobsIncluded: 3,
      unresolvedOverheadCategoryCents: 0,
      hasBankAccounts: true,
    });
    assert.ok(c.reasons.includes('incomplete_payroll_source'));
    assert.equal(c.completeness, 'PROVISIONAL');
  });

  it('14 overhead category aggregation correct', () => {
    const lines = extractOverheadAllocations(
      [
        tx({
          id: 'm1',
          amountCents: -30000,
          allocatedAmountCents: 30000,
          allocations: [
            {
              id: 'am1',
              transactionId: 'm1',
              amountCents: 30000,
              allocationType: 'overhead',
              category: 'marketing',
              isActive: true,
            },
          ],
        }),
        tx({
          id: 'm2',
          amountCents: -20000,
          allocatedAmountCents: 20000,
          allocations: [
            {
              id: 'am2',
              transactionId: 'm2',
              amountCents: 20000,
              allocationType: 'overhead',
              category: 'marketing',
              isActive: true,
            },
          ],
        }),
        tx({
          id: 's1',
          amountCents: -50000,
          allocatedAmountCents: 50000,
          allocations: [
            {
              id: 'as1',
              transactionId: 's1',
              amountCents: 50000,
              allocationType: 'overhead',
              category: 'software',
              isActive: true,
            },
          ],
        }),
      ],
      '2026-08-01',
      '2026-08-07',
    );
    const cats = buildOverheadCategories(lines);
    assert.equal(cats.length, 2);
    const marketing = cats.find((c) => c.category === 'marketing');
    assert.equal(marketing?.amountCents, 50000);
    assert.equal(marketing?.percentOfKnownOverhead, 50);
    assert.equal(marketing?.allocationCount, 2);
  });

  it('15 unknown/unallocated debit surfaced', () => {
    const issues = buildOperatingProfitIssues({
      unexplainedDebitCents: 12000,
      unallocatedDebitCount: 2,
      missingReceiptCount: 1,
      unresolvedOverheadCategoryCents: 5000,
      unresolvedOverheadCount: 1,
    });
    assert.ok(issues.some((i) => i.kind === 'unallocated_debit'));
    assert.ok(issues.some((i) => i.kind === 'unclassified_overhead'));
    assert.ok(issues.some((i) => i.kind === 'missing_evidence'));
    assert.ok(issues.some((i) => i.kind === 'incomplete_payroll_source'));
  });

  it('16 date range correct', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    const month = resolveOperatingProfitPeriodRange('month', now);
    assert.equal(month.fromDate, '2026-08-01');
    assert.equal(month.toDate, '2026-08-07');
    const last = resolveOperatingProfitPeriodRange('last_month', now);
    assert.equal(last.fromDate, '2026-07-01');
    assert.equal(last.toDate, '2026-07-31');
    const today = resolveOperatingProfitPeriodRange('today', now);
    assert.deepEqual(today, { fromDate: '2026-08-07', toDate: '2026-08-07' });
  });

  it('17/18/19 tenant gate + technician/client blocked', () => {
    assert.equal(canViewOperatingProfit({ roleName: 'Technician', permissions: ['*'] }), false);
    assert.equal(canViewOperatingProfit({ roleName: 'Client', permissions: ['finance:read'] }), false);
    assert.equal(canViewOperatingProfit({ roleName: 'Owner', permissions: ['finance:read'] }), true);
  });

  it('20 empty state', () => {
    const summary = buildOperatingProfitSummary({
      period: 'month',
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
      economicRevenueCents: 0,
      directEconomicCostCents: 0,
      companyGrossProfitCents: 0,
      knownOverheadCents: 0,
      customerCashCollectedCents: 0,
      directCashOutCents: 0,
      overheadCashOutCents: 0,
      excludedTransferOutCents: 0,
      excludedNonOperatingOutCents: 0,
      unexplainedDebitCents: 0,
      jobsIncluded: 0,
      incompleteJobs: 0,
      unallocatedDebitCount: 0,
      missingReceiptCount: 0,
      unresolvedOverheadCategoryCents: 0,
      hasBankAccounts: true,
    });
    assert.equal(summary.knownOperatingProfitCents, 0);
    assert.equal(summary.knownOperatingCashMovementCents, 0);
    assert.ok(summary.completenessReasons.includes('no_jobs_in_period'));
  });

  it('21/22 no NaN and cent precision', () => {
    const op = computeKnownOperatingProfitCents(Number.NaN as unknown as number, 100);
    assert.equal(Number.isNaN(op), false);
    assert.equal(computeKnownOperatingProfitCents(12345, 678), 11667);
  });

  it('23 drill-down category totals match headline overhead', () => {
    const lines = extractOverheadAllocations(
      [
        tx({
          id: 'o1',
          amountCents: -68420,
          allocatedAmountCents: 68420,
          allocations: [
            {
              id: 'ao1',
              transactionId: 'o1',
              amountCents: 40000,
              allocationType: 'overhead',
              category: 'rent',
              isActive: true,
            },
            {
              id: 'ao2',
              transactionId: 'o1',
              amountCents: 28420,
              allocationType: 'overhead',
              category: 'software',
              isActive: true,
            },
          ],
        }),
      ],
      '2026-08-01',
      '2026-08-07',
    );
    const headline = sumOverheadAllocationCents(lines);
    const cats = buildOverheadCategories(lines);
    const drillSum = cats.reduce((s, c) => s + c.amountCents, 0);
    assert.equal(headline, 68420);
    assert.equal(drillSum, headline);
  });

  it('mixed direct+overhead on same tx: only overhead portion counts', () => {
    const transactions = [
      tx({
        id: 'mix',
        amountCents: -100000,
        allocatedAmountCents: 100000,
        allocations: [
          {
            id: 'd',
            transactionId: 'mix',
            amountCents: 60000,
            allocationType: 'direct_job_cost',
            category: 'fuel',
            jobId: 'j1',
            isActive: true,
          },
          {
            id: 'o',
            transactionId: 'mix',
            amountCents: 40000,
            allocationType: 'overhead',
            category: 'fuel',
            isActive: true,
          },
        ],
      }),
    ];
    assert.equal(
      sumOverheadAllocationCents(extractOverheadAllocations(transactions, '2026-08-01', '2026-08-07')),
      40000,
    );
    assert.equal(sumDirectJobCostAllocationCents(transactions, '2026-08-01', '2026-08-07'), 60000);
  });
});
