/**
 * Row 94 — Plan / Floor-Plan Quotation & Estimate Baseline
 *
 * Manual/structured take-off + cost/sell/GP summary + estimate→quote→job linkage.
 * NOT Row 98 AI plan reading. NOT Row 96 full cost engine.
 * Row 92 global automation remains OFF.
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

export const PLAN_ESTIMATE_KEY = 'plan-floor-plan-quotation' as const;

export const PLAN_ESTIMATE_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type PlanEstimateStatus =
  | 'DRAFT_TAKEOFF'
  | 'REVIEW_REQUIRED'
  | 'REVIEWED'
  | 'APPROVED_FOR_QUOTE'
  | 'SUPERSEDED';

export type PlanTakeoffPointType = 'WATER' | 'WASTE' | 'GEYSER' | 'OTHER';

export type PlanQuantityOrigin =
  | 'MANUAL_COUNT'
  | 'PLAN_ANNOTATION'
  | 'EXPLICIT_PLAN_LABEL'
  | 'MEASURED'
  | 'IMPORTED_STRUCTURED_SOURCE';

export type PlanItemConfidence = 'CONFIRMED' | 'REVIEW_REQUIRED' | 'INSUFFICIENT_INFORMATION';

export type PlanScaleStatus = 'SCALE_VERIFIED' | 'SCALE_NOT_PROVIDED' | 'MEASUREMENT_REVIEW_REQUIRED';

export type PlanCostComponentType = 'MATERIAL' | 'LABOUR' | 'SITE' | 'OTHER';

export type PlanCostProvenance =
  | 'SUPPLIER_QUOTE'
  | 'CATALOGUE_COST'
  | 'APPROVED_MANUAL_COST'
  | 'HISTORICAL_VERIFIED'
  | 'MISSING';

export type PlanDocumentProvenance = {
  sourceDocumentId: string | null;
  sourceFilename: string | null;
  uploadedAt: string | null;
  customerId: string | null;
  propertyId: string | null;
  jobId: string | null;
  pageNumber: number | null;
  fileHash: string | null;
  revisionLabel: string | null;
};

export type PlanEstimateItemInput = {
  pointType: PlanTakeoffPointType;
  subtypeLabel?: string | null;
  description: string;
  quantity: number;
  unit: string;
  quantityOrigin: PlanQuantityOrigin;
  pageReference?: string | null;
  planAnnotationRef?: string | null;
  confidence: PlanItemConfidence;
  customerVisibleScopeText?: string | null;
  enteredBy?: string | null;
};

export type PlanEstimateCostComponentInput = {
  /** Optional link to estimate item id (null = estimate-level). */
  estimateItemId?: string | null;
  componentType: PlanCostComponentType;
  description: string;
  quantity: number;
  unit: string;
  unitCostCents: number | null;
  costProvenance: PlanCostProvenance;
  catalogueItemId?: string | null;
};

export type PlanEstimateSellInput = {
  proposedSellExVatCents: number | null;
  sellSource:
    | 'MANUAL_DRAFT'
    | 'CATALOGUE_SELL'
    | 'ROW90_FIXED_PRICE'
    | 'ROW93_OVERRIDE'
    | 'MISSING';
};

export type PlanEstimateSummary = {
  materialsCostCents: number | null;
  labourCostCents: number | null;
  siteCostCents: number | null;
  otherCostCents: number | null;
  directCostTotalCents: number | null;
  costEstimateIncomplete: boolean;
  missingCostReasons: string[];
  proposedSellExVatCents: number | null;
  estimatedGrossProfitCents: number | null;
  estimatedGrossMarginBps: number | null;
  gpIncomplete: boolean;
  vatNote: string;
};

export type PlanVsActualComparison = {
  status: 'PROVISIONAL' | 'FINAL' | 'ACTUAL_COST_INCOMPLETE' | 'NO_JOB';
  estimated: {
    materialsCostCents: number | null;
    labourCostCents: number | null;
    siteCostCents: number | null;
    directCostCents: number | null;
    sellExVatCents: number | null;
    grossProfitCents: number | null;
  };
  actual: {
    materialsCostCents: number | null;
    labourCostCents: number | null;
    otherDirectCostCents: number | null;
    directCostCents: number | null;
    revenueCents: number | null;
    grossProfitCents: number | null;
  };
  variance: {
    materialsCostCents: number | null;
    labourCostCents: number | null;
    directCostCents: number | null;
    revenueCents: number | null;
    profitCents: number | null;
  };
};

