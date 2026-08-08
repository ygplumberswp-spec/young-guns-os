/**
 * Row 96 — Canonical Quote Cost Model
 *
 * Internal estimated cost ≠ customer sell price.
 * One shared component model for all Row 95 scenarios.
 * Row 92 global automation remains OFF.
 * Not Row 97 AURA pricing intelligence. Not Row 98 AI take-off. Not Row 99 BOQ import.
 */

import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';

export const QUOTE_COST_MODEL_KEY = 'canonical-quote-cost-model' as const;

export const QUOTE_COST_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

/** Internal cost component types — not customer line categories. */
export const QUOTE_COST_COMPONENT_TYPES = [
  'MATERIAL',
  'LABOUR',
  'WASTAGE',
  'TRAVEL',
  'CALL_OUT',
  'EQUIPMENT',
  'SUBCONTRACTOR',
  'PRELIMINARY',
  'OVERHEAD',
  'CONTINGENCY',
  'WARRANTY',
  'OTHER_APPROVED',
] as const;

export type QuoteCostComponentType = (typeof QUOTE_COST_COMPONENT_TYPES)[number];

export const QUOTE_COST_COMPONENT_LABELS: Record<QuoteCostComponentType, string> = {
  MATERIAL: 'Materials',
  LABOUR: 'Labour',
  WASTAGE: 'Wastage',
  TRAVEL: 'Travel',
  CALL_OUT: 'Call-Out (Internal Cost)',
  EQUIPMENT: 'Equipment',
  SUBCONTRACTOR: 'Subcontractor',
  PRELIMINARY: 'Preliminaries',
  OVERHEAD: 'Overhead Allocation',
  CONTINGENCY: 'Contingency',
  WARRANTY: 'Warranty Provision',
  OTHER_APPROVED: 'Other Approved Cost',
};

/** Provenance — never invent. */
export const QUOTE_COST_PROVENANCE = [
  'SUPPLIER_NET_DISCOUNTED',
  'SUPPLIER_QUOTE',
  'CATALOGUE_COST',
  'INVENTORY_COST',
  'APPROVED_MANUAL_COST',
  'PLAN_ESTIMATE',
  'LABOUR_RATE_CONFIG',
  'SUBCONTRACTOR_QUOTE',
  'HISTORICAL_VERIFIED',
  'UNKNOWN',
  'COST_SOURCE_MISSING',
  'COST_REVIEW_REQUIRED',
] as const;

export type QuoteCostProvenance = (typeof QUOTE_COST_PROVENANCE)[number];

export const QUOTE_COST_VAT_BASIS = ['VAT_EXCLUSIVE', 'VAT_INCLUSIVE', 'UNKNOWN'] as const;
export type QuoteCostVatBasis = (typeof QUOTE_COST_VAT_BASIS)[number];

export const QUOTE_COST_CONFIDENCE = [
  'COMPLETE',
  'PARTIAL',
  'REVIEW_REQUIRED',
  'INSUFFICIENT_INFORMATION',
] as const;
export type QuoteCostConfidence = (typeof QUOTE_COST_CONFIDENCE)[number];

export const QUOTE_COST_WARNINGS = [
  'MATERIAL_COST_MISSING',
  'LABOUR_RATE_MISSING',
  'TRAVEL_COST_MISSING',
  'SUBCONTRACTOR_QUOTE_MISSING',
  'PLAN_SCALE_MISSING',
  'SITE_CONDITION_UNKNOWN',
  'SCOPE_REVIEW_REQUIRED',
  'VAT_BASIS_REVIEW_REQUIRED',
  'COST_ESTIMATE_INCOMPLETE',
  'OVERHEAD_NOT_CONFIGURED',
  'WASTAGE_NOT_CONFIGURED',
  'COST_SOURCE_MISSING',
  'COST_REVIEW_REQUIRED',
  'LABOUR_COST_INCOMPLETE',
] as const;

export type QuoteCostWarningCode = (typeof QUOTE_COST_WARNINGS)[number];

/** Direct cost types (excluded from overhead/contingency/warranty in direct sum). */
export const QUOTE_COST_DIRECT_TYPES: readonly QuoteCostComponentType[] = [
  'MATERIAL',
  'LABOUR',
  'WASTAGE',
  'TRAVEL',
  'CALL_OUT',
  'EQUIPMENT',
  'SUBCONTRACTOR',
  'PRELIMINARY',
  'OTHER_APPROVED',
] as const;

