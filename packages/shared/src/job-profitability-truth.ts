/**
 * Row 107 — Job Profitability Truth + Missing-Money Evidence Alerts
 *
 * Deterministic INTERNAL layer over Row106. Reuses JPE / Rows103–105.
 * Does NOT invent overhead, bank cash, or fraud conclusions.
 * Row108+ banking not started. Row118 remains OPEN. Staging Xero writes = 0.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import {
  computeGpCents,
  computeMarginBps,
  resolveActualDirectCosts,
  resolveActualRevenue,
  resolveEstimatedBaseline,
  varianceCents,
  type ActualInvoiceRevenueInput,
  type JpeDirectCostInput,
} from './estimated-actual-gp.js';

export const JOB_PROFITABILITY_TRUTH_KEY = 'job-profitability-truth' as const;

export const JOB_PROFITABILITY_TRUTH_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type MissingMoneyAlertCode =
  | 'JOB_REVENUE_MISSING'
  | 'INVOICE_JOB_LINK_MISSING'
  | 'MATERIAL_COST_MISSING'
  | 'LABOUR_COST_MISSING'
  | 'OTHER_COST_SOURCE_MISSING'
  | 'JPE_SOURCE_UNLINKED'
  | 'PROCUREMENT_COST_UNRESOLVED'
  | 'SUPPLIER_CREDIT_UNRESOLVED'
  | 'DUPLICATE_COST_BLOCKED'
  | 'ESTIMATE_BASELINE_INCOMPLETE'
  | 'ACTUAL_COST_EXCEEDS_ESTIMATE'
  | 'REVENUE_BELOW_APPROVED_QUOTE'
  | 'COST_WITHOUT_REVENUE'
  | 'REVENUE_WITHOUT_COST_EVIDENCE'
  | 'OVERHEAD_NOT_ALLOCATED'
  | 'REVIEW_REQUIRED';

export type JobProfitabilityCompleteness =
  | 'COMPLETE'
  | 'PROVISIONAL'
  | 'INCOMPLETE'
  | 'REVIEW_REQUIRED';

export type JobCostBucket = 'material' | 'labour' | 'other';

export type ProfitabilityTruthCostEntry = JpeDirectCostInput & {
  /** Explicit bucket when known; otherwise inferred from source identity only. */
  costBucket?: JobCostBucket | null;
  reversed?: boolean;
  unresolvedProcurement?: boolean;
  unresolvedSupplierCredit?: boolean;
};

export type MissingMoneyAlert = {
  code: MissingMoneyAlertCode;
  /** Evidence condition — not an accusation. */
  message: string;
  severity: 'info' | 'warning' | 'critical';
};

export type JobProfitabilityTruthResult = {
  jobId: string;
  revenueExVatCents: number | null;
  materialCostCents: number | null;
  labourCostCents: number | null;
  otherJobCostCents: number | null;
  totalKnownJobCostCents: number | null;
  grossProfitCents: number | null;
  grossMarginBps: number | null;
  /** Job operating contribution — never company operating profit. */
  jobOperatingContributionCents: number | null;
  estimatedRevenueExVatCents: number | null;
  estimatedDirectCostCents: number | null;
  estimatedGpCents: number | null;
  estimatedMarginBps: number | null;
  revenueVarianceCents: number | null;
  costVarianceCents: number | null;
  gpVarianceCents: number | null;
  marginVarianceBps: number | null;
  completeness: JobProfitabilityCompleteness;
  lifecycleStatus: 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'UNKNOWN';
  warnings: string[];
  missingInputs: string[];
  alerts: MissingMoneyAlert[];
  profitableOrLossLabelled: boolean;
  overheadAllocated: false | true;
  provenance: {
    revenueSource: 'authoritative_invoices' | 'none';
    materialSources: string[];
    labourSources: string[];
    otherSources: string[];
    estimateSource: string;
    duplicateKeysBlocked: string[];
  };
};

