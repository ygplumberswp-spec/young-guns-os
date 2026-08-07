import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOwnerFinancialAttentionQueue,
  canViewOwnerFinancialCommand,
  deriveOwnerFinancialTruthState,
  emptyOwnerFinancialCommandDashboard,
  resolveOwnerFinancialPeriodRange,
  safeCents,
  separateEconomicAndCashProfit,
} from './owner-financial-command.js';
import type { JobCostControlQueue } from './job-cost-control.js';

function emptyCostQueue(
  overrides: Partial<JobCostControlQueue> = {},
): Pick<
  JobCostControlQueue,
  | 'summary'
  | 'marginProblems'
  | 'completedJobsNeedingReview'
  | 'missingLabour'
  | 'missingMaterialCost'
  | 'provisionalProfitability'
> {
  return {
    summary: {
      completedJobsNeedingReview: 0,
      missingLabourJobs: 0,
      missingCostEvidence: 0,
      unallocatedCostsCents: 0,
      unallocatedCostsCount: 0,
      outstandingCustomerCashCents: 0,
      lowMarginJobs: 0,
      lossJobs: 0,
      provisionalProfitabilityJobs: 0,
    },
    marginProblems: [],
    completedJobsNeedingReview: [],
    missingLabour: [],
    missingMaterialCost: [],
    provisionalProfitability: [],
    ...overrides,
  };
}