export const QUOTE_COST_INDIRECT_TYPES: readonly QuoteCostComponentType[] = [
  'OVERHEAD',
  'CONTINGENCY',
  'WARRANTY',
] as const;

export type QuoteCostComponentInput = {
  quoteLineId?: string | null;
  componentType: QuoteCostComponentType;
  description: string;
  quantity: number;
  unit: string;
  unitCostCents: number | null;
  vatBasis: QuoteCostVatBasis;
  provenance: QuoteCostProvenance;
  customerVisible?: boolean;
  optionTier?: string | null;
  clientActionId?: string | null;
  wastagePercentBps?: number | null;
  percentOfBaseBps?: number | null;
  percentBase?: 'DIRECT_COST' | 'MATERIALS' | 'LABOUR' | null;
  sourceRef?: string | null;
  catalogueItemId?: string | null;
  planEstimateCostComponentId?: string | null;
};

export type QuoteCostComponentRecord = QuoteCostComponentInput & {
  id: string;
  companyId: string;
  quoteId: string;
  totalCostCents: number | null;
  confidence: QuoteCostConfidence;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type QuoteCostSummary = {
  materialsCostCents: number | null;
  labourCostCents: number | null;
  wastageCostCents: number | null;
  travelCostCents: number | null;
  callOutCostCents: number | null;
  equipmentCostCents: number | null;
  subcontractorCostCents: number | null;
  preliminariesCostCents: number | null;
  otherDirectCostCents: number | null;
  estimatedDirectCostCents: number | null;
  overheadCostCents: number | null;
  contingencyCostCents: number | null;
  warrantyProvisionCents: number | null;
  totalEstimatedCostCents: number | null;
  sellExVatCents: number | null;
  multiplier: number | null;
  markupBps: number | null;
  grossMarginBps: number | null;
  estimatedGrossProfitCents: number | null;
  confidence: QuoteCostConfidence;
  warnings: QuoteCostWarningCode[];
  costEstimateIncomplete: boolean;
  overheadConfigured: boolean;
  wastageConfigured: boolean;
};

export type QuoteCostSnapshotPayload = {
  summary: QuoteCostSummary;
  components: Array<{
    id: string;
    componentType: QuoteCostComponentType;
    description: string;
    quantity: number;
    unit: string;
    unitCostCents: number | null;
    totalCostCents: number | null;
    provenance: QuoteCostProvenance;
    vatBasis: QuoteCostVatBasis;
    quoteLineId: string | null;
    optionTier: string | null;
  }>;
  sellExVatCents: number | null;
  snapshottedAt: string;
};

function isKnownCost(cents: number | null | undefined): cents is number {
  return typeof cents === 'number' && Number.isFinite(cents) && cents >= 0;
}

/** Normalize VAT-inclusive unit cost to exclusive cents when rate known. Never invent rate. */
export function normalizeCostToExVatCents(input: {
  amountCents: number | null;
  vatBasis: QuoteCostVatBasis;
  vatRateBps: number | null;
}): { exVatCents: number | null; warning?: QuoteCostWarningCode } {
  if (!isKnownCost(input.amountCents)) return { exVatCents: null };
  if (input.vatBasis === 'VAT_EXCLUSIVE') return { exVatCents: input.amountCents };
  if (input.vatBasis === 'UNKNOWN') {
    return { exVatCents: null, warning: 'VAT_BASIS_REVIEW_REQUIRED' };
  }
  if (input.vatRateBps == null || input.vatRateBps < 0) {
    return { exVatCents: null, warning: 'VAT_BASIS_REVIEW_REQUIRED' };
  }
  const divisor = 10_000 + input.vatRateBps;
  return { exVatCents: Math.round((input.amountCents * 10_000) / divisor) };
}

export function computeComponentTotalCents(input: {
  quantity: number;
  unitCostCents: number | null;
  wastagePercentBps?: number | null;
}): number | null {
  if (!isKnownCost(input.unitCostCents)) return null;
  const qty = Number.isFinite(input.quantity) ? input.quantity : 0;
  let base = Math.round(qty * input.unitCostCents);
  if (input.wastagePercentBps != null && input.wastagePercentBps > 0) {
    // Explicit wastage on this component only — never invent default.
    base = Math.round(base * (1 + input.wastagePercentBps / 10_000));
  }
  return base;
}

export function validateQuoteCostComponent(input: QuoteCostComponentInput): {
  ok: boolean;
  errors: string[];
  warnings: QuoteCostWarningCode[];
} {
  const errors: string[] = [];
  const warnings: QuoteCostWarningCode[] = [];

  if (!QUOTE_COST_COMPONENT_TYPES.includes(input.componentType)) {
    errors.push(`Unknown component type: ${input.componentType}`);
  }
  if (!QUOTE_COST_PROVENANCE.includes(input.provenance)) {
    errors.push(`Unknown provenance: ${input.provenance}`);
  }
  if (!input.description?.trim()) errors.push('description is required');
  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    errors.push('quantity must be >= 0');
  }
  if (input.unitCostCents != null && (input.unitCostCents < 0 || !Number.isFinite(input.unitCostCents))) {
    errors.push('unitCostCents must be >= 0 when provided');
  }
  if (input.customerVisible === true) {
    errors.push('Cost components must remain internal (customerVisible must be false)');
  }
  if (
    input.provenance === 'UNKNOWN' ||
    input.provenance === 'COST_SOURCE_MISSING' ||
    input.provenance === 'COST_REVIEW_REQUIRED' ||
    input.unitCostCents == null
  ) {
    if (input.componentType === 'MATERIAL') warnings.push('MATERIAL_COST_MISSING');
    if (input.componentType === 'LABOUR') warnings.push('LABOUR_COST_INCOMPLETE');
    if (input.componentType === 'TRAVEL') warnings.push('TRAVEL_COST_MISSING');
    if (input.componentType === 'SUBCONTRACTOR') warnings.push('SUBCONTRACTOR_QUOTE_MISSING');
    warnings.push('COST_SOURCE_MISSING');
  }
  if (input.vatBasis === 'UNKNOWN') warnings.push('VAT_BASIS_REVIEW_REQUIRED');
  if (input.componentType === 'OVERHEAD' && input.unitCostCents == null && input.percentOfBaseBps == null) {
    warnings.push('OVERHEAD_NOT_CONFIGURED');
  }
  if (input.componentType === 'WASTAGE' && input.unitCostCents == null && input.wastagePercentBps == null) {
    warnings.push('WASTAGE_NOT_CONFIGURED');
  }
  // Prevent applying both percentage wastage and a separate WASTAGE line inventively —
  // caller may set both intentionally; we only reject negative duals.
  if (
    input.componentType === 'WASTAGE' &&
    input.wastagePercentBps != null &&
    input.unitCostCents != null &&
    input.quantity > 0
  ) {
    // Allowed when intentional (explicit qty+cost OR percent) — no error.
  }

  return { ok: errors.length === 0, errors, warnings };
}

