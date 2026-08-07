/**
 * JPE-002 — Cost capture & missing-money control layer.
 *
 * Builds on JPE profitabilityConfidence without duplicating it.
 * Adds operational flags, checklist, and owner queue semantics.
 */

import type { JobProfitabilityResult } from './job-profitability.js';
import type { LabourRateConfidence, ProfitabilityConfidence } from './job-profitability-source-integrity.js';
import { canViewFinanceProfit } from './finance-tenant-pricebook.js';
import { canManageJobProfitabilityAdjustments } from './job-profitability.js';

export type JobFinancialCompletenessStatus =
  | 'verified'
  | 'provisional'
  | 'incomplete'
  | 'attention_required';

export type JobFinancialReviewStatus =
  | 'not_required'
  | 'needs_review'
  | 'in_review'
  | 'financially_complete';

export type MissingCostFlagType =
  | 'NO_REVENUE_SOURCE'
  | 'NO_LABOUR_CAPTURED'
  | 'LABOUR_ENTRY_UNLOCKED'
  | 'MATERIAL_COST_MISSING'
  | 'MATERIAL_TAX_BASIS_UNKNOWN'
  | 'DIRECT_COST_UNALLOCATED'
  | 'DIRECT_COST_RECEIPT_MISSING'
  | 'SUPPLIER_COST_UNALLOCATED'
  | 'JOB_COSTS_NOT_FINALISED'
  | 'CUSTOMER_PAYMENT_OUTSTANDING'
  | 'CASH_COST_DATA_INCOMPLETE'
  | 'EXPECTED_MARGIN_MISSED'
  | 'NEGATIVE_MARGIN'
  | 'LOW_MARGIN_JOB'
  | 'LOSS_JOB'
  | 'COMPLETED_JOB_FINANCIALLY_INCOMPLETE'
  | 'FINANCIAL_REVIEW_STALE';

export type MissingCostFlagSeverity = 'info' | 'warning' | 'critical';

export type MissingCostFlag = {
  jobId: string | null;
  type: MissingCostFlagType;
  severity: MissingCostFlagSeverity;
  amountCents: number | null;
  expectedValue: number | null;
  actualValue: number | null;
  source: string | null;
  sourceId: string | null;
  actionRequired: string;
  message: string;
};

export type CostChecklistItemStatus = 'ok' | 'warning' | 'missing' | 'not_applicable';

export type JobCostChecklistSection = {
  label: string;
  status: CostChecklistItemStatus;
  detail: string;
};

export type JobCostChecklist = {
  revenue: JobCostChecklistSection;
  labour: JobCostChecklistSection;
  materials: JobCostChecklistSection;
  expenses: JobCostChecklistSection;
  receipts: JobCostChecklistSection;
  cash: JobCostChecklistSection;
  profitability: JobCostChecklistSection;
};

export type JobFinancialCompleteness = {
  status: JobFinancialCompletenessStatus;
  missingReasons: string[];
  flags: MissingCostFlag[];
  checklist: JobCostChecklist;
  profitabilityConfidence: ProfitabilityConfidence;
};

export type UnallocatedCostItem = {
  id: string;
  kind: 'direct_cost' | 'purchase_order';
  description: string;
  amountCents: number;
  supplierName: string | null;
  sourceType: string;
  sourceId: string;
  costDate: string | null;
  receiptDocumentId: string | null;
};

export type JobCostControlSummary = {
  completedJobsNeedingReview: number;
  missingLabourJobs: number;
  missingCostEvidence: number;
  unallocatedCostsCents: number;
  unallocatedCostsCount: number;
  outstandingCustomerCashCents: number;
  lowMarginJobs: number;
  lossJobs: number;
  provisionalProfitabilityJobs: number;
};

export type JobCostControlQueueItem = {
  jobId: string;
  jobReference: string | null;
  title: string;
  flags: MissingCostFlag[];
};

