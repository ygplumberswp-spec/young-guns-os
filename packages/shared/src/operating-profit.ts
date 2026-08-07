/**
 * FIN-003 — Overhead & True Operating Profit (shared types + pure composition).
 *
 * Layers (kept separate):
 *   Job economic GP (JPE) → Company GP (sum) − known business overhead → known operating profit
 *   Cash: collected − direct cash out − overhead cash out → known operating cash movement
 *
 * Overhead authority: BANK allocations with allocationType === 'overhead' (via CASH-001).
 * Direct job costs never enter overhead. Transfers / tax / owner draws excluded.
 * No second ledger. No budgets/forecasts (FIN-004).
 */

import type {
  BankTransactionAllocationType,
  BankTransactionReceiptStatus,
} from './bank-transaction-control.js';
import { canViewCashControl } from './cash-control.js';
import type { CashControlBankTransactionInput } from './cash-control.js';
import {
  ownerFinancialMonthStartDate,
  ownerFinancialTodayDate,
  ownerFinancialWeekStartDate,
} from './owner-financial-command.js';
import { marginPct, safeAnalyticsCents } from './profit-analytics.js';

export type OperatingProfitPeriod = 'today' | 'week' | 'month' | 'last_month' | 'custom';

export type OperatingProfitDataQuality = 'VERIFIED' | 'PROVISIONAL' | 'INCOMPLETE';

export type OperatingProfitCompletenessReason =
  | 'incomplete_bank_coverage'
  | 'unexplained_debit'
  | 'unallocated_debit'
  | 'overhead_category_unresolved'
  | 'missing_receipt_evidence'
  | 'incomplete_payroll_source'
  | 'jpe_coverage_incomplete'
  | 'duplicated_source_risk_avoided'
  | 'no_jobs_in_period';

export type OperatingProfitIssueKind =
  | 'unclassified_overhead'
  | 'unallocated_debit'
  | 'missing_evidence'
  | 'incomplete_payroll_source'
  | 'unexplained_debit';

export type OperatingProfitOverheadLine = {
  allocationId: string;
  transactionId: string;
  transactionDate: string;
  amountCents: number;
  category: string;
  description: string | null;
  merchantName: string | null;
  receiptStatus: BankTransactionReceiptStatus | string;
  href: string;
};

export type OperatingProfitOverheadCategory = {
  category: string;
  amountCents: number;
  percentOfKnownOverhead: number | null;
  transactionCount: number;
  allocationCount: number;
  missingReceiptCount: number;
  dataQuality: OperatingProfitDataQuality;
  href: string;
  lines: OperatingProfitOverheadLine[];
};

export type OperatingProfitIssue = {
  kind: OperatingProfitIssueKind;
  label: string;
  amountCents: number | null;
  count: number;
  href: string;
};

export type OperatingProfitSummary = {
  period: OperatingProfitPeriod;
  fromDate: string;
  toDate: string;
  currency: string;
  /** Economic view — JPE authority for job layer. */
  economicRevenueCents: number;
  directEconomicCostCents: number;
  companyGrossProfitCents: number;
  grossMarginPct: number | null;
  knownOverheadCents: number;
  knownOperatingProfitCents: number;
  operatingMarginPct: number | null;
  /** Cash view — never labelled bare "profit". */
  customerCashCollectedCents: number;
  directCashOutCents: number;
  overheadCashOutCents: number;
  knownOperatingCashMovementCents: number;
  /** Explicit exclusions (not in operating totals). */
  excludedTransferOutCents: number;
  excludedNonOperatingOutCents: number;
  unexplainedDebitCents: number;
  completeness: OperatingProfitDataQuality;
  completenessReasons: OperatingProfitCompletenessReason[];
  qualityNote: string;
  jobsIncluded: number;
  incompleteJobs: number;
  sourceTrace: string[];
  drillDown: {
    cashControl: string;
    bankControl: string;
    profitAnalytics: string;
    jobCostControl: string;
  };
};