export function assertPlanQuantityValid(input: {
  quantity: number;
  quantityOrigin: PlanQuantityOrigin;
  confidence: PlanItemConfidence;
}): void {
  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new Error('PLAN_QUANTITY_INVALID');
  }
  if (input.confidence === 'INSUFFICIENT_INFORMATION' && input.quantity > 0) {
    // Allowed as provisional count, but must stay REVIEW path — caller enforces gate.
  }
}

export function assertMeasurementAllowed(input: {
  scaleStatus: PlanScaleStatus;
  isLengthMeasurement: boolean;
}): { ok: true } | { ok: false; code: 'SCALE_NOT_PROVIDED' | 'MEASUREMENT_REVIEW_REQUIRED' } {
  if (!input.isLengthMeasurement) return { ok: true };
  if (input.scaleStatus === 'SCALE_NOT_PROVIDED') {
    return { ok: false, code: 'SCALE_NOT_PROVIDED' };
  }
  if (input.scaleStatus === 'MEASUREMENT_REVIEW_REQUIRED') {
    return { ok: false, code: 'MEASUREMENT_REVIEW_REQUIRED' };
  }
  return { ok: true };
}

export function sumCostComponents(
  components: Array<{
    componentType: PlanCostComponentType;
    quantity: number;
    unitCostCents: number | null;
    costProvenance: PlanCostProvenance;
  }>,
): {
  byType: Record<PlanCostComponentType, number | null>;
  missing: string[];
  complete: boolean;
  directTotalCents: number | null;
} {
  const byType: Record<PlanCostComponentType, number | null> = {
    MATERIAL: 0,
    LABOUR: 0,
    SITE: 0,
    OTHER: 0,
  };
  const missing: string[] = [];
  let anyPresent = false;

  for (const c of components) {
    if (c.unitCostCents == null || c.costProvenance === 'MISSING' || !Number.isInteger(c.unitCostCents)) {
      missing.push(`${c.componentType}:COST_MISSING`);
      byType[c.componentType] = null;
      continue;
    }
    if (c.unitCostCents < 0) {
      missing.push(`${c.componentType}:INVALID_COST`);
      byType[c.componentType] = null;
      continue;
    }
    anyPresent = true;
    const line = Math.round(c.quantity * c.unitCostCents);
    if (byType[c.componentType] == null) {
      // was marked missing earlier — keep null if any missing in type? Prefer sum only known.
      // Spec: if required cost missing overall → incomplete. Sum known amounts separately.
    }
    const current = byType[c.componentType];
    byType[c.componentType] = (current ?? 0) + line;
  }

  // Reset types that had missing after partial sums
  for (const c of components) {
    if (c.unitCostCents == null || c.costProvenance === 'MISSING') {
      byType[c.componentType] = null;
    }
  }

  const incomplete = missing.length > 0 || !anyPresent;
  if (incomplete && components.length === 0) {
    return {
      byType,
      missing: ['COST_ESTIMATE_INCOMPLETE'],
      complete: false,
      directTotalCents: null,
    };
  }

  if (missing.length > 0) {
    return {
      byType,
      missing: ['COST_ESTIMATE_INCOMPLETE', ...missing],
      complete: false,
      directTotalCents: null,
    };
  }

  const directTotalCents =
    (byType.MATERIAL ?? 0) + (byType.LABOUR ?? 0) + (byType.SITE ?? 0) + (byType.OTHER ?? 0);
  return { byType, missing: [], complete: true, directTotalCents };
}

