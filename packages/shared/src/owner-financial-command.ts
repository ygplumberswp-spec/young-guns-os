/**
 * FIN-001 — Owner Financial Command Centre (shared types + pure composition).
 *
 * Read/UX layer over CASH-001, JPE cost-control, invoices/payments, BANK issues.
 * Does NOT invent a second financial calculation engine.
 */

import type { CashControlCompletenessReason, CashTruthCompleteness } from './cash-control.js';
import { canViewCashControl } from './cash-control.js';
import type { JobCostControlQueue } from './job-cost-control.js';
import type { FinanceMoneyTruth, FinanceTruthAvailability } from './finance-page-truth.js';

export type OwnerFinancialCommandPeriod = 'today' | 'week' | 'month';

export type OwnerFinancialAttentionPriority = 'critical' | 'high' | 'normal';

export type OwnerFinancialAttentionKind =
  | 'loss_job'
  | 'negative_margin'
  | 'unexplained_debit'
  | 'unexplained_credit'
  | 'completed_job_financially_incomplete'
  | 'overdue_customer_payment'
  | 'missing_job_cost'
  | 'partial_allocation'
  | 'missing_receipt'
  | 'unknown_supplier'
  | 'unpaid_job_cost'
  | 'review_stale'
  | 'low_margin_job'
  | 'missing_labour'
  | 'missing_material'
  | 'bank_exception';

export type OwnerFinancialDrillHref =
  | '/finance/cash-control'
  | '/finance/bank-control'
  | '/finance/job-cost-control'
  | '/finance/job-linkage-control'
  | '/finance/invoices'
  | '/finance/payments'
  | string;

export type OwnerFinancialHeartbeat = {
  period: OwnerFinancialCommandPeriod;
  fromDate: string;
  toDate: string;
  /** Invoice totals issued in period (economic sales), not bank credits. */
  invoicedRevenueCents: number;
  /** Recognised customer payments — CASH-001 authority. */
  customerCashCollectedCents: number;
  /**
   * Known economic gross profit from JPE snapshots (null when none available).
   * Never merged with cash profit.
   */
  knownGrossProfitCents: number | null;
  knownGrossMarginPct: number | null;
  /** Cash profit — CASH-001 / JPE cash authority. */
  knownRealisedCashProfitCents: number;
  outstandingCustomerCashCents: number;
};

export type OwnerFinancialCashView = {
  moneyInCents: number;
  moneyOutCents: number;
  directJobCashOutCents: number;
  overheadCashOutCents: number;
  knownNetCashMovementCents: number;
  unexplainedDebitCents: number;
  unexplainedCreditCents: number;
  completeness: CashTruthCompleteness;
  completenessReasons: CashControlCompletenessReason[];
};

export type OwnerFinancialReceivableRow = {
  invoiceId: string;
  invoiceNumber: string | null;
  customerName: string | null;
  jobId: string | null;
  balanceDueCents: number;
  dueDate: string | null;
  status: string;
  isOverdue: boolean;
  href: string;
};

export type OwnerFinancialReceivables = {
  totalOutstandingCents: number;
  overdueCount: number;
  overdueCents: number;
  dueSoonCount: number;
  unpaidOrPartialCount: number;
  largest: OwnerFinancialReceivableRow[];
};

export type OwnerFinancialProfitabilityJob = {
  jobId: string;
  jobReference: string | null;
  title: string;
  kind: 'profitable' | 'low_margin' | 'loss' | 'incomplete' | 'needs_review';
  href: string;
  flagSummary: string | null;
};

export type OwnerFinancialProfitability = {
  profitableJobsCount: number;
  lowMarginJobsCount: number;
  lossJobsCount: number;
  financiallyIncompleteCount: number;
  needingReviewCount: number;
  samples: OwnerFinancialProfitabilityJob[];
};

export type OwnerFinancialCostControl = {
  unpaidDirectCostsCount: number;
  unpaidDirectCostsCents: number;
  missingLabourCount: number;
  missingMaterialCount: number;
  missingReceiptsCount: number;
  missingReceiptsCents: number;
  partialAllocationsCount: number;
  partialAllocationsCents: number;
  unallocatedBankDebitsCount: number;
  unallocatedBankDebitsCents: number;
  unknownSuppliersCount: number;
  unknownSuppliersCents: number;
};