export type OperatingProfitDashboard = {
  summary: OperatingProfitSummary;
  overhead: {
    knownOverheadCents: number;
    categories: OperatingProfitOverheadCategory[];
    /** MTD known overhead when period is month — not a forecast. */
    knownOverheadMtdCents: number | null;
    note: string;
  };
  issues: OperatingProfitIssue[];
};

export function canViewOperatingProfit(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  return canViewCashControl(identity);
}

export function resolveOperatingProfitPeriodRange(
  period: OperatingProfitPeriod,
  now: Date = new Date(),
  custom?: { fromDate: string; toDate: string },
): { fromDate: string; toDate: string } {
  if (period === 'custom' && custom?.fromDate && custom?.toDate) {
    return { fromDate: custom.fromDate, toDate: custom.toDate };
  }
  const toDate = ownerFinancialTodayDate(now);
  if (period === 'today') {
    return { fromDate: toDate, toDate };
  }
  if (period === 'week') {
    return { fromDate: ownerFinancialWeekStartDate(now), toDate };
  }
  if (period === 'last_month') {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const lastMonthDate = new Date(Date.UTC(y, m - 1, 1));
    const fromDate = ownerFinancialMonthStartDate(lastMonthDate);
    const end = new Date(Date.UTC(y, m, 0));
    return { fromDate, toDate: end.toISOString().slice(0, 10) };
  }
  return { fromDate: ownerFinancialMonthStartDate(now), toDate };
}

/**
 * Critical invariant: allocationType direct_job_cost never contributes to overhead.
 * Overhead is only allocationType === 'overhead'.
 */
export function extractOverheadAllocations(
  transactions: ReadonlyArray<CashControlBankTransactionInput>,
  fromDate: string,
  toDate: string,
): OperatingProfitOverheadLine[] {
  const lines: OperatingProfitOverheadLine[] = [];
  for (const tx of transactions) {
    if (tx.transactionDate < fromDate || tx.transactionDate > toDate) continue;
    if (tx.allocationStatus === 'ignored') continue;
    if (tx.direction !== 'debit') continue;
    for (const a of tx.allocations) {
      if (a.isActive === false) continue;
      if (a.allocationType !== 'overhead') continue;
      const category = (a.category ?? '').trim() || 'other';
      lines.push({
        allocationId: a.id,
        transactionId: tx.id,
        transactionDate: tx.transactionDate,
        amountCents: safeAnalyticsCents(a.amountCents),
        category,
        description: tx.description,
        merchantName: tx.merchantName,
        receiptStatus: tx.receiptStatus,
        href: `/finance/bank-control?tx=${tx.id}`,
      });
    }
  }
  return lines;
}

/** Prove direct_job_cost cents are not included in overhead extraction. */
export function sumDirectJobCostAllocationCents(
  transactions: ReadonlyArray<CashControlBankTransactionInput>,
  fromDate: string,
  toDate: string,
): number {
  let sum = 0;
  for (const tx of transactions) {
    if (tx.transactionDate < fromDate || tx.transactionDate > toDate) continue;
    if (tx.allocationStatus === 'ignored') continue;
    for (const a of tx.allocations) {
      if (a.isActive === false) continue;
      if (a.allocationType === 'direct_job_cost') {
        sum += safeAnalyticsCents(a.amountCents);
      }
    }
  }
  return sum;
}

export function sumOverheadAllocationCents(lines: readonly OperatingProfitOverheadLine[]): number {
  return lines.reduce((s, l) => s + l.amountCents, 0);
}

/**
 * Receipt evidence must not inflate overhead — only the bank allocation amount counts once.
 */
export function resolveOverheadWithoutReceiptDoubleCount(input: {
  overheadAllocationCents: number;
  receiptAmountCents?: number | null;
}): { knownOverheadCents: number; receiptIsEvidenceOnly: true } {
  return {
    knownOverheadCents: safeAnalyticsCents(input.overheadAllocationCents),
    receiptIsEvidenceOnly: true,
  };
}

/**
 * Economic overhead uses BANK overhead allocations once.
 * Xero bill / duplicate bank mirror amounts must not be added.
 */