export function buildPlanEstimateSummary(input: {
  components: Array<{
    componentType: PlanCostComponentType;
    quantity: number;
    unitCostCents: number | null;
    costProvenance: PlanCostProvenance;
  }>;
  sell: PlanEstimateSellInput;
}): PlanEstimateSummary {
  const costs = sumCostComponents(input.components);
  const sell = input.sell.proposedSellExVatCents;
  const sellOk = sell != null && Number.isInteger(sell) && sell >= 0 && input.sell.sellSource !== 'MISSING';

  let estimatedGrossProfitCents: number | null = null;
  let estimatedGrossMarginBps: number | null = null;
  let gpIncomplete = true;

  if (costs.complete && sellOk && costs.directTotalCents != null && sell != null) {
    estimatedGrossProfitCents = sell - costs.directTotalCents;
    estimatedGrossMarginBps = sell > 0 ? Math.round((estimatedGrossProfitCents * 10_000) / sell) : null;
    gpIncomplete = false;
  }

  return {
    materialsCostCents: costs.byType.MATERIAL,
    labourCostCents: costs.byType.LABOUR,
    siteCostCents: costs.byType.SITE,
    otherCostCents: costs.byType.OTHER,
    directCostTotalCents: costs.directTotalCents,
    costEstimateIncomplete: !costs.complete,
    missingCostReasons: costs.missing,
    proposedSellExVatCents: sellOk ? sell : null,
    estimatedGrossProfitCents,
    estimatedGrossMarginBps,
    gpIncomplete,
    vatNote:
      'Estimated costs and proposed sell are VAT-exclusive; VAT via canonical tax handling on quote',
  };
}

export function estimateRequiresReview(items: Array<{ confidence: PlanItemConfidence }>): boolean {
  return items.some(
    (i) => i.confidence === 'REVIEW_REQUIRED' || i.confidence === 'INSUFFICIENT_INFORMATION',
  );
}

export function resolvePlanEstimateStatus(input: {
  items: Array<{ confidence: PlanItemConfidence }>;
  explicitStatus?: PlanEstimateStatus | null;
}): PlanEstimateStatus {
  if (input.explicitStatus === 'SUPERSEDED') return 'SUPERSEDED';
  if (input.explicitStatus === 'APPROVED_FOR_QUOTE') return 'APPROVED_FOR_QUOTE';
  if (input.explicitStatus === 'REVIEWED') return 'REVIEWED';
  if (estimateRequiresReview(input.items) || input.explicitStatus === 'REVIEW_REQUIRED') {
    return 'REVIEW_REQUIRED';
  }
  return input.explicitStatus ?? 'DRAFT_TAKEOFF';
}

export function assertCanApproveForQuote(status: PlanEstimateStatus): void {
  if (status === 'REVIEW_REQUIRED' || status === 'DRAFT_TAKEOFF') {
    throw new Error('PLAN_ESTIMATE_REVIEW_REQUIRED');
  }
  if (status === 'SUPERSEDED') {
    throw new Error('PLAN_ESTIMATE_SUPERSEDED');
  }
  if (status !== 'REVIEWED' && status !== 'APPROVED_FOR_QUOTE') {
    throw new Error('PLAN_ESTIMATE_NOT_APPROVABLE');
  }
}

export function assertCanGenerateDraftQuote(status: PlanEstimateStatus): void {
  if (status !== 'APPROVED_FOR_QUOTE') {
    throw new Error('PLAN_ESTIMATE_NOT_APPROVED_FOR_QUOTE');
  }
}

/** Map take-off items → draft quote line inputs (customer-safe descriptions only). */
export function mapEstimateItemsToQuoteLines(input: {
  items: Array<{
    description: string;
    quantity: number;
    customerVisibleScopeText?: string | null;
    confidence: PlanItemConfidence;
    pointType: PlanTakeoffPointType;
  }>;
  unitPriceCentsByIndex?: Array<number | null>;
  defaultUnitPriceCents?: number;
}): Array<{
  description: string;
  quantity: number;
  unitPriceCents: number;
  category: 'scope' | 'materials' | 'labour' | 'other';
  customerVisible: true;
}> {
  return input.items
    .filter((i) => i.confidence === 'CONFIRMED')
    .map((item, index) => ({
      description: (item.customerVisibleScopeText?.trim() || item.description).trim(),
      quantity: item.quantity,
      unitPriceCents:
        input.unitPriceCentsByIndex?.[index] ??
        input.defaultUnitPriceCents ??
        0,
      category:
        item.pointType === 'GEYSER'
          ? ('scope' as const)
          : item.pointType === 'OTHER'
            ? ('other' as const)
            : ('materials' as const),
      customerVisible: true as const,
    }));
}