export type JobCostControlQueue = {
  summary: JobCostControlSummary;
  completedJobsNeedingReview: Array<
    JobCostControlQueueItem & {
      status: JobFinancialReviewStatus;
      isStale: boolean;
      completenessStatus: JobFinancialCompletenessStatus;
    }
  >;
  missingLabour: JobCostControlQueueItem[];
  missingMaterialCost: JobCostControlQueueItem[];
  missingReceipts: JobCostControlQueueItem[];
  unallocatedCosts: UnallocatedCostItem[];
  paymentOutstanding: Array<JobCostControlQueueItem & { amountCents: number }>;
  marginProblems: JobCostControlQueueItem[];
  provisionalProfitability: JobCostControlQueueItem[];
};

/** Categories that normally require receipt/evidence before financial finalisation. */
export const RECEIPT_REQUIRED_DIRECT_COST_CATEGORIES = new Set([
  'fuel',
  'parking',
  'tolls',
  'subcontractor',
  'equipment_hire',
  'consumables',
  'permits',
  'dump_disposal',
  'courier',
  'specialist',
  'travel_accommodation',
]);

export const RECEIPT_REQUIRED_SOURCE_TYPES = new Set([
  'manual',
  'receipt',
  'supplier_invoice',
  'bank_transaction',
]);

export function canAccessJobCostControl(identity: {
  permissions?: readonly string[] | null;
  roleName?: string | null;
}): boolean {
  return canViewFinanceProfit(identity.permissions ?? [], identity.roleName);
}

export function canManageJobCostControl(identity: {
  permissions?: readonly string[] | null;
  roleName?: string | null;
}): boolean {
  return canManageJobProfitabilityAdjustments(identity);
}

export function isReceiptRequiredForDirectCost(input: {
  category: string;
  sourceType: string;
  amountCents: number;
}): boolean {
  if (input.amountCents <= 0) return false;
  if (!RECEIPT_REQUIRED_SOURCE_TYPES.has(input.sourceType)) return false;
  return RECEIPT_REQUIRED_DIRECT_COST_CATEGORIES.has(input.category);
}

export function mapProfitabilityConfidenceToCompleteness(
  confidence: ProfitabilityConfidence,
  flags: MissingCostFlag[],
): JobFinancialCompletenessStatus {
  if (flags.some((f) => f.severity === 'critical')) return 'attention_required';
  if (confidence.status === 'incomplete') return 'incomplete';
  if (confidence.status === 'provisional' || flags.some((f) => f.severity === 'warning')) {
    return 'provisional';
  }
  if (flags.length > 0) return 'provisional';
  return 'verified';
}

export type AssessJobCostControlInput = {
  jobId: string;
  jobStatus: string;
  jobReference: string | null;
  currency: string;
  profitability: JobProfitabilityResult;
  financialReview: {
    status: JobFinancialReviewStatus;
    reviewFingerprint: string | null;
    isStale: boolean;
  };
  labourEntries: Array<{
    id: string;
    entryType: string;
    durationMinutes: number;
    labourRateConfidence: LabourRateConfidence;
    userId: string;
  }>;
  materialLines: Array<{
    id: string;
    status: string;
    quantity: string;
    unitCostCents: number;
    description: string;
  }>;
  directCosts: Array<{
    id: string;
    category: string;
    description: string;
    amountCents: number;
    sourceType: string;
    receiptDocumentId: string | null;
    isPaid: boolean;
  }>;
  hasCrewAssigned: boolean;
  marginVarianceThresholdBps: number;
  warningMarginBps: number;
};