export function resolveOverheadAuthorityOnce(input: {
  bankOverheadAllocationCents: number;
  xeroBillExpenseCents?: number | null;
  xeroBankMirrorCents?: number | null;
}): {
  knownOverheadCents: number;
  xeroIgnoredCents: number;
  authority: 'bank_overhead_allocation';
} {
  const bank = safeAnalyticsCents(input.bankOverheadAllocationCents);
  const xeroIgnored =
    safeAnalyticsCents(input.xeroBillExpenseCents) +
    safeAnalyticsCents(input.xeroBankMirrorCents);
  return {
    knownOverheadCents: bank,
    xeroIgnoredCents: xeroIgnored,
    authority: 'bank_overhead_allocation',
  };
}

/**
 * Job labour already in JPE GP must not also be subtracted as wage overhead
 * unless that spend was separately allocated as company overhead on the bank.
 * This helper proves we never invent payroll OH from JPE labour.
 */
export function resolveWageOverheadWithoutJobLabourDoubleCount(input: {
  jpeLabourCostCents: number;
  bankWagesOverheadCents: number;
}): {
  wageOverheadCents: number;
  jpeLabourRemainsInGrossProfit: true;
  fabricatedPayrollCents: 0;
} {
  return {
    wageOverheadCents: safeAnalyticsCents(input.bankWagesOverheadCents),
    jpeLabourRemainsInGrossProfit: true,
    fabricatedPayrollCents: 0,
  };
}

export function buildOverheadCategories(
  lines: readonly OperatingProfitOverheadLine[],
): OperatingProfitOverheadCategory[] {
  const knownOverheadCents = sumOverheadAllocationCents(lines);
  const map = new Map<string, OperatingProfitOverheadLine[]>();
  for (const line of lines) {
    const key = line.category.toLowerCase();
    const list = map.get(key) ?? [];
    list.push(line);
    map.set(key, list);
  }

  const categories: OperatingProfitOverheadCategory[] = [];
  for (const [, bucket] of map) {
    const category = bucket[0]?.category ?? 'other';
    const amountCents = bucket.reduce((s, l) => s + l.amountCents, 0);
    const missing = bucket.filter((l) => String(l.receiptStatus) === 'receipt_missing').length;
    const txIds = new Set(bucket.map((l) => l.transactionId));
    let dataQuality: OperatingProfitDataQuality = 'VERIFIED';
    if (category.toLowerCase() === 'other' || category.toLowerCase() === '') {
      dataQuality = 'PROVISIONAL';
    }
    if (missing > 0) dataQuality = dataQuality === 'VERIFIED' ? 'PROVISIONAL' : dataQuality;

    categories.push({
      category,
      amountCents,
      percentOfKnownOverhead:
        knownOverheadCents > 0
          ? Math.round((amountCents / knownOverheadCents) * 10000) / 100
          : null,
      transactionCount: txIds.size,
      allocationCount: bucket.length,
      missingReceiptCount: missing,
      dataQuality,
      href: `/finance/bank-control?allocationType=overhead&category=${encodeURIComponent(category)}`,
      lines: bucket,
    });
  }

  return categories.sort((a, b) => b.amountCents - a.amountCents);
}

export function computeKnownOperatingProfitCents(
  companyGrossProfitCents: number,
  knownOverheadCents: number,
): number {
  return (
    safeAnalyticsCents(companyGrossProfitCents) - safeAnalyticsCents(knownOverheadCents)
  );
}

export function computeKnownOperatingCashMovementCents(input: {
  customerCashCollectedCents: number;
  directCashOutCents: number;
  overheadCashOutCents: number;
}): number {
  return (
    safeAnalyticsCents(input.customerCashCollectedCents) -
    safeAnalyticsCents(input.directCashOutCents) -
    safeAnalyticsCents(input.overheadCashOutCents)
  );
}