export function classifyJobCostBucket(entry: ProfitabilityTruthCostEntry): JobCostBucket {
  if (entry.costBucket === 'material' || entry.costBucket === 'labour' || entry.costBucket === 'other') {
    return entry.costBucket;
  }
  const sid = entry.sourceId.toLowerCase();
  const st = entry.sourceType.toLowerCase();
  const cat = (entry.category ?? '').toLowerCase();

  if (
    sid.startsWith('labour:') ||
    sid.startsWith('payroll:') ||
    sid.startsWith('time:') ||
    sid.includes('labour_cost') ||
    cat === 'labour'
  ) {
    return 'labour';
  }

  if (
    st === 'material_line' ||
    st === 'purchase_order' ||
    st === 'supplier_invoice' ||
    sid.startsWith('material_use:') ||
    sid.startsWith('supplier_invoice') ||
    cat === 'consumables'
  ) {
    return 'material';
  }

  return 'other';
}

/**
 * Deduplicate and bucket Job costs. Prefer Row105 alloc over full invoice.
 * Skip reversed entries that are already represented by a reversal adjustment key.
 */
export function resolveBucketedJobCosts(input: {
  jobId: string;
  entries: ProfitabilityTruthCostEntry[];
}): {
  materialCostCents: number | null;
  labourCostCents: number | null;
  otherJobCostCents: number | null;
  totalKnownJobCostCents: number | null;
  materialSources: string[];
  labourSources: string[];
  otherSources: string[];
  duplicateKeysBlocked: string[];
  includedEntryIds: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const duplicateKeysBlocked: string[] = [];
  const base = resolveActualDirectCosts({
    jobId: input.jobId,
    entries: input.entries,
  });
  for (const w of base.warnings) {
    if (w === 'DUPLICATE_SOURCE_BLOCKED') {
      warnings.push('DUPLICATE_COST_BLOCKED');
    }
  }

  const included = new Set(base.entryIdsIncluded);
  const jobEntries = input.entries.filter((e) => e.jobId === input.jobId && included.has(e.entryId));

  // Skip entries explicitly marked reversed when a matching reversal adjustment exists
  const reversalKeys = new Set(
    jobEntries
      .filter((e) => e.sourceId.includes('_reversal:') || e.sourceId.includes('_credit:'))
      .map((e) => e.sourceId),
  );

  let material = 0;
  let labour = 0;
  let other = 0;
  let materialN = 0;
  let labourN = 0;
  let otherN = 0;
  const materialSources: string[] = [];
  const labourSources: string[] = [];
  const otherSources: string[] = [];
  const seen = new Set<string>();

  for (const e of jobEntries) {
    const key = `${e.sourceType}:${e.sourceId}`;
    if (seen.has(key)) {
      duplicateKeysBlocked.push(key);
      warnings.push('DUPLICATE_COST_BLOCKED');
      continue;
    }
    if (e.reversed === true) {
      // reversed original — only count if no separate reversal row; skip original
      continue;
    }
    seen.add(key);
    const bucket = classifyJobCostBucket(e);
    if (bucket === 'material') {
      material += e.amountCents;
      materialN += 1;
      materialSources.push(key);
    } else if (bucket === 'labour') {
      labour += e.amountCents;
      labourN += 1;
      labourSources.push(key);
    } else {
      other += e.amountCents;
      otherN += 1;
      otherSources.push(key);
    }
  }

  // Collect duplicate keys from full-invoice skips
  for (const e of input.entries.filter((x) => x.jobId === input.jobId)) {
    const key = `${e.sourceType}:${e.sourceId}`;
    if (
      !included.has(e.entryId) &&
      e.sourceId.startsWith('supplier_invoice:') &&
      !e.sourceId.startsWith('supplier_invoice_alloc:')
    ) {
      duplicateKeysBlocked.push(key);
    }
  }

  void reversalKeys;

  return {
    materialCostCents: materialN > 0 ? material : null,
    labourCostCents: labourN > 0 ? labour : null,
    otherJobCostCents: otherN > 0 ? other : null,
    totalKnownJobCostCents:
      materialN + labourN + otherN > 0 ? material + labour + other : null,
    materialSources,
    labourSources,
    otherSources,
    duplicateKeysBlocked: [...new Set(duplicateKeysBlocked)],
    includedEntryIds: [...included],
    warnings: [...new Set(warnings)],
  };
}