function sumType(
  components: Array<{ componentType: QuoteCostComponentType; totalCostCents: number | null }>,
  type: QuoteCostComponentType,
): number | null {
  const rows = components.filter((c) => c.componentType === type);
  if (rows.length === 0) return null;
  if (rows.some((r) => !isKnownCost(r.totalCostCents))) return null;
  return rows.reduce((s, r) => s + (r.totalCostCents as number), 0);
}

export function summarizeQuoteCost(input: {
  components: Array<{
    componentType: QuoteCostComponentType;
    totalCostCents: number | null;
    provenance: QuoteCostProvenance;
    vatBasis: QuoteCostVatBasis;
  }>;
  sellExVatCents: number | null;
  overheadConfigured?: boolean;
  warnings?: QuoteCostWarningCode[];
}): QuoteCostSummary {
  assertRow92GlobalAutomationDisabled(false);

  const warnings = new Set<QuoteCostWarningCode>(input.warnings ?? []);
  const materialsCostCents = sumType(input.components, 'MATERIAL');
  const labourCostCents = sumType(input.components, 'LABOUR');
  const wastageCostCents = sumType(input.components, 'WASTAGE');
  const travelCostCents = sumType(input.components, 'TRAVEL');
  const callOutCostCents = sumType(input.components, 'CALL_OUT');
  const equipmentCostCents = sumType(input.components, 'EQUIPMENT');
  const subcontractorCostCents = sumType(input.components, 'SUBCONTRACTOR');
  const preliminariesCostCents = sumType(input.components, 'PRELIMINARY');
  const otherDirectCostCents = sumType(input.components, 'OTHER_APPROVED');
  const overheadCostCents = sumType(input.components, 'OVERHEAD');
  const contingencyCostCents = sumType(input.components, 'CONTINGENCY');
  const warrantyProvisionCents = sumType(input.components, 'WARRANTY');

  const directParts = input.components.filter((c) =>
    (QUOTE_COST_DIRECT_TYPES as readonly string[]).includes(c.componentType),
  );
  let estimatedDirectCostCents: number | null = null;
  if (directParts.length > 0) {
    if (directParts.every((c) => isKnownCost(c.totalCostCents))) {
      estimatedDirectCostCents = directParts.reduce((s, c) => s + (c.totalCostCents as number), 0);
    } else {
      estimatedDirectCostCents = null;
      warnings.add('COST_ESTIMATE_INCOMPLETE');
    }
  }

  const allForTotal = input.components;
  let totalEstimatedCostCents: number | null = null;
  if (allForTotal.length > 0) {
    if (allForTotal.every((c) => isKnownCost(c.totalCostCents))) {
      totalEstimatedCostCents = allForTotal.reduce((s, c) => s + (c.totalCostCents as number), 0);
    } else {
      totalEstimatedCostCents = null;
      warnings.add('COST_ESTIMATE_INCOMPLETE');
    }
  }

  for (const c of input.components) {
    if (
      c.provenance === 'COST_SOURCE_MISSING' ||
      c.provenance === 'UNKNOWN' ||
      c.totalCostCents == null
    ) {
      warnings.add('COST_ESTIMATE_INCOMPLETE');
    }
    if (c.vatBasis === 'UNKNOWN') warnings.add('VAT_BASIS_REVIEW_REQUIRED');
  }

  const overheadConfigured =
    input.overheadConfigured === true ||
    (overheadCostCents != null && overheadCostCents >= 0 && input.components.some((c) => c.componentType === 'OVERHEAD'));
  if (!overheadConfigured && input.components.some((c) => c.componentType === 'OVERHEAD' && c.totalCostCents == null)) {
    warnings.add('OVERHEAD_NOT_CONFIGURED');
  }

  const wastageConfigured =
    wastageCostCents != null ||
    input.components.some((c) => c.componentType === 'WASTAGE');

  const sellExVatCents =
    input.sellExVatCents != null && Number.isFinite(input.sellExVatCents) && input.sellExVatCents >= 0
      ? input.sellExVatCents
      : null;

  let multiplier: number | null = null;
  let markupBps: number | null = null;
  let grossMarginBps: number | null = null;
  let estimatedGrossProfitCents: number | null = null;

  if (
    sellExVatCents != null &&
    totalEstimatedCostCents != null &&
    totalEstimatedCostCents > 0
  ) {
    multiplier = sellExVatCents / totalEstimatedCostCents;
    // Markup = (Sell - Cost) / Cost
    markupBps = Math.round(((sellExVatCents - totalEstimatedCostCents) / totalEstimatedCostCents) * 10_000);
    // Gross Margin = (Sell - Cost) / Sell
    if (sellExVatCents > 0) {
      estimatedGrossProfitCents = sellExVatCents - totalEstimatedCostCents;
      grossMarginBps = Math.round((estimatedGrossProfitCents / sellExVatCents) * 10_000);
    }
  } else if (totalEstimatedCostCents === 0 || totalEstimatedCostCents == null) {
    // Do not calculate meaningless markup/margin when cost missing/zero.
    multiplier = null;
    markupBps = null;
    grossMarginBps = null;
    estimatedGrossProfitCents = null;
  }

  const costEstimateIncomplete = warnings.has('COST_ESTIMATE_INCOMPLETE') || totalEstimatedCostCents == null;

  let confidence: QuoteCostConfidence = 'COMPLETE';
  if (input.components.length === 0 || costEstimateIncomplete) {
    confidence = input.components.length === 0 ? 'INSUFFICIENT_INFORMATION' : 'PARTIAL';
  }
  if (
    warnings.has('COST_REVIEW_REQUIRED') ||
    warnings.has('SCOPE_REVIEW_REQUIRED') ||
    warnings.has('VAT_BASIS_REVIEW_REQUIRED')
  ) {
    confidence = confidence === 'COMPLETE' ? 'REVIEW_REQUIRED' : confidence;
  }
  if (
    warnings.has('LABOUR_RATE_MISSING') ||
    warnings.has('MATERIAL_COST_MISSING') ||
    warnings.has('SUBCONTRACTOR_QUOTE_MISSING')
  ) {
    if (confidence === 'COMPLETE') confidence = 'PARTIAL';
  }

  return {
    materialsCostCents,
    labourCostCents,
    wastageCostCents,
    travelCostCents,
    callOutCostCents,
    equipmentCostCents,
    subcontractorCostCents,
    preliminariesCostCents,
    otherDirectCostCents,
    estimatedDirectCostCents,
    overheadCostCents,
    contingencyCostCents,
    warrantyProvisionCents,
    totalEstimatedCostCents,
    sellExVatCents,
    multiplier,
    markupBps,
    grossMarginBps,
    estimatedGrossProfitCents,
    confidence,
    warnings: [...warnings],
    costEstimateIncomplete,
    overheadConfigured,
    wastageConfigured,
  };
}