export function deriveOperatingProfitCompleteness(input: {
  unexplainedDebitCents: number;
  unallocatedDebitCount: number;
  missingReceiptCount: number;
  incompleteJobs: number;
  jobsIncluded: number;
  unresolvedOverheadCategoryCents: number;
  hasBankAccounts: boolean;
}): {
  completeness: OperatingProfitDataQuality;
  reasons: OperatingProfitCompletenessReason[];
  qualityNote: string;
} {
  const reasons: OperatingProfitCompletenessReason[] = [];

  // Payroll is not a reliable separate economic model — always disclose.
  reasons.push('incomplete_payroll_source');
  reasons.push('duplicated_source_risk_avoided');

  if (!input.hasBankAccounts || input.unexplainedDebitCents > 0) {
    reasons.push('incomplete_bank_coverage');
  }
  if (input.unexplainedDebitCents > 0) {
    reasons.push('unexplained_debit');
  }
  if (input.unallocatedDebitCount > 0) {
    reasons.push('unallocated_debit');
  }
  if (input.missingReceiptCount > 0) {
    reasons.push('missing_receipt_evidence');
  }
  if (input.unresolvedOverheadCategoryCents > 0) {
    reasons.push('overhead_category_unresolved');
  }
  if (input.jobsIncluded === 0) {
    reasons.push('no_jobs_in_period');
  } else if (input.incompleteJobs > 0) {
    reasons.push('jpe_coverage_incomplete');
  }

  const blocking = reasons.filter(
    (r) =>
      r === 'unexplained_debit' ||
      r === 'unallocated_debit' ||
      r === 'incomplete_bank_coverage' ||
      r === 'jpe_coverage_incomplete' ||
      r === 'incomplete_payroll_source',
  );

  let completeness: OperatingProfitDataQuality = 'VERIFIED';
  if (blocking.length > 0) {
    // Payroll incompleteness alone → PROVISIONAL; bank/JPE gaps → INCOMPLETE
    const hard = blocking.filter((r) => r !== 'incomplete_payroll_source');
    completeness = hard.length > 0 ? 'INCOMPLETE' : 'PROVISIONAL';
  } else if (
    reasons.includes('missing_receipt_evidence') ||
    reasons.includes('overhead_category_unresolved')
  ) {
    completeness = 'PROVISIONAL';
  }

  const qualityNote =
    completeness === 'VERIFIED'
      ? 'Operating profit sources are complete for this period.'
      : `Operating profit is ${completeness}: ${reasons.join(', ').replace(/_/g, ' ')}.`;

  return { completeness, reasons, qualityNote };
}