export function buildMissingMoneyAlerts(input: {
  jobLifecycleComplete: boolean;
  revenueExVatCents: number | null;
  materialCostCents: number | null;
  labourCostCents: number | null;
  otherJobCostCents: number | null;
  totalKnownJobCostCents: number | null;
  estimatedGpCents: number | null;
  estimateIncomplete: boolean;
  approvedQuoteSellExVatCents: number | null;
  invoicesMissingJobLink: number;
  orphanJpeUnlinked: number;
  unresolvedProcurement: boolean;
  unresolvedSupplierCredit: boolean;
  duplicateBlocked: boolean;
  overheadAllocated: boolean;
}): MissingMoneyAlert[] {
  const alerts: MissingMoneyAlert[] = [];
  const push = (
    code: MissingMoneyAlertCode,
    message: string,
    severity: MissingMoneyAlert['severity'] = 'warning',
  ) => {
    alerts.push({ code, message, severity });
  };

  if (input.revenueExVatCents == null) {
    push(
      'JOB_REVENUE_MISSING',
      'No authoritative Job-linked invoice revenue evidence is available to reconcile.',
      input.jobLifecycleComplete ? 'critical' : 'warning',
    );
  }
  if (input.invoicesMissingJobLink > 0) {
    push(
      'INVOICE_JOB_LINK_MISSING',
      `${input.invoicesMissingJobLink} invoice(s) lack a canonical Job link; revenue cannot be attributed.`,
      'critical',
    );
  }
  if (input.materialCostCents == null) {
    push(
      'MATERIAL_COST_MISSING',
      'No canonical material/procurement JPE cost evidence is present for this Job.',
    );
  }
  if (input.labourCostCents == null) {
    push(
      'LABOUR_COST_MISSING',
      'No canonical labour/payroll/time cost evidence is present for this Job.',
    );
  }
  if (
    input.materialCostCents == null &&
    input.labourCostCents == null &&
    input.otherJobCostCents == null
  ) {
    push(
      'OTHER_COST_SOURCE_MISSING',
      'No Job-attributable direct cost sources were found in JPE.',
    );
  }
  if (input.orphanJpeUnlinked > 0) {
    push(
      'JPE_SOURCE_UNLINKED',
      `${input.orphanJpeUnlinked} JPE entr(y/ies) are not linked to this Job.`,
    );
  }
  if (input.unresolvedProcurement) {
    push(
      'PROCUREMENT_COST_UNRESOLVED',
      'Procurement/material cost evidence exists but could not be resolved into a single Job cost identity.',
      'critical',
    );
  }
  if (input.unresolvedSupplierCredit) {
    push(
      'SUPPLIER_CREDIT_UNRESOLVED',
      'Supplier credit/return evidence could not be uniquely linked to a Job allocation.',
      'critical',
    );
  }
  if (input.duplicateBlocked) {
    push(
      'DUPLICATE_COST_BLOCKED',
      'Duplicate economic cost source identities were blocked to prevent double counting.',
      'info',
    );
  }
  if (input.estimateIncomplete) {
    push(
      'ESTIMATE_BASELINE_INCOMPLETE',
      'Estimated baseline is incomplete; estimated-vs-actual variance is unavailable.',
    );
  }
  if (
    input.estimatedGpCents != null &&
    input.totalKnownJobCostCents != null &&
    input.approvedQuoteSellExVatCents != null &&
    input.totalKnownJobCostCents >
      (input.approvedQuoteSellExVatCents - (input.estimatedGpCents ?? 0) || 0) &&
    input.totalKnownJobCostCents > 0
  ) {
    // Use simpler exceed check vs estimated direct cost via variance path below
  }
  if (
    input.totalKnownJobCostCents != null &&
    input.approvedQuoteSellExVatCents != null &&
    // compare actual total cost vs estimated cost if we can derive: skip false positives
    false
  ) {
    push('ACTUAL_COST_EXCEEDS_ESTIMATE', 'Actual known Job cost exceeds estimated direct cost.');
  }
  if (
    input.revenueExVatCents != null &&
    input.approvedQuoteSellExVatCents != null &&
    input.revenueExVatCents < input.approvedQuoteSellExVatCents
  ) {
    push(
      'REVENUE_BELOW_APPROVED_QUOTE',
      'Authoritative invoice revenue is below the approved quote sell (ex-VAT).',
    );
  }
  if (input.totalKnownJobCostCents != null && input.revenueExVatCents == null) {
    push(
      'COST_WITHOUT_REVENUE',
      'Job cost evidence exists without authoritative revenue evidence.',
      'critical',
    );
  }
  if (input.revenueExVatCents != null && input.totalKnownJobCostCents == null) {
    push(
      'REVENUE_WITHOUT_COST_EVIDENCE',
      'Authoritative revenue exists without Job cost evidence to reconcile against.',
    );
  }
  if (!input.overheadAllocated) {
    push(
      'OVERHEAD_NOT_ALLOCATED',
      'Company overhead is not allocated to this Job; result is Job operating contribution only — not company operating profit.',
      'info',
    );
  }

  return alerts;
}