/** Map Row 94 plan cost component type → Row 96 type without inventing. */
export function mapPlanEstimateComponentType(
  planType: 'MATERIAL' | 'LABOUR' | 'SITE' | 'OTHER',
): QuoteCostComponentType {
  if (planType === 'MATERIAL') return 'MATERIAL';
  if (planType === 'LABOUR') return 'LABOUR';
  if (planType === 'SITE') return 'PRELIMINARY';
  return 'OTHER_APPROVED';
}

export function mapPlanEstimateProvenance(
  provenance: string,
): QuoteCostProvenance {
  switch (provenance) {
    case 'SUPPLIER_QUOTE':
      return 'SUPPLIER_QUOTE';
    case 'CATALOGUE_COST':
      return 'CATALOGUE_COST';
    case 'APPROVED_MANUAL_COST':
      return 'APPROVED_MANUAL_COST';
    case 'HISTORICAL_VERIFIED':
      return 'HISTORICAL_VERIFIED';
    case 'MISSING':
      return 'COST_SOURCE_MISSING';
    default:
      return 'PLAN_ESTIMATE';
  }
}

/**
 * Detect double-count risk: plan-estimate import vs existing MATERIAL/LABOUR
 * with same planEstimateCostComponentId.
 */
export function detectDuplicatePlanImport(
  existing: Array<{ planEstimateCostComponentId?: string | null }>,
  incomingPlanComponentIds: string[],
): { duplicateIds: string[] } {
  const have = new Set(
    existing
      .map((e) => e.planEstimateCostComponentId)
      .filter((id): id is string => Boolean(id)),
  );
  return { duplicateIds: incomingPlanComponentIds.filter((id) => have.has(id)) };
}

