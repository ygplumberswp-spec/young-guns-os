/**
 * FIN-002 — Job / Service Profit Analytics (shared types + pure aggregation).
 *
 * Consumes JPE snapshot truth. Does NOT recalculate financial engine formulas.
 * Free-text service (job_type) and suburb dimensions are labelled as unsupported taxonomy.
 */

import { canViewCashControl } from './cash-control.js';
import type { ProfitabilityCompleteness } from './job-profitability.js';
import type { ProfitabilityConfidence } from './job-profitability-source-integrity.js';
import {
  ownerFinancialMonthStartDate,
  ownerFinancialTodayDate,
  ownerFinancialWeekStartDate,
} from './owner-financial-command.js';

export type ProfitAnalyticsPeriod = 'week' | 'month' | 'last_month' | 'custom';

export type ProfitAnalyticsDataQuality = 'VERIFIED' | 'PROVISIONAL' | 'INCOMPLETE';

export type ProfitAnalyticsJobRow = {
  jobId: string;
  jobReference: string | null;
  title: string;
  status: string;
  jobType: string | null;
  customerId: string | null;
  customerName: string | null;
  suburb: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  calculatedAt: string;
  completeness: ProfitabilityCompleteness | string;
  confidenceStatus: ProfitabilityConfidence['status'] | string;
  dataQuality: ProfitAnalyticsDataQuality;
  currency: string;
  revenueCents: number;
  economicCostCents: number;
  grossProfitCents: number;
  grossMarginPct: number | null;
  cashCollectedCents: number;
  cashSpentCents: number;
  knownRealisedCashProfitCents: number;
  expectedGrossMarginPct: number | null;
  actualGrossMarginPct: number | null;
  marginVariancePct: number | null;
  expectedLabourCostCents: number;
  actualLabourCostCents: number;
  labourVarianceCents: number;
  expectedMaterialCostCents: number;
  actualMaterialCostCents: number;
  materialVarianceCents: number;
  labourMinutes: number;
  profitStatus: string;
  href: string;
};

export type ProfitAnalyticsCoverage = {
  jobsIncluded: number;
  jobsExcluded: number;
  incompleteJobs: number;
  provisionalJobs: number;
  verifiedJobs: number;
  dataQuality: ProfitAnalyticsDataQuality;
  qualityNote: string;
};

export type ProfitAnalyticsOverview = {
  period: ProfitAnalyticsPeriod;
  fromDate: string;
  toDate: string;
  currency: string;
  coverage: ProfitAnalyticsCoverage;
  revenueCents: number;
  economicCostCents: number;
  grossProfitCents: number;
  grossMarginPct: number | null;
  knownRealisedCashProfitCents: number;
  cashCollectedCents: number;
  cashSpentCents: number;
  lossJobCount: number;
  lowMarginJobCount: number;
  serviceTaxonomySupported: false;
  suburbTaxonomySupported: false;
  sourceTrace: string[];
};

export type ProfitAnalyticsAggregateRow = {
  key: string;
  label: string;
  jobsCount: number;
  verifiedJobsCount: number;
  incompleteJobsCount: number;
  revenueCents: number;
  economicCostCents: number;
  grossProfitCents: number;
  grossMarginPct: number | null;
  averageTicketCents: number;
  averageProfitCents: number;
  lossJobCount: number;
  expectedGrossMarginPct: number | null;
  actualGrossMarginPct: number | null;
  /** Customer AR outstanding (invoice balance due). Null when not applicable to this dimension. */
  outstandingCustomerCashCents: number | null;
  dataQuality: ProfitAnalyticsDataQuality;
  href: string | null;
};

export type ProfitAnalyticsTechnicianRow = {
  userId: string;
  userName: string;
  jobsCompleted: number;
  labourMinutes: number;
  attributableRevenueCents: number;
  attributableGrossProfitCents: number;
  attributableGrossMarginPct: number | null;
  incompleteCostCaptureCount: number;
  dataQuality: ProfitAnalyticsDataQuality;
  caveat: string;
  href: string | null;
};

export type ProfitAnalyticsSupplierRow = {
  supplierId: string;
  supplierName: string;
  costEntryCount: number;
  spendCents: number;
  jobAttributedSpendCents: number;
  receiptCompleteCount: number;
  receiptMissingCount: number;
  href: string | null;
};