export type OwnerFinancialAttentionItem = {
  priority: OwnerFinancialAttentionPriority;
  kind: OwnerFinancialAttentionKind;
  label: string;
  amountCents: number | null;
  count: number | null;
  href: OwnerFinancialDrillHref;
  source: string;
  sourceId: string | null;
};

export type OwnerFinancialRecentImportant = {
  largestOutstandingInvoices: OwnerFinancialReceivableRow[];
  largestUnexplainedTransactions: Array<{
    id: string;
    label: string;
    amountCents: number;
    direction: 'debit' | 'credit';
    href: string;
  }>;
  worstMarginJobs: OwnerFinancialProfitabilityJob[];
};

/** Row 119 — honest availability for Receivables / Payables / Cashflow panels. */
export type OwnerFinancialPageTruth = {
  receivables: {
    availability: FinanceTruthAvailability;
    totalOutstanding: FinanceMoneyTruth;
    overdue: FinanceMoneyTruth;
  };
  payables: {
    availability: FinanceTruthAvailability;
    totalDue: FinanceMoneyTruth;
  };
  cashflow: {
    availability: FinanceTruthAvailability;
    moneyIn: FinanceMoneyTruth;
    moneyOut: FinanceMoneyTruth;
  };
};

export type OwnerFinancialCommandDashboard = {
  currency: string;
  asOfDate: string;
  period: OwnerFinancialCommandPeriod;
  financialTruth: {
    completeness: CashTruthCompleteness;
    reasons: string[];
  };
  /** Row 119 page truth — no false R0 when sources absent. */
  pageTruth: OwnerFinancialPageTruth;
  heartbeat: OwnerFinancialHeartbeat;
  cash: OwnerFinancialCashView;
  receivables: OwnerFinancialReceivables;
  profitability: OwnerFinancialProfitability;
  costControl: OwnerFinancialCostControl;
  attention: OwnerFinancialAttentionItem[];
  recentImportant: OwnerFinancialRecentImportant;
  drillDown: {
    cashControl: string;
    bankControl: string;
    jobCostControl: string;
    invoices: string;
    overdueInvoices: string;
    payments: string;
    payables?: string;
    cashflow?: string;
  };
  sourceTrace: string[];
};

export function canViewOwnerFinancialCommand(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  // Same gate family as CASH-001 / BANK — Technician & Client hard-denied.
  return canViewCashControl(identity);
}

export function ownerFinancialTodayDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function ownerFinancialMonthStartDate(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `${iso.slice(0, 7)}-01`;
}