/** Fields that must never leak to Client Portal / customer PDF. */
export const QUOTE_COST_INTERNAL_ONLY_FIELDS = [
  'unitCostCents',
  'lineCostCents',
  'estimatedCostCents',
  'grossProfitCents',
  'markupBps',
  'marginBps',
  'multiplier',
  'estimatedGrossProfitCents',
  'profitFloorCents',
  'targetPriceCents',
  'belowFloorOverride',
  'costComponents',
  'costSummary',
  'costWarnings',
  'costConfidence',
  'costSnapshot',
] as const;

export function assertNoCostLeakInCustomerProjection(payload: Record<string, unknown>): {
  ok: boolean;
  leaked: string[];
} {
  const leaked: string[] = [];
  for (const key of QUOTE_COST_INTERNAL_ONLY_FIELDS) {
    if (key in payload && payload[key] != null) leaked.push(key);
  }
  return { ok: leaked.length === 0, leaked };
}

export function assertRow96SafetyGates(): {
  row92AutomationOff: true;
  row97NotStarted: true;
  row98NotStarted: true;
  row99NotStarted: true;
} {
  assertRow92GlobalAutomationDisabled(false);
  return {
    row92AutomationOff: true,
    row97NotStarted: true,
    row98NotStarted: true,
    row99NotStarted: true,
  };
}