export type ProfitAnalyticsLabourSummary = {
  expectedLabourCostCents: number;
  actualLabourCostCents: number;
  labourVarianceCents: number;
  actualLabourMinutes: number;
  jobsWithLabourOverrun: number;
  expectedLabourSupported: boolean;
  limitationNote: string | null;
};

export type ProfitAnalyticsMaterialSummary = {
  expectedMaterialCostCents: number;
  actualMaterialCostCents: number;
  materialVarianceCents: number;
  jobsWithMaterialOverrun: number;
  expectedMaterialSupported: boolean;
  limitationNote: string | null;
};

export type ProfitAnalyticsDashboard = {
  overview: ProfitAnalyticsOverview;
  jobs: {
    topGrossProfit: ProfitAnalyticsJobRow[];
    highestMargin: ProfitAnalyticsJobRow[];
    lowestMargin: ProfitAnalyticsJobRow[];
    lossJobs: ProfitAnalyticsJobRow[];
    largestMarginMisses: ProfitAnalyticsJobRow[];
    incompleteJobs: ProfitAnalyticsJobRow[];
  };
  services: {
    taxonomySupported: false;
    taxonomyNote: string;
    rows: ProfitAnalyticsAggregateRow[];
  };
  customers: {
    rows: ProfitAnalyticsAggregateRow[];
  };
  technicians: {
    caveat: string;
    rows: ProfitAnalyticsTechnicianRow[];
  };
  labour: ProfitAnalyticsLabourSummary;
  materials: ProfitAnalyticsMaterialSummary;
  suppliers: {
    rows: ProfitAnalyticsSupplierRow[];
    note: string;
  };
  suburbs: {
    taxonomySupported: false;
    taxonomyNote: string;
    rows: ProfitAnalyticsAggregateRow[];
  };
};