export function buildPlanVsActualComparison(input: {
  estimateSummary: PlanEstimateSummary;
  jobComplete: boolean;
  actual?: {
    materialsCostCents?: number | null;
    labourCostCents?: number | null;
    otherDirectCostCents?: number | null;
    revenueCents?: number | null;
    grossProfitCents?: number | null;
    actualCostComplete?: boolean;
  } | null;
}): PlanVsActualComparison {
  const est = {
    materialsCostCents: input.estimateSummary.materialsCostCents,
    labourCostCents: input.estimateSummary.labourCostCents,
    siteCostCents: input.estimateSummary.siteCostCents,
    directCostCents: input.estimateSummary.directCostTotalCents,
    sellExVatCents: input.estimateSummary.proposedSellExVatCents,
    grossProfitCents: input.estimateSummary.estimatedGrossProfitCents,
  };

  if (!input.actual) {
    return {
      status: 'NO_JOB',
      estimated: est,
      actual: {
        materialsCostCents: null,
        labourCostCents: null,
        otherDirectCostCents: null,
        directCostCents: null,
        revenueCents: null,
        grossProfitCents: null,
      },
      variance: {
        materialsCostCents: null,
        labourCostCents: null,
        directCostCents: null,
        revenueCents: null,
        profitCents: null,
      },
    };
  }

  const actualCostComplete = input.actual.actualCostComplete !== false;
  const materials = input.actual.materialsCostCents ?? null;
  const labour = input.actual.labourCostCents ?? null;
  const other = input.actual.otherDirectCostCents ?? null;
  const direct =
    materials != null && labour != null && other != null ? materials + labour + other : null;
  const revenue = input.actual.revenueCents ?? null;
  const gp = input.actual.grossProfitCents ?? null;

  let status: PlanVsActualComparison['status'] = 'PROVISIONAL';
  if (!actualCostComplete) status = 'ACTUAL_COST_INCOMPLETE';
  else if (input.jobComplete) status = 'FINAL';

  const diff = (a: number | null, b: number | null) =>
    a != null && b != null ? a - b : null;

  return {
    status,
    estimated: est,
    actual: {
      materialsCostCents: materials,
      labourCostCents: labour,
      otherDirectCostCents: other,
      directCostCents: direct,
      revenueCents: revenue,
      grossProfitCents: gp,
    },
    variance: {
      materialsCostCents: diff(materials, est.materialsCostCents),
      labourCostCents: diff(labour, est.labourCostCents),
      directCostCents: diff(direct, est.directCostCents),
      revenueCents: diff(revenue, est.sellExVatCents),
      profitCents: diff(gp, est.grossProfitCents),
    },
  };
}

export function canManagePlanEstimates(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function canApprovePlanEstimate(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*')) return true;
  return role === 'owner' || role === 'company owner' || role === 'manager' || role === 'admin';
}

export function projectCustomerSafePlanQuote(input: {
  description: string;
  quantity: number;
  unitPriceCents: number;
  officialNumber?: string | null;
}): {
  description: string;
  quantity: number;
  unitPriceCents: number;
  officialNumber: string | null;
} {
  return {
    description: input.description,
    quantity: input.quantity,
    unitPriceCents: input.unitPriceCents,
    officialNumber: input.officialNumber ?? null,
  };
}

export function assertNoPlanEstimateInternalLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoPlanEstimateInternalLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'unitCostCents',
    'directCostTotalCents',
    'estimatedGrossProfitCents',
    'estimatedGrossMarginBps',
    'costProvenance',
    'confidence',
    'scaleStatus',
    'supplierCost',
    'materialsCostCents',
    'labourCostCents',
    'siteCostCents',
    'planEstimateInternal',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Plan estimate internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') assertNoPlanEstimateInternalLeak(value, `${path}.${key}`);
  }
}