/** ISO week start (Monday) in UTC date string. */
export function ownerFinancialWeekStartDate(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function resolveOwnerFinancialPeriodRange(
  period: OwnerFinancialCommandPeriod,
  now: Date = new Date(),
): { fromDate: string; toDate: string } {
  const toDate = ownerFinancialTodayDate(now);
  if (period === 'today') return { fromDate: toDate, toDate };
  if (period === 'week') return { fromDate: ownerFinancialWeekStartDate(now), toDate };
  return { fromDate: ownerFinancialMonthStartDate(now), toDate };
}

export function separateEconomicAndCashProfit(input: {
  knownGrossProfitCents: number | null;
  knownRealisedCashProfitCents: number;
}): {
  economicProfitCents: number | null;
  cashProfitCents: number;
  areSeparate: true;
} {
  return {
    economicProfitCents: input.knownGrossProfitCents,
    cashProfitCents: input.knownRealisedCashProfitCents,
    areSeparate: true,
  };
}

export function buildOwnerFinancialAttentionQueue(input: {
  cashIssues: {
    unexplainedDebits: { count: number; amountCents: number };
    unexplainedCredits: { count: number; amountCents: number };
    partialAllocations: { count: number; amountCents: number };
    missingReceipts: { count: number; amountCents: number };
    unknownSuppliers: { count: number; amountCents: number };
    unpaidJobCosts: { count: number; amountCents: number };
    outstandingCustomerInvoices: { count: number; amountCents: number };
  };
  costQueue: Pick<
    JobCostControlQueue,
    | 'summary'
    | 'marginProblems'
    | 'completedJobsNeedingReview'
    | 'missingLabour'
    | 'missingMaterialCost'
    | 'provisionalProfitability'
  >;
  overdueCents: number;
  overdueCount: number;
}): OwnerFinancialAttentionItem[] {
  const items: OwnerFinancialAttentionItem[] = [];

  if (input.costQueue.summary.lossJobs > 0) {
    items.push({
      priority: 'critical',
      kind: 'loss_job',
      label: 'Loss jobs need Owner attention',
      amountCents: null,
      count: input.costQueue.summary.lossJobs,
      href: '/finance/job-cost-control',
      source: 'job_cost_control',
      sourceId: null,
    });
  }

  const negativeMargin = input.costQueue.marginProblems.filter((row) =>
    row.flags.some((f) => f.type === 'NEGATIVE_MARGIN' || f.type === 'LOSS_JOB'),
  );
  if (negativeMargin.length > 0) {
    items.push({
      priority: 'critical',
      kind: 'negative_margin',
      label: 'Jobs with negative margin',
      amountCents: null,
      count: negativeMargin.length,
      href: '/finance/job-cost-control',
      source: 'job_cost_control',
      sourceId: null,
    });
  }

  if (input.cashIssues.unexplainedDebits.count > 0) {
    items.push({
      priority: input.cashIssues.unexplainedDebits.amountCents >= 500000 ? 'critical' : 'high',
      kind: 'unexplained_debit',
      label: 'Unexplained bank debits',
      amountCents: input.cashIssues.unexplainedDebits.amountCents,
      count: input.cashIssues.unexplainedDebits.count,
      href: '/finance/cash-control',
      source: 'cash_control',
      sourceId: null,
    });
  }

  if (input.cashIssues.unexplainedCredits.count > 0) {
    items.push({
      priority: 'high',
      kind: 'unexplained_credit',
      label: 'Unexplained bank credits',
      amountCents: input.cashIssues.unexplainedCredits.amountCents,
      count: input.cashIssues.unexplainedCredits.count,
      href: '/finance/cash-control',
      source: 'cash_control',
      sourceId: null,
    });
  }

  const incompleteCompleted = input.costQueue.completedJobsNeedingReview.filter(
    (row) =>
      row.completenessStatus === 'incomplete' ||
      row.completenessStatus === 'attention_required' ||
      row.flags.some((f) => f.type === 'COMPLETED_JOB_FINANCIALLY_INCOMPLETE'),
  );
  if (incompleteCompleted.length > 0 || input.costQueue.summary.completedJobsNeedingReview > 0) {
    items.push({
      priority: 'critical',
      kind: 'completed_job_financially_incomplete',
      label: 'Completed jobs financially incomplete',
      amountCents: null,
      count: Math.max(incompleteCompleted.length, input.costQueue.summary.completedJobsNeedingReview),
      href: '/finance/job-cost-control',
      source: 'job_cost_control',
      sourceId: null,
    });
  }

  if (input.overdueCount > 0) {
    items.push({
      priority: 'high',
      kind: 'overdue_customer_payment',
      label: 'Overdue customer invoices',
      amountCents: input.overdueCents,
      count: input.overdueCount,
      href: '/finance/invoices?overdueOnly=true',
      source: 'invoice',
      sourceId: null,
    });
  }

  if (input.costQueue.summary.missingCostEvidence > 0) {
    items.push({
      priority: 'high',
      kind: 'missing_job_cost',
      label: 'Jobs missing cost evidence',
      amountCents: null,
      count: input.costQueue.summary.missingCostEvidence,
      href: '/finance/job-cost-control',
      source: 'job_cost_control',
      sourceId: null,
    });
  }

  if (input.cashIssues.partialAllocations.count > 0) {
    items.push({
      priority: 'high',
      kind: 'partial_allocation',
      label: 'Partially allocated bank transactions',
      amountCents: input.cashIssues.partialAllocations.amountCents,
      count: input.cashIssues.partialAllocations.count,
      href: '/finance/bank-control',
      source: 'bank_control',
      sourceId: null,
    });
  }

  if (input.cashIssues.missingReceipts.count > 0) {
    items.push({
      priority: 'normal',
      kind: 'missing_receipt',
      label: 'Missing receipts / slips',
      amountCents: input.cashIssues.missingReceipts.amountCents,
      count: input.cashIssues.missingReceipts.count,
      href: '/finance/bank-control',
      source: 'receipt_control',
      sourceId: null,
    });
  }

  if (input.cashIssues.unknownSuppliers.count > 0) {
    items.push({
      priority: 'normal',
      kind: 'unknown_supplier',
      label: 'Unknown suppliers',
      amountCents: input.cashIssues.unknownSuppliers.amountCents,
      count: input.cashIssues.unknownSuppliers.count,
      href: '/finance/bank-control',
      source: 'receipt_control',
      sourceId: null,
    });
  }

  if (input.cashIssues.unpaidJobCosts.count > 0) {
    items.push({
      priority: 'high',
      kind: 'unpaid_job_cost',
      label: 'Unpaid direct job costs',
      amountCents: input.cashIssues.unpaidJobCosts.amountCents,
      count: input.cashIssues.unpaidJobCosts.count,
      href: '/finance/cash-control',
      source: 'direct_cost',
      sourceId: null,
    });
  }

  if (input.costQueue.summary.missingLabourJobs > 0) {
    items.push({
      priority: 'high',
      kind: 'missing_labour',
      label: 'Jobs missing labour capture',
      amountCents: null,
      count: input.costQueue.summary.missingLabourJobs,
      href: '/finance/job-cost-control',
      source: 'job_cost_control',
      sourceId: null,
    });
  }

  if (input.costQueue.missingMaterialCost.length > 0) {
    items.push({
      priority: 'high',
      kind: 'missing_material',
      label: 'Jobs missing material costs',
      amountCents: null,
      count: input.costQueue.missingMaterialCost.length,
      href: '/finance/job-cost-control',
      source: 'job_cost_control',
      sourceId: null,
    });
  }

  if (input.costQueue.summary.lowMarginJobs > 0) {
    items.push({
      priority: 'high',
      kind: 'low_margin_job',
      label: 'Low-margin jobs',
      amountCents: null,
      count: input.costQueue.summary.lowMarginJobs,
      href: '/finance/job-cost-control',
      source: 'job_cost_control',
      sourceId: null,
    });
  }

  const staleReviews = input.costQueue.completedJobsNeedingReview.filter((row) => row.isStale);
  if (staleReviews.length > 0) {
    items.push({
      priority: 'normal',
      kind: 'review_stale',
      label: 'Stale financial reviews',
      amountCents: null,
      count: staleReviews.length,
      href: '/finance/job-cost-control',
      source: 'job_cost_control',
      sourceId: null,
    });
  }

  const rank: Record<OwnerFinancialAttentionPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
  };
  return items.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

export function deriveOwnerFinancialTruthState(input: {
  cashCompleteness: CashTruthCompleteness;
  cashReasons: CashControlCompletenessReason[];
  incompleteJobsCount: number;
  unlinkedInvoiceCount?: number;
}): { completeness: CashTruthCompleteness; reasons: string[] } {
  const reasons: string[] = input.cashReasons.map((r) => r.replace(/_/g, ' '));
  if (input.incompleteJobsCount > 0) {
    reasons.push(`${input.incompleteJobsCount} jobs financially incomplete`);
  }
  if ((input.unlinkedInvoiceCount ?? 0) > 0) {
    reasons.push(`${input.unlinkedInvoiceCount} invoices not linked to jobs`);
  }

  let completeness: CashTruthCompleteness = input.cashCompleteness;
  if (input.incompleteJobsCount > 0 && completeness === 'VERIFIED') {
    completeness = 'PROVISIONAL';
  }
  if ((input.unlinkedInvoiceCount ?? 0) > 0 && completeness === 'VERIFIED') {
    completeness = 'PROVISIONAL';
  }

  return { completeness, reasons };
}

export function safeCents(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

export function emptyOwnerFinancialCommandDashboard(
  period: OwnerFinancialCommandPeriod,
  now: Date = new Date(),
): OwnerFinancialCommandDashboard {
  const range = resolveOwnerFinancialPeriodRange(period, now);
  const asOfDate = ownerFinancialTodayDate(now);
  return {
    currency: 'ZAR',
    asOfDate,
    period,
    financialTruth: { completeness: 'INCOMPLETE', reasons: ['incomplete bank coverage'] },
    pageTruth: {
      receivables: {
        availability: 'INCOMPLETE',
        totalOutstanding: {
          availability: 'INCOMPLETE',
          amountCents: null,
          reconciledToSources: false,
          sourceCount: 0,
          label: 'Receivables',
          reason: 'Dashboard not loaded',
        },
        overdue: {
          availability: 'INCOMPLETE',
          amountCents: null,
          reconciledToSources: false,
          sourceCount: 0,
          label: 'Overdue receivables',
          reason: 'Dashboard not loaded',
        },
      },
      payables: {
        availability: 'UNKNOWN',
        totalDue: {
          availability: 'UNKNOWN',
          amountCents: null,
          reconciledToSources: false,
          sourceCount: 0,
          label: 'Bills & Payables',
          reason: 'Payables not loaded',
        },
      },
      cashflow: {
        availability: 'INCOMPLETE',
        moneyIn: {
          availability: 'INCOMPLETE',
          amountCents: null,
          reconciledToSources: false,
          sourceCount: 0,
          label: 'Money in',
          reason: 'Cashflow not loaded',
        },
        moneyOut: {
          availability: 'INCOMPLETE',
          amountCents: null,
          reconciledToSources: false,
          sourceCount: 0,
          label: 'Money out',
          reason: 'Cashflow not loaded',
        },
      },
    },
    heartbeat: {
      period,
      fromDate: range.fromDate,
      toDate: range.toDate,
      invoicedRevenueCents: 0,
      customerCashCollectedCents: 0,
      knownGrossProfitCents: null,
      knownGrossMarginPct: null,
      knownRealisedCashProfitCents: 0,
      outstandingCustomerCashCents: 0,
    },
    cash: {
      moneyInCents: 0,
      moneyOutCents: 0,
      directJobCashOutCents: 0,
      overheadCashOutCents: 0,
      knownNetCashMovementCents: 0,
      unexplainedDebitCents: 0,
      unexplainedCreditCents: 0,
      completeness: 'INCOMPLETE',
      completenessReasons: ['incomplete_bank_coverage'],
    },
    receivables: {
      totalOutstandingCents: 0,
      overdueCount: 0,
      overdueCents: 0,
      dueSoonCount: 0,
      unpaidOrPartialCount: 0,
      largest: [],
    },
    profitability: {
      profitableJobsCount: 0,
      lowMarginJobsCount: 0,
      lossJobsCount: 0,
      financiallyIncompleteCount: 0,
      needingReviewCount: 0,
      samples: [],
    },
    costControl: {
      unpaidDirectCostsCount: 0,
      unpaidDirectCostsCents: 0,
      missingLabourCount: 0,
      missingMaterialCount: 0,
      missingReceiptsCount: 0,
      missingReceiptsCents: 0,
      partialAllocationsCount: 0,
      partialAllocationsCents: 0,
      unallocatedBankDebitsCount: 0,
      unallocatedBankDebitsCents: 0,
      unknownSuppliersCount: 0,
      unknownSuppliersCents: 0,
    },
    attention: [],
    recentImportant: {
      largestOutstandingInvoices: [],
      largestUnexplainedTransactions: [],
      worstMarginJobs: [],
    },
    drillDown: {
      cashControl: '/finance/cash-control',
      bankControl: '/finance/bank-control',
      jobCostControl: '/finance/job-cost-control',
      invoices: '/finance/invoices',
      overdueInvoices: '/finance/invoices?overdueOnly=true',
      payments: '/finance/payments',
      payables: '/finance/cash-control',
      cashflow: '/finance-cashflow-profit',
    },
    sourceTrace: [
      'cash_control',
      'job_cost_control',
      'invoice',
      'titan_payment',
      'jpe',
      'bank_transaction',
    ],
  };
}