export function canViewProfitAnalytics(identity: {
  roleName: string;
  permissions: readonly string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') return false;
  return canViewCashControl(identity);
}

export function resolveProfitAnalyticsPeriodRange(
  period: ProfitAnalyticsPeriod,
  now: Date = new Date(),
  custom?: { fromDate: string; toDate: string },
): { fromDate: string; toDate: string } {
  if (period === 'custom' && custom?.fromDate && custom?.toDate) {
    return { fromDate: custom.fromDate, toDate: custom.toDate };
  }
  const toDate = ownerFinancialTodayDate(now);
  if (period === 'week') {
    return { fromDate: ownerFinancialWeekStartDate(now), toDate };
  }
  if (period === 'last_month') {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth(); // 0-based current
    const lastMonthDate = new Date(Date.UTC(y, m - 1, 1));
    const fromDate = ownerFinancialMonthStartDate(lastMonthDate);
    const end = new Date(Date.UTC(y, m, 0)); // last day of previous month
    return { fromDate, toDate: end.toISOString().slice(0, 10) };
  }
  // month (default)
  return { fromDate: ownerFinancialMonthStartDate(now), toDate };
}

export function deriveJobAnalyticsDataQuality(input: {
  completeness: string;
  confidenceStatus: string;
  profitStatus?: string;
}): ProfitAnalyticsDataQuality {
  if (
    input.completeness === 'complete' &&
    (input.confidenceStatus === 'complete' || input.confidenceStatus === '')
  ) {
    return 'VERIFIED';
  }
  if (
    input.confidenceStatus === 'incomplete' ||
    input.completeness.startsWith('incomplete') ||
    input.completeness === 'incomplete_multiple'
  ) {
    return 'INCOMPLETE';
  }
  if (input.confidenceStatus === 'provisional' || input.profitStatus === 'unknown') {
    return 'PROVISIONAL';
  }
  if (input.completeness === 'complete') return 'PROVISIONAL';
  return 'INCOMPLETE';
}

export function isLowMarginJob(grossMarginPct: number | null, thresholdPct = 15): boolean {
  if (grossMarginPct == null) return false;
  return grossMarginPct < thresholdPct && grossMarginPct >= 0;
}

export function isLossJob(input: {
  grossProfitCents: number;
  profitStatus?: string;
}): boolean {
  if (input.profitStatus === 'loss') return true;
  return input.grossProfitCents < 0;
}

export function safeAnalyticsCents(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

export function marginPct(profitCents: number, revenueCents: number): number | null {
  if (revenueCents <= 0) return null;
  return Math.round((profitCents / revenueCents) * 10000) / 100;
}

/** Exclude incomplete jobs from confident rankings. */
export function filterJobsForConfidentRanking(
  rows: readonly ProfitAnalyticsJobRow[],
): ProfitAnalyticsJobRow[] {
  return rows.filter((r) => r.dataQuality !== 'INCOMPLETE');
}

export function rankTopGrossProfit(
  rows: readonly ProfitAnalyticsJobRow[],
  limit = 10,
): ProfitAnalyticsJobRow[] {
  return [...filterJobsForConfidentRanking(rows)]
    .sort((a, b) => b.grossProfitCents - a.grossProfitCents)
    .slice(0, limit);
}

export function rankHighestMargin(
  rows: readonly ProfitAnalyticsJobRow[],
  limit = 10,
): ProfitAnalyticsJobRow[] {
  return [...filterJobsForConfidentRanking(rows)]
    .filter((r) => r.grossMarginPct != null)
    .sort((a, b) => (b.grossMarginPct ?? 0) - (a.grossMarginPct ?? 0))
    .slice(0, limit);
}

export function rankLowestMargin(
  rows: readonly ProfitAnalyticsJobRow[],
  limit = 10,
): ProfitAnalyticsJobRow[] {
  return [...filterJobsForConfidentRanking(rows)]
    .filter((r) => r.grossMarginPct != null)
    .sort((a, b) => (a.grossMarginPct ?? 0) - (b.grossMarginPct ?? 0))
    .slice(0, limit);
}

export function rankLossJobs(rows: readonly ProfitAnalyticsJobRow[], limit = 20): ProfitAnalyticsJobRow[] {
  return [...rows]
    .filter((r) => isLossJob(r))
    .sort((a, b) => a.grossProfitCents - b.grossProfitCents)
    .slice(0, limit);
}

export function rankLargestMarginMisses(
  rows: readonly ProfitAnalyticsJobRow[],
  limit = 10,
): ProfitAnalyticsJobRow[] {
  return [...filterJobsForConfidentRanking(rows)]
    .filter((r) => r.marginVariancePct != null)
    .sort((a, b) => (a.marginVariancePct ?? 0) - (b.marginVariancePct ?? 0))
    .slice(0, limit);
}

export function buildCoverage(rows: readonly ProfitAnalyticsJobRow[]): ProfitAnalyticsCoverage {
  const verifiedJobs = rows.filter((r) => r.dataQuality === 'VERIFIED').length;
  const provisionalJobs = rows.filter((r) => r.dataQuality === 'PROVISIONAL').length;
  const incompleteJobs = rows.filter((r) => r.dataQuality === 'INCOMPLETE').length;
  const jobsIncluded = rows.length;
  let dataQuality: ProfitAnalyticsDataQuality = 'VERIFIED';
  if (incompleteJobs > 0) dataQuality = 'INCOMPLETE';
  else if (provisionalJobs > 0) dataQuality = 'PROVISIONAL';
  return {
    jobsIncluded,
    jobsExcluded: 0,
    incompleteJobs,
    provisionalJobs,
    verifiedJobs,
    dataQuality,
    qualityNote:
      jobsIncluded === 0
        ? 'No jobs with JPE snapshots in this period.'
        : `${verifiedJobs} of ${jobsIncluded} jobs financially verified; ${incompleteJobs} incomplete.`,
  };
}

export function buildOverviewFromJobs(
  rows: readonly ProfitAnalyticsJobRow[],
  meta: {
    period: ProfitAnalyticsPeriod;
    fromDate: string;
    toDate: string;
    currency?: string;
  },
): ProfitAnalyticsOverview {
  const coverage = buildCoverage(rows);
  // Aggregate known jobs — do not silently drop incomplete from totals, but label coverage.
  const revenueCents = rows.reduce((s, r) => s + r.revenueCents, 0);
  const economicCostCents = rows.reduce((s, r) => s + r.economicCostCents, 0);
  const grossProfitCents = rows.reduce((s, r) => s + r.grossProfitCents, 0);
  const cashCollectedCents = rows.reduce((s, r) => s + r.cashCollectedCents, 0);
  const cashSpentCents = rows.reduce((s, r) => s + r.cashSpentCents, 0);
  const knownRealisedCashProfitCents = rows.reduce(
    (s, r) => s + r.knownRealisedCashProfitCents,
    0,
  );
  return {
    period: meta.period,
    fromDate: meta.fromDate,
    toDate: meta.toDate,
    currency: meta.currency ?? 'ZAR',
    coverage,
    revenueCents,
    economicCostCents,
    grossProfitCents,
    grossMarginPct: marginPct(grossProfitCents, revenueCents),
    knownRealisedCashProfitCents,
    cashCollectedCents,
    cashSpentCents,
    lossJobCount: rows.filter((r) => isLossJob(r)).length,
    lowMarginJobCount: rows.filter((r) => isLowMarginJob(r.grossMarginPct)).length,
    serviceTaxonomySupported: false,
    suburbTaxonomySupported: false,
    sourceTrace: ['jpe_snapshot', 'job', 'customer', 'direct_cost', 'mobile_time_entry'],
  };
}

export function aggregateByKey(
  rows: readonly ProfitAnalyticsJobRow[],
  keyFn: (row: ProfitAnalyticsJobRow) => { key: string; label: string; href?: string | null },
): ProfitAnalyticsAggregateRow[] {
  const map = new Map<
    string,
    {
      label: string;
      href: string | null;
      jobs: ProfitAnalyticsJobRow[];
    }
  >();
  for (const row of rows) {
    const { key, label, href } = keyFn(row);
    const bucket = map.get(key) ?? { label, href: href ?? null, jobs: [] };
    bucket.jobs.push(row);
    map.set(key, bucket);
  }

  const aggregates: ProfitAnalyticsAggregateRow[] = [];
  for (const [key, bucket] of map) {
    const revenueCents = bucket.jobs.reduce((s, r) => s + r.revenueCents, 0);
    const economicCostCents = bucket.jobs.reduce((s, r) => s + r.economicCostCents, 0);
    const grossProfitCents = bucket.jobs.reduce((s, r) => s + r.grossProfitCents, 0);
    const verifiedJobsCount = bucket.jobs.filter((r) => r.dataQuality === 'VERIFIED').length;
    const incompleteJobsCount = bucket.jobs.filter((r) => r.dataQuality === 'INCOMPLETE').length;
    const expectedMargins = bucket.jobs
      .map((r) => r.expectedGrossMarginPct)
      .filter((v): v is number => v != null);
    const actualMargins = bucket.jobs
      .map((r) => r.actualGrossMarginPct)
      .filter((v): v is number => v != null);
    let dataQuality: ProfitAnalyticsDataQuality = 'VERIFIED';
    if (incompleteJobsCount > 0) dataQuality = 'INCOMPLETE';
    else if (verifiedJobsCount < bucket.jobs.length) dataQuality = 'PROVISIONAL';

    aggregates.push({
      key,
      label: bucket.label,
      jobsCount: bucket.jobs.length,
      verifiedJobsCount,
      incompleteJobsCount,
      revenueCents,
      economicCostCents,
      grossProfitCents,
      grossMarginPct: marginPct(grossProfitCents, revenueCents),
      averageTicketCents:
        bucket.jobs.length > 0 ? Math.round(revenueCents / bucket.jobs.length) : 0,
      averageProfitCents:
        bucket.jobs.length > 0 ? Math.round(grossProfitCents / bucket.jobs.length) : 0,
      lossJobCount: bucket.jobs.filter((r) => isLossJob(r)).length,
      expectedGrossMarginPct:
        expectedMargins.length > 0
          ? Math.round(
              (expectedMargins.reduce((s, v) => s + v, 0) / expectedMargins.length) * 100,
            ) / 100
          : null,
      actualGrossMarginPct:
        actualMargins.length > 0
          ? Math.round((actualMargins.reduce((s, v) => s + v, 0) / actualMargins.length) * 100) /
            100
          : null,
      outstandingCustomerCashCents: null,
      dataQuality,
      href: bucket.href,
    });
  }

  return aggregates.sort((a, b) => b.grossProfitCents - a.grossProfitCents);
}

/**
 * Technician attribution: whole-job revenue attributed once to primary assignee.
 * Does NOT split multi-crew jobs (avoids double counting). Label as operational context.
 */
export function aggregateByTechnician(
  rows: readonly ProfitAnalyticsJobRow[],
): ProfitAnalyticsTechnicianRow[] {
  const map = new Map<string, ProfitAnalyticsJobRow[]>();
  for (const row of rows) {
    if (!row.assignedUserId) continue;
    const list = map.get(row.assignedUserId) ?? [];
    list.push(row);
    map.set(row.assignedUserId, list);
  }

  const result: ProfitAnalyticsTechnicianRow[] = [];
  for (const [userId, jobs] of map) {
    const revenue = jobs.reduce((s, r) => s + r.revenueCents, 0);
    const gp = jobs.reduce((s, r) => s + r.grossProfitCents, 0);
    const incomplete = jobs.filter((r) => r.dataQuality === 'INCOMPLETE').length;
    let dataQuality: ProfitAnalyticsDataQuality = 'VERIFIED';
    if (incomplete > 0) dataQuality = 'INCOMPLETE';
    else if (jobs.some((r) => r.dataQuality === 'PROVISIONAL')) dataQuality = 'PROVISIONAL';

    result.push({
      userId,
      userName: jobs[0]?.assignedUserName ?? 'Technician',
      jobsCompleted: jobs.filter((r) => r.status === 'completed').length,
      labourMinutes: jobs.reduce((s, r) => s + r.labourMinutes, 0),
      attributableRevenueCents: revenue,
      attributableGrossProfitCents: gp,
      attributableGrossMarginPct: marginPct(gp, revenue),
      incompleteCostCaptureCount: incomplete,
      dataQuality,
      caveat:
        'Operational job-assignment context. Whole-job economics attributed to primary assignee once — not a personal performance score; incomplete jobs labelled.',
      href: null,
    });
  }
  return result.sort((a, b) => b.attributableGrossProfitCents - a.attributableGrossProfitCents);
}

export function buildLabourSummary(rows: readonly ProfitAnalyticsJobRow[]): ProfitAnalyticsLabourSummary {
  const expectedLabourCostCents = rows.reduce((s, r) => s + r.expectedLabourCostCents, 0);
  const actualLabourCostCents = rows.reduce((s, r) => s + r.actualLabourCostCents, 0);
  const hasExpected = rows.some((r) => r.expectedLabourCostCents > 0);
  return {
    expectedLabourCostCents,
    actualLabourCostCents,
    labourVarianceCents: actualLabourCostCents - expectedLabourCostCents,
    actualLabourMinutes: rows.reduce((s, r) => s + r.labourMinutes, 0),
    jobsWithLabourOverrun: rows.filter(
      (r) => r.expectedLabourCostCents > 0 && r.actualLabourCostCents > r.expectedLabourCostCents,
    ).length,
    expectedLabourSupported: hasExpected,
    limitationNote: hasExpected
      ? null
      : 'Expected labour cost is not reliably present for most jobs — showing actual labour capture only.',
  };
}

export function buildMaterialSummary(
  rows: readonly ProfitAnalyticsJobRow[],
): ProfitAnalyticsMaterialSummary {
  const expectedMaterialCostCents = rows.reduce((s, r) => s + r.expectedMaterialCostCents, 0);
  const actualMaterialCostCents = rows.reduce((s, r) => s + r.actualMaterialCostCents, 0);
  const hasExpected = rows.some((r) => r.expectedMaterialCostCents > 0);
  return {
    expectedMaterialCostCents,
    actualMaterialCostCents,
    materialVarianceCents: actualMaterialCostCents - expectedMaterialCostCents,
    jobsWithMaterialOverrun: rows.filter(
      (r) =>
        r.expectedMaterialCostCents > 0 && r.actualMaterialCostCents > r.expectedMaterialCostCents,
    ).length,
    expectedMaterialSupported: hasExpected,
    limitationNote: hasExpected
      ? null
      : 'Expected material cost comparison only available when quoted material exists on the job.',
  };
}

export function paginateRows<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): { rows: T[]; page: number; pageSize: number; total: number; hasMore: boolean } {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = Math.min(200, Math.max(1, Math.floor(pageSize) || 25));
  const total = rows.length;
  const start = (safePage - 1) * safeSize;
  const slice = rows.slice(start, start + safeSize);
  return {
    rows: slice,
    page: safePage,
    pageSize: safeSize,
    total,
    hasMore: start + safeSize < total,
  };
}

export const SERVICE_TAXONOMY_NOTE =
  'Service buckets use free-text job_type (no controlled taxonomy FK). Aggregation is provisional by definition.';

export const SUBURB_TAXONOMY_NOTE =
  'Suburb uses job snapshot / property free-text fields. Values may be inconsistent or missing.';

export const TECHNICIAN_ANALYTICS_CAVEAT =
  'Technician figures are operational job-assignment context using primary assignee only. Multi-crew jobs are not split; private wage rates are not exposed; incomplete capture is labelled.';