export function buildOperatingProfitSummary(input: {
  period: OperatingProfitPeriod;
  fromDate: string;
  toDate: string;
  currency?: string;
  economicRevenueCents: number;
  directEconomicCostCents: number;
  companyGrossProfitCents: number;
  knownOverheadCents: number;
  customerCashCollectedCents: number;
  directCashOutCents: number;
  overheadCashOutCents: number;
  excludedTransferOutCents: number;
  excludedNonOperatingOutCents: number;
  unexplainedDebitCents: number;
  jobsIncluded: number;
  incompleteJobs: number;
  unallocatedDebitCount: number;
  missingReceiptCount: number;
  unresolvedOverheadCategoryCents: number;
  hasBankAccounts: boolean;
}): OperatingProfitSummary {
  const companyGrossProfitCents = safeAnalyticsCents(input.companyGrossProfitCents);
  const knownOverheadCents = safeAnalyticsCents(input.knownOverheadCents);
  const knownOperatingProfitCents = computeKnownOperatingProfitCents(
    companyGrossProfitCents,
    knownOverheadCents,
  );
  const economicRevenueCents = safeAnalyticsCents(input.economicRevenueCents);
  const knownOperatingCashMovementCents = computeKnownOperatingCashMovementCents({
    customerCashCollectedCents: input.customerCashCollectedCents,
    directCashOutCents: input.directCashOutCents,
    overheadCashOutCents: input.overheadCashOutCents,
  });

  const { completeness, reasons, qualityNote } = deriveOperatingProfitCompleteness({
    unexplainedDebitCents: input.unexplainedDebitCents,
    unallocatedDebitCount: input.unallocatedDebitCount,
    missingReceiptCount: input.missingReceiptCount,
    incompleteJobs: input.incompleteJobs,
    jobsIncluded: input.jobsIncluded,
    unresolvedOverheadCategoryCents: input.unresolvedOverheadCategoryCents,
    hasBankAccounts: input.hasBankAccounts,
  });

  return {
    period: input.period,
    fromDate: input.fromDate,
    toDate: input.toDate,
    currency: input.currency ?? 'ZAR',
    economicRevenueCents,
    directEconomicCostCents: safeAnalyticsCents(input.directEconomicCostCents),
    companyGrossProfitCents,
    grossMarginPct: marginPct(companyGrossProfitCents, economicRevenueCents),
    knownOverheadCents,
    knownOperatingProfitCents,
    operatingMarginPct: marginPct(knownOperatingProfitCents, economicRevenueCents),
    customerCashCollectedCents: safeAnalyticsCents(input.customerCashCollectedCents),
    directCashOutCents: safeAnalyticsCents(input.directCashOutCents),
    overheadCashOutCents: safeAnalyticsCents(input.overheadCashOutCents),
    knownOperatingCashMovementCents,
    excludedTransferOutCents: safeAnalyticsCents(input.excludedTransferOutCents),
    excludedNonOperatingOutCents: safeAnalyticsCents(input.excludedNonOperatingOutCents),
    unexplainedDebitCents: safeAnalyticsCents(input.unexplainedDebitCents),
    completeness,
    completenessReasons: reasons,
    qualityNote,
    jobsIncluded: input.jobsIncluded,
    incompleteJobs: input.incompleteJobs,
    sourceTrace: [
      'jpe_snapshot',
      'bank_overhead_allocation',
      'cash_control_period_metrics',
      'payments',
    ],
    drillDown: {
      cashControl: '/finance/cash-control',
      bankControl: '/finance/bank-control',
      profitAnalytics: '/finance/profit-analytics',
      jobCostControl: '/finance/job-cost-control',
    },
  };
}

export function buildOperatingProfitIssues(input: {
  unexplainedDebitCents: number;
  unallocatedDebitCount: number;
  missingReceiptCount: number;
  unresolvedOverheadCategoryCents: number;
  unresolvedOverheadCount: number;
}): OperatingProfitIssue[] {
  const issues: OperatingProfitIssue[] = [];
  if (input.unallocatedDebitCount > 0 || input.unexplainedDebitCents > 0) {
    issues.push({
      kind: 'unallocated_debit',
      label: 'Unallocated / unexplained bank debits',
      amountCents: input.unexplainedDebitCents,
      count: input.unallocatedDebitCount,
      href: '/finance/bank-control',
    });
  }
  if (input.unresolvedOverheadCount > 0) {
    issues.push({
      kind: 'unclassified_overhead',
      label: 'Overhead in unresolved category (other)',
      amountCents: input.unresolvedOverheadCategoryCents,
      count: input.unresolvedOverheadCount,
      href: '/finance/bank-control?allocationType=overhead&category=other',
    });
  }
  if (input.missingReceiptCount > 0) {
    issues.push({
      kind: 'missing_evidence',
      label: 'Overhead allocations missing receipt evidence',
      amountCents: null,
      count: input.missingReceiptCount,
      href: '/finance/bank-control',
    });
  }
  issues.push({
    kind: 'incomplete_payroll_source',
    label: 'Company payroll/wage economics not fully modelled — only bank wages overhead counted',
    amountCents: null,
    count: 0,
    href: '/finance/cash-control',
  });
  return issues;
}

export function isDateInOperatingPeriod(
  day: string,
  fromDate: string,
  toDate: string,
): boolean {
  return day >= fromDate && day <= toDate;
}

/** Type guard helper for tests — allocation types that must never be overhead. */
export function allocationTypeContributesToOverhead(
  allocationType: BankTransactionAllocationType,
): boolean {
  return allocationType === 'overhead';
}