export function assessJobCostControl(input: AssessJobCostControlInput): JobFinancialCompleteness {
  const flags: MissingCostFlag[] = [];
  const missingReasons: string[] = [];
  const { profitability: p, jobId } = input;

  const hasRevenue =
    p.summary.revenueSource !== 'none' &&
    (p.summary.jobRevenueCents > 0 ||
      p.summary.invoiceAmountCents > 0 ||
      p.summary.approvedAmountCents > 0);

  if (!hasRevenue) {
    flags.push({
      jobId,
      type: 'NO_REVENUE_SOURCE',
      severity: input.jobStatus === 'completed' ? 'critical' : 'warning',
      amountCents: null,
      expectedValue: null,
      actualValue: p.summary.jobRevenueCents,
      source: 'revenue',
      sourceId: null,
      actionRequired: 'Link an invoice, accepted quote, or revenue adjustment.',
      message: 'No authoritative revenue source linked to this job.',
    });
    missingReasons.push('No revenue source');
  }

  const billableLabour = input.labourEntries.filter(
    (e) => (e.entryType === 'job_time' || e.entryType === 'travel') && e.durationMinutes > 0,
  );

  if (input.jobStatus === 'completed' && billableLabour.length === 0) {
    flags.push({
      jobId,
      type: 'NO_LABOUR_CAPTURED',
      severity: input.hasCrewAssigned ? 'warning' : 'info',
      amountCents: null,
      expectedValue: p.expected.expectedLabourCostCents > 0 ? p.expected.expectedLabourCostCents : null,
      actualValue: 0,
      source: 'mobile_time_entry',
      sourceId: null,
      actionRequired: 'Record and lock labour time entries for this job.',
      message: 'Completed job has no billable labour time recorded.',
    });
    missingReasons.push('No labour captured');
  }

  const unlockedLabour = billableLabour.filter(
    (e) => e.labourRateConfidence === 'fallback_current_rate' || e.labourRateConfidence === 'historical_effective_rate',
  );
  if (unlockedLabour.length > 0) {
    flags.push({
      jobId,
      type: 'LABOUR_ENTRY_UNLOCKED',
      severity: 'warning',
      amountCents: null,
      expectedValue: null,
      actualValue: unlockedLabour.length,
      source: 'mobile_time_entry',
      sourceId: unlockedLabour[0]!.id,
      actionRequired: 'Approve/lock labour rates or apply an audited correction.',
      message: `${unlockedLabour.length} labour entr${unlockedLabour.length === 1 ? 'y' : 'ies'} without locked historical rate.`,
    });
    missingReasons.push('Unlocked labour rates');
  }

  for (const line of input.materialLines) {
    const qty = Number.parseFloat(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (line.status === 'returned') continue;

    if (line.unitCostCents <= 0 && (line.status === 'used' || line.status === 'fulfilled')) {
      flags.push({
        jobId,
        type: 'MATERIAL_COST_MISSING',
        severity: 'warning',
        amountCents: null,
        expectedValue: null,
        actualValue: 0,
        source: 'job_material_line',
        sourceId: line.id,
        actionRequired: 'Capture unit cost for material usage.',
        message: `Material "${line.description}" has quantity but no cost.`,
      });
    }
  }

  if (
    input.jobStatus === 'completed' &&
    p.sourceProvenance.materials.length === 0 &&
    p.expected.expectedMaterialCostCents > 0
  ) {
    flags.push({
      jobId,
      type: 'MATERIAL_COST_MISSING',
      severity: 'warning',
      amountCents: p.expected.expectedMaterialCostCents,
      expectedValue: p.expected.expectedMaterialCostCents,
      actualValue: p.summary.materialCostCents,
      source: 'job_material_line',
      sourceId: null,
      actionRequired: 'Record material usage and costs for this completed job.',
      message: 'Expected materials on quote but no material costs captured.',
    });
  }

  const unknownTaxMaterials = p.sourceProvenance.materials.filter(
    (m) => m.taxBasis === 'unknown' || m.taxAssumed,
  );
  if (unknownTaxMaterials.length > 0) {
    flags.push({
      jobId,
      type: 'MATERIAL_TAX_BASIS_UNKNOWN',
      severity: 'warning',
      amountCents: null,
      expectedValue: null,
      actualValue: unknownTaxMaterials.length,
      source: 'job_material_line',
      sourceId: unknownTaxMaterials[0]?.sourceId ?? null,
      actionRequired: 'Confirm VAT/tax basis for material costs.',
      message: `${unknownTaxMaterials.length} material cost(s) have unknown or assumed tax basis.`,
    });
  }

  for (const cost of input.directCosts) {
    if (
      isReceiptRequiredForDirectCost({
        category: cost.category,
        sourceType: cost.sourceType,
        amountCents: cost.amountCents,
      }) &&
      !cost.receiptDocumentId
    ) {
      flags.push({
        jobId,
        type: 'DIRECT_COST_RECEIPT_MISSING',
        severity: 'warning',
        amountCents: cost.amountCents,
        expectedValue: null,
        actualValue: null,
        source: cost.sourceType,
        sourceId: cost.id,
        actionRequired: 'Attach receipt or supplier invoice evidence.',
        message: `Receipt missing for ${cost.description} (${cost.category}).`,
      });
    }
  }

  if (p.cash.uncollectedRevenueCents > 0 && hasRevenue) {
    flags.push({
      jobId,
      type: 'CUSTOMER_PAYMENT_OUTSTANDING',
      severity: p.cash.uncollectedRevenueCents > p.summary.jobRevenueCents * 0.5 ? 'critical' : 'warning',
      amountCents: p.cash.uncollectedRevenueCents,
      expectedValue: p.summary.jobRevenueCents,
      actualValue: p.cash.cashCollectedCents,
      source: 'payment',
      sourceId: null,
      actionRequired: 'Collect outstanding customer payment.',
      message: 'Customer payment outstanding on invoiced revenue.',
    });
  }

  if (p.cash.cashSpentCompleteness !== 'complete_boolean' && input.directCosts.some((c) => c.isPaid)) {
    flags.push({
      jobId,
      type: 'CASH_COST_DATA_INCOMPLETE',
      severity: 'info',
      amountCents: null,
      expectedValue: null,
      actualValue: null,
      source: 'direct_cost',
      sourceId: null,
      actionRequired: 'Cash spent uses paid flags only until bank reconciliation is linked.',
      message: 'Cash cost settlement data is incomplete.',
    });
  }

  if (
    p.expected.expectedGrossMarginPct != null &&
    p.summary.grossMarginPct != null &&
    input.marginVarianceThresholdBps > 0
  ) {
    const varianceBps = Math.round((p.summary.grossMarginPct - p.expected.expectedGrossMarginPct) * 100);
    if (varianceBps < -input.marginVarianceThresholdBps) {
      flags.push({
        jobId,
        type: 'EXPECTED_MARGIN_MISSED',
        severity: 'warning',
        amountCents: p.variance.profitVarianceCents,
        expectedValue: p.expected.expectedGrossMarginPct,
        actualValue: p.summary.grossMarginPct,
        source: 'quote',
        sourceId: p.primaryQuoteId,
        actionRequired: 'Review margin leakage flags and cost capture completeness.',
        message: `Actual margin ${p.summary.grossMarginPct}% vs expected ${p.expected.expectedGrossMarginPct}%.`,
      });
    }
  }

  if (p.summary.grossProfitCents < 0 && hasRevenue) {
    flags.push({
      jobId,
      type: 'LOSS_JOB',
      severity: 'critical',
      amountCents: p.summary.grossProfitCents,
      expectedValue: p.expected.expectedGrossProfitCents,
      actualValue: p.summary.grossProfitCents,
      source: 'profitability',
      sourceId: null,
      actionRequired: 'Review costs and revenue before closing financially.',
      message: 'Job shows negative gross profit.',
    });
  } else if (p.summary.grossProfitCents === 0 && hasRevenue) {
    flags.push({
      jobId,
      type: 'NEGATIVE_MARGIN',
      severity: 'warning',
      amountCents: 0,
      expectedValue: p.expected.expectedGrossProfitCents,
      actualValue: 0,
      source: 'profitability',
      sourceId: null,
      actionRequired: 'Confirm all costs and revenue are captured correctly.',
      message: 'Job shows zero gross profit.',
    });
  }

  const warningMarginPct = input.warningMarginBps / 100;
  if (
    p.summary.grossMarginPct != null &&
    p.summary.grossMarginPct < warningMarginPct &&
    p.summary.grossProfitCents > 0 &&
    hasRevenue
  ) {
    flags.push({
      jobId,
      type: 'LOW_MARGIN_JOB',
      severity: 'warning',
      amountCents: p.summary.grossProfitCents,
      expectedValue: p.expected.expectedGrossMarginPct,
      actualValue: p.summary.grossMarginPct,
      source: 'profitability',
      sourceId: null,
      actionRequired: 'Review low-margin job for cost overruns or pricing issues.',
      message: `Gross margin ${p.summary.grossMarginPct}% is below warning threshold.`,
    });
  }

  if (
    input.jobStatus === 'completed' &&
    (!hasRevenue || flags.some((f) => ['NO_LABOUR_CAPTURED', 'MATERIAL_COST_MISSING', 'NO_REVENUE_SOURCE'].includes(f.type)))
  ) {
    flags.push({
      jobId,
      type: 'COMPLETED_JOB_FINANCIALLY_INCOMPLETE',
      severity: 'critical',
      amountCents: null,
      expectedValue: null,
      actualValue: null,
      source: 'job',
      sourceId: jobId,
      actionRequired: 'Complete financial costing before marking financially complete.',
      message: 'Work completed — financial costing incomplete.',
    });
  }

  if (input.financialReview.isStale) {
    flags.push({
      jobId,
      type: 'FINANCIAL_REVIEW_STALE',
      severity: 'warning',
      amountCents: null,
      expectedValue: null,
      actualValue: null,
      source: 'financial_review',
      sourceId: jobId,
      actionRequired: 'Re-review job after financial source changes.',
      message: 'Financial review outdated — source data changed since last sign-off.',
    });
  }

  if (
    input.financialReview.status !== 'financially_complete' &&
    input.jobStatus === 'completed' &&
    flags.some((f) => f.severity === 'warning' || f.severity === 'critical')
  ) {
    flags.push({
      jobId,
      type: 'JOB_COSTS_NOT_FINALISED',
      severity: 'info',
      amountCents: null,
      expectedValue: null,
      actualValue: null,
      source: 'financial_review',
      sourceId: jobId,
      actionRequired: 'Resolve flags and mark financial review complete.',
      message: 'Job costs not yet finalised for financial close.',
    });
  }

  const checklist = buildCostChecklist(input, flags, hasRevenue, billableLabour.length, unlockedLabour.length);

  const status = mapProfitabilityConfidenceToCompleteness(p.profitabilityConfidence, flags);

  return {
    status,
    missingReasons: [...new Set(missingReasons)],
    flags,
    checklist,
    profitabilityConfidence: p.profitabilityConfidence,
  };
}

function buildCostChecklist(
  input: AssessJobCostControlInput,
  flags: MissingCostFlag[],
  hasRevenue: boolean,
  labourCount: number,
  unlockedCount: number,
): JobCostChecklist {
  const p = input.profitability;
  const flagTypes = new Set(flags.map((f) => f.type));

  const revenue: JobCostChecklistSection = hasRevenue
    ? {
        label: 'Revenue',
        status: 'ok',
        detail:
          p.summary.revenueSource === 'invoice'
            ? 'Invoice linked'
            : p.summary.revenueSource === 'approved_quote'
              ? 'Accepted quote linked'
              : 'Revenue adjustment applied',
      }
    : { label: 'Revenue', status: 'missing', detail: 'No revenue source' };

  let labour: JobCostChecklistSection;
  if (labourCount === 0) {
    labour = { label: 'Labour', status: input.jobStatus === 'completed' ? 'missing' : 'not_applicable', detail: 'No labour recorded' };
  } else if (unlockedCount > 0) {
    labour = { label: 'Labour', status: 'warning', detail: `${unlockedCount} unlocked time entr${unlockedCount === 1 ? 'y' : 'ies'}` };
  } else {
    labour = { label: 'Labour', status: 'ok', detail: `${labourCount} locked time entr${labourCount === 1 ? 'y' : 'ies'}` };
  }

  const materials: JobCostChecklistSection =
    flagTypes.has('MATERIAL_COST_MISSING') || flagTypes.has('MATERIAL_TAX_BASIS_UNKNOWN')
      ? {
          label: 'Materials',
          status: 'warning',
          detail: flagTypes.has('MATERIAL_COST_MISSING')
            ? 'Material cost missing'
            : 'Tax basis unknown for materials',
        }
      : p.sourceProvenance.materials.length > 0
        ? { label: 'Materials', status: 'ok', detail: `${p.sourceProvenance.materials.length} material line(s)` }
        : { label: 'Materials', status: 'not_applicable', detail: 'No material costs recorded' };

  const expenses: JobCostChecklistSection =
    input.directCosts.length > 0
      ? { label: 'Expenses', status: 'ok', detail: `${input.directCosts.length} cost(s) allocated` }
      : { label: 'Expenses', status: 'not_applicable', detail: 'No direct costs recorded' };

  const missingReceipts = flags.filter((f) => f.type === 'DIRECT_COST_RECEIPT_MISSING').length;
  const receipts: JobCostChecklistSection =
    missingReceipts > 0
      ? { label: 'Receipts', status: 'warning', detail: `${missingReceipts} slip(s) missing` }
      : input.directCosts.some((c) => c.receiptDocumentId)
        ? { label: 'Receipts', status: 'ok', detail: 'Evidence attached' }
        : { label: 'Receipts', status: 'not_applicable', detail: 'No receipt-required costs' };

  const cash: JobCostChecklistSection = flagTypes.has('CUSTOMER_PAYMENT_OUTSTANDING')
    ? { label: 'Cash', status: 'warning', detail: 'Customer payment outstanding' }
    : flagTypes.has('CASH_COST_DATA_INCOMPLETE')
      ? { label: 'Cash', status: 'warning', detail: 'Cash settlement incomplete' }
      : { label: 'Cash', status: 'ok', detail: 'Cash data within known limits' };

  const profStatus = p.profitabilityConfidence.status;
  const profitability: JobCostChecklistSection = {
    label: 'Profitability',
    status:
      profStatus === 'complete'
        ? 'ok'
        : profStatus === 'provisional'
          ? 'warning'
          : 'missing',
    detail:
      profStatus === 'complete'
        ? 'Verified'
        : profStatus === 'provisional'
          ? `Provisional — ${p.profitabilityConfidence.issues.filter((i) => i.severity !== 'info').length || p.profitabilityConfidence.issues.length} issue(s)`
          : 'Incomplete',
  };

  return { revenue, labour, materials, expenses, receipts, cash, profitability };
}

export function isFinancialReviewStale(
  reviewFingerprint: string | null,
  currentFingerprint: string | null,
  status: JobFinancialReviewStatus,
): boolean {
  if (status !== 'financially_complete') return false;
  if (!reviewFingerprint || !currentFingerprint) return false;
  return reviewFingerprint !== currentFingerprint;
}

export function resolveFinancialReviewStatusAfterJobComplete(
  current: JobFinancialReviewStatus | null | undefined,
): JobFinancialReviewStatus {
  if (current === 'financially_complete' || current === 'in_review') {
    return 'needs_review';
  }
  if (current === 'needs_review') return 'needs_review';
  return 'needs_review';
}