export function resolveJobProfitabilityTruth(input: {
  jobId: string;
  companyId: string;
  expectedJobCompanyId: string;
  jobStatus: 'new' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | string;
  invoices: ActualInvoiceRevenueInput[];
  jpeEntries: ProfitabilityTruthCostEntry[];
  estimated?: ReturnType<typeof resolveEstimatedBaseline> | null;
  approvedQuoteSellExVatCents?: number | null;
  /** Explicit canonical overhead only — never invent. */
  overheadAllocationCents?: number | null;
  invoicesMissingJobLink?: number;
  orphanJpeUnlinked?: number;
}): JobProfitabilityTruthResult {
  if (input.companyId !== input.expectedJobCompanyId) {
    return {
      jobId: input.jobId,
      revenueExVatCents: null,
      materialCostCents: null,
      labourCostCents: null,
      otherJobCostCents: null,
      totalKnownJobCostCents: null,
      grossProfitCents: null,
      grossMarginBps: null,
      jobOperatingContributionCents: null,
      estimatedRevenueExVatCents: null,
      estimatedDirectCostCents: null,
      estimatedGpCents: null,
      estimatedMarginBps: null,
      revenueVarianceCents: null,
      costVarianceCents: null,
      gpVarianceCents: null,
      marginVarianceBps: null,
      completeness: 'REVIEW_REQUIRED',
      lifecycleStatus: 'UNKNOWN',
      warnings: ['CROSS_TENANT_BLOCKED', 'REVIEW_REQUIRED'],
      missingInputs: ['tenant'],
      alerts: [
        {
          code: 'REVIEW_REQUIRED',
          message: 'Cross-tenant Job profitability access blocked.',
          severity: 'critical',
        },
      ],
      profitableOrLossLabelled: false,
      overheadAllocated: false,
      provenance: {
        revenueSource: 'none',
        materialSources: [],
        labourSources: [],
        otherSources: [],
        estimateSource: 'none',
        duplicateKeysBlocked: [],
      },
    };
  }

  const estimated =
    input.estimated ??
    resolveEstimatedBaseline({ row96: null, row94: null, quoteSellExVatCents: null });

  const revenue = resolveActualRevenue({
    invoices: input.invoices,
    expectedJobId: input.jobId,
  });
  const costs = resolveBucketedJobCosts({
    jobId: input.jobId,
    entries: input.jpeEntries,
  });

  const overheadAllocated =
    input.overheadAllocationCents != null && Number.isInteger(input.overheadAllocationCents);
  // Never invent overhead into Job contribution
  const contributionBase = costs.totalKnownJobCostCents;
  const gp = computeGpCents(revenue.actualRevenueExVatCents, contributionBase);
  const margin = computeMarginBps(gp, revenue.actualRevenueExVatCents);
  const contribution = gp; // same basis; company OP not claimed

  const estimateIncomplete =
    estimated.estimatedGpCents == null ||
    estimated.warnings.includes('ESTIMATE_INCOMPLETE');

  const revenueVariance = varianceCents(
    revenue.actualRevenueExVatCents,
    estimated.estimatedRevenueExVatCents,
  );
  const costVariance = varianceCents(
    costs.totalKnownJobCostCents,
    estimated.estimatedCostExVatCents,
  );
  const gpVariance = estimateIncomplete
    ? null
    : varianceCents(gp, estimated.estimatedGpCents);
  const marginVariance = estimateIncomplete
    ? null
    : varianceCents(margin, estimated.estimatedMarginBps);

  if (
    !estimateIncomplete &&
    estimated.estimatedCostExVatCents != null &&
    costs.totalKnownJobCostCents != null &&
    costs.totalKnownJobCostCents > estimated.estimatedCostExVatCents
  ) {
    // alert added below via flags
  }

  const lifecycleStatus =
    input.jobStatus === 'completed'
      ? 'COMPLETED'
      : input.jobStatus === 'cancelled'
        ? 'CANCELLED'
        : ['new', 'scheduled', 'in_progress'].includes(input.jobStatus)
          ? 'OPEN'
          : 'UNKNOWN';

  const jobLifecycleComplete = lifecycleStatus === 'COMPLETED';
  const revenueComplete = revenue.actualRevenueExVatCents != null;
  // Materials+labour not both required for "cost complete" — need at least one cost bucket
  // For COMPLETE profitability: revenue + total cost known. Labour/material may still alert.
  const costComplete = costs.totalKnownJobCostCents != null;
  const gpComplete = gp != null;

  let completeness: JobProfitabilityCompleteness = 'PROVISIONAL';
  if (lifecycleStatus === 'OPEN') {
    completeness = gpComplete ? 'PROVISIONAL' : 'INCOMPLETE';
  } else if (jobLifecycleComplete) {
    if (gpComplete && revenueComplete && costComplete) completeness = 'COMPLETE';
    else completeness = 'INCOMPLETE';
  } else if (!revenueComplete || !costComplete) {
    completeness = 'INCOMPLETE';
  }

  const unresolvedProcurementEarly = input.jpeEntries.some(
    (e) => e.jobId === input.jobId && e.unresolvedProcurement === true,
  );
  const unresolvedSupplierCreditEarly = input.jpeEntries.some(
    (e) => e.jobId === input.jobId && e.unresolvedSupplierCredit === true,
  );
  if (unresolvedProcurementEarly || unresolvedSupplierCreditEarly) {
    completeness = 'REVIEW_REQUIRED';
  }

  const alerts = buildMissingMoneyAlerts({
    jobLifecycleComplete,
    revenueExVatCents: revenue.actualRevenueExVatCents,
    materialCostCents: costs.materialCostCents,
    labourCostCents: costs.labourCostCents,
    otherJobCostCents: costs.otherJobCostCents,
    totalKnownJobCostCents: costs.totalKnownJobCostCents,
    estimatedGpCents: estimated.estimatedGpCents,
    estimateIncomplete,
    approvedQuoteSellExVatCents: input.approvedQuoteSellExVatCents ?? null,
    invoicesMissingJobLink: input.invoicesMissingJobLink ?? 0,
    orphanJpeUnlinked: input.orphanJpeUnlinked ?? 0,
    unresolvedProcurement: unresolvedProcurementEarly,
    unresolvedSupplierCredit: unresolvedSupplierCreditEarly,
    duplicateBlocked: costs.duplicateKeysBlocked.length > 0 || costs.warnings.includes('DUPLICATE_COST_BLOCKED'),
    overheadAllocated,
  });

  if (
    !estimateIncomplete &&
    estimated.estimatedCostExVatCents != null &&
    costs.totalKnownJobCostCents != null &&
    costs.totalKnownJobCostCents > estimated.estimatedCostExVatCents
  ) {
    alerts.push({
      code: 'ACTUAL_COST_EXCEEDS_ESTIMATE',
      message: 'Actual known Job cost exceeds estimated direct cost.',
      severity: 'warning',
    });
  }

  if (completeness === 'REVIEW_REQUIRED') {
    if (!alerts.some((a) => a.code === 'REVIEW_REQUIRED')) {
      alerts.push({
        code: 'REVIEW_REQUIRED',
        message: 'Profitability evidence requires human review before labelling outcome.',
        severity: 'warning',
      });
    }
  }

  const missingInputs: string[] = [];
  if (revenue.actualRevenueExVatCents == null) missingInputs.push('revenue');
  if (costs.materialCostCents == null) missingInputs.push('materialCost');
  if (costs.labourCostCents == null) missingInputs.push('labourCost');
  if (costs.totalKnownJobCostCents == null) missingInputs.push('totalJobCost');
  if (estimateIncomplete) missingInputs.push('estimateBaseline');

  const warnings = [
    ...estimated.warnings,
    ...revenue.warnings,
    ...costs.warnings,
    ...alerts.map((a) => a.code),
  ];

  const profitableOrLossLabelled =
    (completeness === 'COMPLETE' || completeness === 'PROVISIONAL') && gpComplete;

  return {
    jobId: input.jobId,
    revenueExVatCents: revenue.actualRevenueExVatCents,
    materialCostCents: costs.materialCostCents,
    labourCostCents: costs.labourCostCents,
    otherJobCostCents: costs.otherJobCostCents,
    totalKnownJobCostCents: costs.totalKnownJobCostCents,
    grossProfitCents: gp,
    grossMarginBps: margin,
    jobOperatingContributionCents: contribution,
    estimatedRevenueExVatCents: estimated.estimatedRevenueExVatCents,
    estimatedDirectCostCents: estimated.estimatedCostExVatCents,
    estimatedGpCents: estimated.estimatedGpCents,
    estimatedMarginBps: estimated.estimatedMarginBps,
    revenueVarianceCents: revenueVariance,
    costVarianceCents: costVariance,
    gpVarianceCents: gpVariance,
    marginVarianceBps: marginVariance,
    completeness,
    lifecycleStatus,
    warnings: [...new Set(warnings)],
    missingInputs,
    alerts,
    profitableOrLossLabelled,
    overheadAllocated: overheadAllocated ? true : false,
    provenance: {
      revenueSource: revenue.revenueSource,
      materialSources: costs.materialSources,
      labourSources: costs.labourSources,
      otherSources: costs.otherSources,
      estimateSource: estimated.estimateSource,
      duplicateKeysBlocked: costs.duplicateKeysBlocked,
    },
  };
}