export type PlanEstimateAuditEventType =
  | 'plan_estimate_created'
  | 'plan_document_linked'
  | 'plan_takeoff_item_added'
  | 'plan_takeoff_item_changed'
  | 'plan_takeoff_item_removed'
  | 'plan_estimate_review_requested'
  | 'plan_estimate_reviewed'
  | 'plan_estimate_approved'
  | 'plan_estimate_superseded'
  | 'plan_quote_generated'
  | 'plan_estimate_job_linked';

export function buildPlanEstimateAuditEvent(input: {
  eventType: PlanEstimateAuditEventType;
  companyId: string;
  estimateId: string;
  actorId?: string | null;
  sourceDocumentId?: string | null;
  before?: unknown;
  after?: unknown;
}): {
  companyId: string;
  action: PlanEstimateAuditEventType;
  entityType: 'plan_estimate';
  entityId: string;
  metadata: Record<string, unknown>;
} {
  return {
    companyId: input.companyId,
    action: input.eventType,
    entityType: 'plan_estimate',
    entityId: input.estimateId,
    metadata: {
      eventType: input.eventType,
      estimateId: input.estimateId,
      actorId: input.actorId ?? null,
      sourceDocumentId: input.sourceDocumentId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      timestamp: new Date().toISOString(),
      customerFacing: false,
    },
  };
}

export function assertRoyalCapePlanEstimateUnchanged(input: {
  quoteId: string;
  totalCents: number;
  xeroQuoteId: string | null | undefined;
  customerId: string;
  jobId: string | null | undefined;
  pricingPresentationMode?: string | null;
}): void {
  const rc = PLAN_ESTIMATE_ROYAL_CAPE;
  if (input.quoteId !== rc.royalCapeQuoteId) throw new Error('Royal Cape quote id mismatch');
  if (input.totalCents !== rc.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if ((input.xeroQuoteId ?? null) !== rc.royalCapeXeroQuoteId) {
    throw new Error('Royal Cape Xero quote id changed');
  }
  if (input.customerId !== rc.canonicalCustomerId) throw new Error('Royal Cape customer changed');
  if ((input.jobId ?? null) !== rc.jobId) throw new Error('Royal Cape job changed');
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== rc.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function assertRow92StillInactiveForPlanEstimate(input: {
  status: string;
  globalAutomationEnabled: boolean;
}): void {
  assertRow92GlobalAutomationDisabled(input.globalAutomationEnabled);
  if (input.status === 'ACTIVE') {
    throw new Error('Row 94 must not activate Row 92');
  }
}

export function assertRow95NotStarted(started: boolean): void {
  if (started) throw new Error('Row 95 must not start during Row 94');
}
export function assertRow96NotStarted(started: boolean): void {
  if (started) throw new Error('Row 96 must not start during Row 94');
}
export function assertRow98AiTakeoffNotStarted(started: boolean): void {
  if (started) throw new Error('Row 98 AI take-off must not start during Row 94');
}
export function assertRow94NoXeroWrites(n: number): void {
  if (n !== 0) throw new Error('Row 94 requires Xero writes = 0');
}
export function assertRow94NoCustomerSends(n: number): void {
  if (n !== 0) throw new Error('Row 94 requires customer sends = 0');
}
export function assertRow94NoProductionWrites(n: number): void {
  if (n !== 0) throw new Error('Row 94 requires production writes = 0');
}

export function nextPlanEstimateVersion(current: number): number {
  return current + 1;
}

export function planRevisionRequiresReview(input: {
  previousRevisionLabel: string | null;
  nextRevisionLabel: string | null;
}): { changed: boolean; flags: string[] } {
  const prev = (input.previousRevisionLabel ?? '').trim();
  const next = (input.nextRevisionLabel ?? '').trim();
  if (prev && next && prev !== next) {
    return { changed: true, flags: ['PLAN_REVISION_CHANGED', 'ESTIMATE_REVIEW_REQUIRED'] };
  }
  return { changed: false, flags: [] };
}