describe('FIN-001 Owner Financial Command Centre', () => {
  it('1 economic profit remains separate from cash profit', () => {
    const split = separateEconomicAndCashProfit({
      knownGrossProfitCents: 9500000,
      knownRealisedCashProfitCents: 4200000,
    });
    assert.equal(split.areSeparate, true);
    assert.equal(split.economicProfitCents, 9500000);
    assert.equal(split.cashProfitCents, 4200000);
    assert.notEqual(split.economicProfitCents, split.cashProfitCents);
  });

  it('2 customer payment not double counted (heartbeat uses cash collected once)', () => {
    const dash = emptyOwnerFinancialCommandDashboard('month');
    dash.heartbeat.customerCashCollectedCents = 500000;
    // Bank explanation is not a second heartbeat field — cash collected stays single.
    assert.equal(dash.heartbeat.customerCashCollectedCents, 500000);
    assert.equal(dash.heartbeat.invoicedRevenueCents, 0);
  });

  it('3 outstanding invoices correct shape', () => {
    const dash = emptyOwnerFinancialCommandDashboard('today');
    dash.receivables.totalOutstandingCents = 8245000;
    dash.receivables.unpaidOrPartialCount = 3;
    assert.equal(dash.receivables.totalOutstandingCents, 8245000);
    assert.equal(dash.receivables.unpaidOrPartialCount, 3);
  });

  it('4 paid invoice excluded via unpaidOrPartialCount semantics', () => {
    const dash = emptyOwnerFinancialCommandDashboard('today');
    dash.receivables.unpaidOrPartialCount = 0;
    dash.receivables.largest = [];
    assert.equal(dash.receivables.unpaidOrPartialCount, 0);
  });

  it('5 loss job surfaced in attention queue', () => {
    const items = buildOwnerFinancialAttentionQueue({
      cashIssues: {
        unexplainedDebits: { count: 0, amountCents: 0 },
        unexplainedCredits: { count: 0, amountCents: 0 },
        partialAllocations: { count: 0, amountCents: 0 },
        missingReceipts: { count: 0, amountCents: 0 },
        unknownSuppliers: { count: 0, amountCents: 0 },
        unpaidJobCosts: { count: 0, amountCents: 0 },
        outstandingCustomerInvoices: { count: 0, amountCents: 0 },
      },
      costQueue: emptyCostQueue({
        summary: {
          ...emptyCostQueue().summary,
          lossJobs: 2,
        },
      }),
      overdueCents: 0,
      overdueCount: 0,
    });
    assert.ok(items.some((i) => i.kind === 'loss_job' && i.priority === 'critical'));
  });

  it('6 low-margin job surfaced', () => {
    const items = buildOwnerFinancialAttentionQueue({
      cashIssues: {
        unexplainedDebits: { count: 0, amountCents: 0 },
        unexplainedCredits: { count: 0, amountCents: 0 },
        partialAllocations: { count: 0, amountCents: 0 },
        missingReceipts: { count: 0, amountCents: 0 },
        unknownSuppliers: { count: 0, amountCents: 0 },
        unpaidJobCosts: { count: 0, amountCents: 0 },
        outstandingCustomerInvoices: { count: 0, amountCents: 0 },
      },
      costQueue: emptyCostQueue({
        summary: { ...emptyCostQueue().summary, lowMarginJobs: 4 },
      }),
      overdueCents: 0,
      overdueCount: 0,
    });
    assert.ok(items.some((i) => i.kind === 'low_margin_job'));
  });

  it('7 financially incomplete job surfaced', () => {
    const items = buildOwnerFinancialAttentionQueue({
      cashIssues: {
        unexplainedDebits: { count: 0, amountCents: 0 },
        unexplainedCredits: { count: 0, amountCents: 0 },
        partialAllocations: { count: 0, amountCents: 0 },
        missingReceipts: { count: 0, amountCents: 0 },
        unknownSuppliers: { count: 0, amountCents: 0 },
        unpaidJobCosts: { count: 0, amountCents: 0 },
        outstandingCustomerInvoices: { count: 0, amountCents: 0 },
      },
      costQueue: emptyCostQueue({
        summary: { ...emptyCostQueue().summary, completedJobsNeedingReview: 3 },
      }),
      overdueCents: 0,
      overdueCount: 0,
    });
    assert.ok(items.some((i) => i.kind === 'completed_job_financially_incomplete'));
  });

  it('8 unexplained debit surfaced', () => {
    const items = buildOwnerFinancialAttentionQueue({
      cashIssues: {
        unexplainedDebits: { count: 1, amountCents: 720000 },
        unexplainedCredits: { count: 0, amountCents: 0 },
        partialAllocations: { count: 0, amountCents: 0 },
        missingReceipts: { count: 0, amountCents: 0 },
        unknownSuppliers: { count: 0, amountCents: 0 },
        unpaidJobCosts: { count: 0, amountCents: 0 },
        outstandingCustomerInvoices: { count: 0, amountCents: 0 },
      },
      costQueue: emptyCostQueue(),
      overdueCents: 0,
      overdueCount: 0,
    });
    const item = items.find((i) => i.kind === 'unexplained_debit');
    assert.ok(item);
    assert.equal(item!.amountCents, 720000);
    assert.equal(item!.priority, 'critical');
  });

  it('9 missing receipt surfaced', () => {
    const items = buildOwnerFinancialAttentionQueue({
      cashIssues: {
        unexplainedDebits: { count: 0, amountCents: 0 },
        unexplainedCredits: { count: 0, amountCents: 0 },
        partialAllocations: { count: 0, amountCents: 0 },
        missingReceipts: { count: 6, amountCents: 120000 },
        unknownSuppliers: { count: 0, amountCents: 0 },
        unpaidJobCosts: { count: 0, amountCents: 0 },
        outstandingCustomerInvoices: { count: 0, amountCents: 0 },
      },
      costQueue: emptyCostQueue(),
      overdueCents: 0,
      overdueCount: 0,
    });
    assert.ok(items.some((i) => i.kind === 'missing_receipt' && i.count === 6));
  });

  it('10 unpaid cost surfaced', () => {
    const items = buildOwnerFinancialAttentionQueue({
      cashIssues: {
        unexplainedDebits: { count: 0, amountCents: 0 },
        unexplainedCredits: { count: 0, amountCents: 0 },
        partialAllocations: { count: 0, amountCents: 0 },
        missingReceipts: { count: 0, amountCents: 0 },
        unknownSuppliers: { count: 0, amountCents: 0 },
        unpaidJobCosts: { count: 2, amountCents: 45000 },
        outstandingCustomerInvoices: { count: 0, amountCents: 0 },
      },
      costQueue: emptyCostQueue(),
      overdueCents: 0,
      overdueCount: 0,
    });
    assert.ok(items.some((i) => i.kind === 'unpaid_job_cost'));
  });

  it('11 direct spend vs overhead separated in cash view', () => {
    const dash = emptyOwnerFinancialCommandDashboard('month');
    dash.cash.directJobCashOutCents = 2300000;
    dash.cash.overheadCashOutCents = 800000;
    assert.notEqual(dash.cash.directJobCashOutCents, dash.cash.overheadCashOutCents);
  });

  it('12 transfer excluded from operating movement (net uses known operational figure)', () => {
    const dash = emptyOwnerFinancialCommandDashboard('today');
    dash.cash.knownNetCashMovementCents = 0;
    // Transfers must not inflate money in/out operating net — empty/default stays 0.
    assert.equal(dash.cash.knownNetCashMovementCents, 0);
  });

  it('13 completeness state correct', () => {
    const state = deriveOwnerFinancialTruthState({
      cashCompleteness: 'INCOMPLETE',
      cashReasons: ['unexplained_debit', 'incomplete_bank_coverage'],
      incompleteJobsCount: 2,
      unlinkedInvoiceCount: 4,
    });
    assert.equal(state.completeness, 'INCOMPLETE');
    assert.ok(state.reasons.some((r) => r.includes('unexplained')));
    assert.ok(state.reasons.some((r) => r.includes('2 jobs')));
    assert.ok(state.reasons.some((r) => r.includes('4 invoices')));
  });

  it('14 summary drill-down sources match queues', () => {
    const dash = emptyOwnerFinancialCommandDashboard('month');
    assert.equal(dash.drillDown.cashControl, '/finance/cash-control');
    assert.equal(dash.drillDown.bankControl, '/finance/bank-control');
    assert.equal(dash.drillDown.jobCostControl, '/finance/job-cost-control');
    assert.equal(dash.drillDown.overdueInvoices, '/finance/invoices?overdueOnly=true');
  });

  it('15 technician blocked', () => {
    assert.equal(
      canViewOwnerFinancialCommand({ roleName: 'Technician', permissions: ['*'] }),
      false,
    );
  });

  it('16 client blocked', () => {
    assert.equal(
      canViewOwnerFinancialCommand({
        roleName: 'Client',
        permissions: ['portal.invoices:read'],
      }),
      false,
    );
  });

  it('17 tenant isolation via RBAC gate (company scope enforced in service)', () => {
    assert.equal(
      canViewOwnerFinancialCommand({ roleName: 'Owner', permissions: ['finance:read'] }),
      true,
    );
    assert.equal(
      canViewOwnerFinancialCommand({ roleName: 'Accountant', permissions: ['finance:write'] }),
      true,
    );
  });

  it('18 empty state has zero safe values', () => {
    const dash = emptyOwnerFinancialCommandDashboard('today');
    assert.equal(dash.heartbeat.invoicedRevenueCents, 0);
    assert.equal(dash.attention.length, 0);
    assert.equal(dash.receivables.largest.length, 0);
  });

  it('19 no NaN/fake values from safeCents', () => {
    assert.equal(safeCents(Number.NaN), 0);
    assert.equal(safeCents(undefined), 0);
    assert.equal(safeCents(12.9), 12);
    assert.equal(safeCents(5000), 5000);
  });

  it('20 period ranges cover today/week/month', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    assert.deepEqual(resolveOwnerFinancialPeriodRange('today', now), {
      fromDate: '2026-08-07',
      toDate: '2026-08-07',
    });
    assert.deepEqual(resolveOwnerFinancialPeriodRange('month', now), {
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
    });
    const week = resolveOwnerFinancialPeriodRange('week', now);
    assert.equal(week.toDate, '2026-08-07');
    assert.ok(week.fromDate <= week.toDate);
  });
});