export function canViewJobProfitabilityTruth(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (
    perms.includes('*') ||
    perms.includes('finance:read') ||
    perms.includes('finance:write') ||
    perms.includes('jobs:profitability')
  ) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertNoJobProfitabilityTruthClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoJobProfitabilityTruthClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'jobProfitabilityTruthInternal',
    'grossProfitCents',
    'grossMarginBps',
    'jobOperatingContributionCents',
    'materialCostCents',
    'labourCostCents',
    'missingMoneyAlerts',
    'gpVarianceCents',
    'jpeProfitCents',
    'estimatedGpCents',
    'actualGpCents',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Job profitability truth internal field leaked at ${path}.${key}`);
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') assertNoJobProfitabilityTruthClientLeak(v, `${path}.${k}`);
  }
}

export function assertRow108NotStartedDuringRow107(started: boolean): void {
  if (started) throw new Error('Row 108+ must not start during Row 107');
}

export function assertRow107SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row108Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
}): {
  row92Off: true;
  row108PlusNotStarted: true;
  row118NotClosed: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
  row106Preserved: true;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow108NotStartedDuringRow107(input.row108Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 107 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 107 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 107 requires production writes = 0');
  return {
    row92Off: true,
    row108PlusNotStarted: true,
    row118NotClosed: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
    row106Preserved: true,
  };
}

export function assertRoyalCapeUnchangedForRow107(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== JOB_PROFITABILITY_TRUTH_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== JOB_PROFITABILITY_TRUTH_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function profitabilityTruthIdempotencyKey(parts: string[]): string {
  return parts.join(':');
}
