/**
 * Job Profitability Engine (JPE-001)
 *
 * Computes accrual and cash profitability from real TITAN job financial sources.
 * Never invents revenue or costs — uses authoritative hierarchy for revenue and
 * cost-price material/labour/direct cost aggregation with idempotent source linkage.
 */

import type { QuoteLineCategory } from './finance.js';
import { canViewFinanceProfit } from './finance-tenant-pricebook.js';
import {
  materialLineCostCents,
  sumMaterialLinesCents,
  sumQuoteCategoryCents,
  sumReturnedMaterialCents,
} from './job-costing.js';

export const JPE_CALCULATION_VERSION = 1;

export type JobRevenueSource = 'invoice' | 'approved_quote' | 'manual_adjustment' | 'none';

export type ProfitabilityStatus = 'excellent' | 'healthy' | 'warning' | 'loss' | 'unknown';

export type ProfitabilityCompleteness =
  | 'complete'
  | 'incomplete_materials'
  | 'incomplete_labour'
  | 'incomplete_revenue'
  | 'incomplete_expenses'
  | 'incomplete_multiple';

export type MarginLeakageType =
  | 'MATERIAL_OVERRUN'
  | 'LABOUR_OVERRUN'
  | 'OTHER_COST_OVERRUN'
  | 'REVENUE_SHORTFALL'
  | 'CUSTOMER_DISCOUNT'
  | 'REFUND_CREDIT'
  | 'SUBCONTRACTOR_OVERRUN'
  | 'UNPAID_INVOICE'
  | 'MISSING_EXPENSE_ALLOCATION'
  | 'MISSING_LABOUR_ENTRIES'
  | 'MATERIAL_WASTE'
  | 'SUPPLIER_PRICE_OVERRUN'
  | 'REPEAT_VISIT'
  | 'UNQUOTED_WORK';

export type MarginLeakageSeverity = 'info' | 'warning' | 'critical';

export type MarginLeakageFlag = {
  type: MarginLeakageType;
  severity: MarginLeakageSeverity;
  expected: number | null;
  actual: number | null;
  variance: number | null;
  message: string;
};

export type ProfitabilityThresholds = {
  excellentMarginBps: number;
  healthyMarginBps: number;
  warningMarginBps: number;
};

export type JobProfitabilityCostTransaction = {
  id: string;
  category: 'material' | 'labour' | 'other';
  description: string;
  amountCents: number;
  source: string;
  sourceRecordId: string | null;
  date: string | null;
  enteredByUserId: string | null;
  isPaid: boolean;
  notes: string | null;
};

export type JobProfitabilitySummary = {
  jobId: string;
  currency: string;
  revenueSource: JobRevenueSource;
  quotedAmountCents: number;
  approvedAmountCents: number;
  invoiceAmountCents: number;
  creditAdjustmentCents: number;
  jobRevenueCents: number;
  jobRevenueExVatCents: number | null;
  materialCostCents: number;
  labourCostCents: number;
  otherDirectCostCents: number;
  totalDirectCostCents: number;
  grossProfitCents: number;
  grossMarginPct: number | null;
  materialPctOfRevenue: number | null;
  labourPctOfRevenue: number | null;
  otherCostPctOfRevenue: number | null;
  status: ProfitabilityStatus;
  calculatedAt: string;
  calculationVersion: number;
};

export type JobProfitabilityExpectedActual = {
  expectedRevenueCents: number;
  expectedMaterialCostCents: number;
  expectedLabourCostCents: number;
  expectedOtherCostCents: number;
  expectedTotalCostCents: number;
  expectedGrossProfitCents: number;
  expectedGrossMarginPct: number | null;
  actualRevenueCents: number;
  actualMaterialCostCents: number;
  actualLabourCostCents: number;
  actualOtherDirectCostCents: number;
  actualTotalCostCents: number;
  actualGrossProfitCents: number;
  actualGrossMarginPct: number | null;
};

export type JobProfitabilityVariance = {
  revenueVarianceCents: number;
  materialCostVarianceCents: number;
  labourCostVarianceCents: number;
  otherCostVarianceCents: number;
  totalCostVarianceCents: number;
  profitVarianceCents: number;
  marginVariancePct: number | null;
};

export type JobProfitabilityCash = {
  cashCollectedCents: number;
  cashSpentCents: number;
  realisedCashProfitCents: number;
  uncollectedRevenueCents: number;
  unpaidJobCostsCents: number;
};

export type JobProfitabilityResult = {
  summary: JobProfitabilitySummary;
  expected: JobProfitabilityExpectedActual;
  variance: JobProfitabilityVariance;
  cash: JobProfitabilityCash;
  completeness: ProfitabilityCompleteness;
  completenessWarnings: string[];
  leakage: MarginLeakageFlag[];
  costTransactions: JobProfitabilityCostTransaction[];
  labourMinutes: number;
  primaryQuoteId: string | null;
};

export type JobProfitabilityAdjustmentKind =
  | 'revenue'
  | 'material_cost'
  | 'labour_cost'
  | 'other_direct_cost'
  | 'total_cost';

export type JobProfitabilityAdjustmentSummary = {
  id: string;
  jobId: string;
  kind: JobProfitabilityAdjustmentKind;
  amountCents: number;
  reason: string;
  createdByUserId: string;
  createdAt: string;
};

export type CreateJobProfitabilityAdjustmentRequest = {
  kind: JobProfitabilityAdjustmentKind;
  amountCents: number;
  reason: string;
};

type MaterialLineInput = {
  id: string;
  status: string;
  quantity: string;
  fulfilledQuantity: string | null;
  unitCostCents: number;
  materialSource: string;
  description: string;
  recordedByUserId: string;
  createdAt: string;
};

type PurchaseOrderInput = {
  id: string;
  referenceNumber: string;
  status: string;
  totalCostCents: number;
};

type InvoiceInput = {
  id: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  vatCents: number;
  amountPaidCents: number;
};

type QuoteInput = {
  id: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  lineItems: Array<{
    category: QuoteLineCategory;
    lineCostCents: number | null;
    lineSubtotalCents: number;
    isOptional: boolean;
  }>;
};

type LabourEntryInput = {
  id: string;
  userId: string;
  durationMinutes: number;
  startedAt: string;
  endedAt: string | null;
  approved: boolean;
  hourlyCostCents: number;
  overtimeMultiplier: number;
};

type DirectCostInput = {
  id: string;
  category: string;
  description: string;
  amountCents: number;
  sourceType: string;
  sourceId: string;
  costDate: string | null;
  enteredByUserId: string;
  isPaid: boolean;
  notes: string | null;
};

type AdjustmentInput = {
  id: string;
  kind: 'revenue' | 'material_cost' | 'labour_cost' | 'other_direct_cost' | 'total_cost';
  amountCents: number;
  reason: string;
  createdAt: string;
  createdByUserId: string;
};

export type ComputeJobProfitabilityInput = {
  jobId: string;
  currency: string;
  jobStatus: string;
  labourRateCentsPerHour: number;
  thresholds: ProfitabilityThresholds;
  materialLines: MaterialLineInput[];
  purchaseOrders: PurchaseOrderInput[];
  invoices: InvoiceInput[];
  paymentsCents: number;
  quotes: QuoteInput[];
  labourEntries: LabourEntryInput[];
  directCosts: DirectCostInput[];
  adjustments: AdjustmentInput[];
  /** When false, strip sensitive margin/labour cost from result. */
  includeSensitiveCosts: boolean;
  calculatedAt?: string;
};

const ACTIVE_PO_STATUSES = new Set([
  'pending_approval',
  'approved',
  'ordered',
  'received',
  'completed',
]);

const OTHER_QUOTE_CATEGORIES: QuoteLineCategory[] = [
  'travel',
  'equipment',
  'subcontractor',
  'other',
];

export function canAccessJobProfitability(identity: {
  permissions?: readonly string[] | null;
}): boolean {
  const permissions = identity.permissions ?? [];
  return (
    permissions.includes('*') ||
    permissions.includes('inventory:write') ||
    permissions.includes('finance:write') ||
    permissions.includes('finance:read') ||
    permissions.includes('procurement:read')
  );
}

export function canManageJobProfitabilityAdjustments(identity: {
  permissions?: readonly string[] | null;
  roleName?: string | null;
}): boolean {
  const permissions = identity.permissions ?? [];
  if (permissions.includes('*') || permissions.includes('finance:write')) return true;
  return ['Company Owner', 'Accountant'].includes(identity.roleName ?? '');
}

export { canViewFinanceProfit as canViewJobProfitabilityMargin };

export function safeMarginPct(profitCents: number, revenueCents: number): number | null {
  if (revenueCents <= 0) return null;
  return Math.round((profitCents / revenueCents) * 10_000) / 100;
}

export function safePctOfRevenue(partCents: number, revenueCents: number): number | null {
  if (revenueCents <= 0) return null;
  return Math.round((partCents / revenueCents) * 10_000) / 100;
}

export function classifyProfitabilityStatus(
  grossMarginPct: number | null,
  thresholds: ProfitabilityThresholds,
): ProfitabilityStatus {
  if (grossMarginPct == null) return 'unknown';
  const marginBps = Math.round(grossMarginPct * 100);
  if (marginBps >= thresholds.excellentMarginBps) return 'excellent';
  if (marginBps >= thresholds.healthyMarginBps) return 'healthy';
  if (marginBps >= thresholds.warningMarginBps) return 'warning';
  return 'loss';
}

export function computeNetMaterialCostCents(input: {
  materialLines: MaterialLineInput[];
  purchaseOrders: PurchaseOrderInput[];
}): {
  materialCostCents: number;
  materialsFromLinesCents: number;
  materialsReturnedCents: number;
  purchaseOrderAddOnCents: number;
} {
  const linePayload = input.materialLines.map((line) => ({
    status: line.status,
    quantity: line.quantity,
    fulfilledQuantity: line.fulfilledQuantity,
    unitCostCents: line.unitCostCents,
    materialSource: line.materialSource,
  }));

  const materialsFromLinesCents = sumMaterialLinesCents(linePayload);
  const materialsReturnedCents = sumReturnedMaterialCents(linePayload);
  const netFromLines = materialsFromLinesCents - materialsReturnedCents;

  const hasSupplierPurchaseLines = input.materialLines.some(
    (line) =>
      line.materialSource === 'supplier_purchase' &&
      materialLineCostCents({
        status: line.status,
        quantity: line.quantity,
        fulfilledQuantity: line.fulfilledQuantity,
        unitCostCents: line.unitCostCents,
        materialSource: line.materialSource,
      }) > 0,
  );

  const purchaseOrderAddOnCents = hasSupplierPurchaseLines
    ? 0
    : input.purchaseOrders
        .filter((po) => ACTIVE_PO_STATUSES.has(po.status))
        .reduce((sum, po) => sum + po.totalCostCents, 0);

  return {
    materialCostCents: netFromLines + purchaseOrderAddOnCents,
    materialsFromLinesCents,
    materialsReturnedCents,
    purchaseOrderAddOnCents,
  };
}

export function computeLabourCostCents(entries: LabourEntryInput[]): {
  labourCostCents: number;
  labourMinutes: number;
} {
  let labourCostCents = 0;
  let labourMinutes = 0;

  for (const entry of entries) {
    if (entry.durationMinutes <= 0) continue;
    labourMinutes += entry.durationMinutes;
    const hours = entry.durationMinutes / 60;
    const multiplier = entry.overtimeMultiplier > 0 ? entry.overtimeMultiplier : 1;
    labourCostCents += Math.round(hours * entry.hourlyCostCents * multiplier);
  }

  return { labourCostCents, labourMinutes };
}

export function resolveJobRevenue(input: {
  invoices: InvoiceInput[];
  primaryQuote: QuoteInput | null;
  revenueAdjustmentsCents: number;
}): {
  revenueSource: JobRevenueSource;
  quotedAmountCents: number;
  approvedAmountCents: number;
  invoiceAmountCents: number;
  jobRevenueCents: number;
  jobRevenueExVatCents: number | null;
} {
  const quotedAmountCents = input.primaryQuote?.totalCents ?? 0;
  const approvedAmountCents =
    input.primaryQuote?.status === 'accepted' ? input.primaryQuote.totalCents : 0;

  const activeInvoices = input.invoices.filter(
    (inv) => inv.status !== 'cancelled' && inv.status !== 'draft',
  );
  const invoiceAmountCents = activeInvoices.reduce((sum, inv) => sum + inv.totalCents, 0);
  const invoiceSubtotalCents = activeInvoices.reduce((sum, inv) => sum + inv.subtotalCents, 0);

  let revenueSource: JobRevenueSource = 'none';
  let baseRevenue = 0;
  let jobRevenueExVatCents: number | null = null;

  if (invoiceAmountCents > 0) {
    revenueSource = 'invoice';
    baseRevenue = invoiceAmountCents;
    jobRevenueExVatCents = invoiceSubtotalCents > 0 ? invoiceSubtotalCents : null;
  } else if (approvedAmountCents > 0) {
    revenueSource = 'approved_quote';
    baseRevenue = approvedAmountCents;
    jobRevenueExVatCents = input.primaryQuote?.subtotalCents ?? null;
  } else if (input.revenueAdjustmentsCents !== 0) {
    revenueSource = 'manual_adjustment';
    baseRevenue = 0;
  }

  const jobRevenueCents = baseRevenue + input.revenueAdjustmentsCents;

  if (input.revenueAdjustmentsCents !== 0 && revenueSource === 'invoice') {
    revenueSource = 'manual_adjustment';
  } else if (input.revenueAdjustmentsCents !== 0 && revenueSource === 'approved_quote') {
    revenueSource = 'manual_adjustment';
  }

  return {
    revenueSource,
    quotedAmountCents,
    approvedAmountCents,
    invoiceAmountCents,
    jobRevenueCents,
    jobRevenueExVatCents,
  };
}

export function sumAdjustmentsByKind(
  adjustments: AdjustmentInput[],
  kind: AdjustmentInput['kind'],
): number {
  return adjustments
    .filter((row) => row.kind === kind)
    .reduce((sum, row) => sum + row.amountCents, 0);
}

export function computeExpectedFromQuote(quote: QuoteInput | null): {
  expectedRevenueCents: number;
  expectedMaterialCostCents: number;
  expectedLabourCostCents: number;
  expectedOtherCostCents: number;
} {
  if (!quote) {
    return {
      expectedRevenueCents: 0,
      expectedMaterialCostCents: 0,
      expectedLabourCostCents: 0,
      expectedOtherCostCents: 0,
    };
  }

  const lines = quote.lineItems;
  const expectedMaterialCostCents = sumQuoteCategoryCents(lines, 'materials');
  const expectedLabourCostCents = sumQuoteCategoryCents(lines, 'labour');
  const expectedOtherCostCents = OTHER_QUOTE_CATEGORIES.reduce(
    (sum, category) => sum + sumQuoteCategoryCents(lines, category),
    0,
  );

  return {
    expectedRevenueCents: quote.totalCents,
    expectedMaterialCostCents,
    expectedLabourCostCents,
    expectedOtherCostCents,
  };
}

export function assessProfitabilityCompleteness(input: {
  jobStatus: string;
  materialLines: MaterialLineInput[];
  labourMinutes: number;
  jobRevenueCents: number;
  directCosts: DirectCostInput[];
  hasInvoiceOrQuote: boolean;
}): { completeness: ProfitabilityCompleteness; warnings: string[] } {
  const warnings: string[] = [];
  const flags: ProfitabilityCompleteness[] = [];

  const hasMaterialData = input.materialLines.some(
    (line) =>
      materialLineCostCents({
        status: line.status,
        quantity: line.quantity,
        fulfilledQuantity: line.fulfilledQuantity,
        unitCostCents: line.unitCostCents,
        materialSource: line.materialSource,
      }) > 0 || line.status === 'requested',
  );

  if (!hasMaterialData && input.jobStatus === 'completed') {
    flags.push('incomplete_materials');
    warnings.push('No material cost lines recorded for this completed job.');
  }

  if (input.labourMinutes <= 0 && input.jobStatus === 'completed') {
    flags.push('incomplete_labour');
    warnings.push('No approved labour time entries recorded for this completed job.');
  }

  if (input.jobRevenueCents <= 0 && !input.hasInvoiceOrQuote) {
    flags.push('incomplete_revenue');
    warnings.push('No invoice, accepted quote or revenue adjustment establishes job revenue.');
  }

  if (input.directCosts.length === 0 && input.jobStatus === 'completed') {
    flags.push('incomplete_expenses');
    warnings.push('No other direct job costs captured — fuel, parking, subcontractor, etc.');
  }

  if (flags.length === 0) {
    return { completeness: 'complete', warnings: [] };
  }
  if (flags.length === 1) {
    return { completeness: flags[0]!, warnings };
  }
  return { completeness: 'incomplete_multiple', warnings };
}

export function detectMarginLeakage(input: {
  expected: JobProfitabilityExpectedActual;
  actualRevenueCents: number;
  cash: JobProfitabilityCash;
  revenueAdjustmentsCents: number;
  materialReturnedCents: number;
  repeatVisitCount: number;
}): MarginLeakageFlag[] {
  const flags: MarginLeakageFlag[] = [];

  const materialVariance =
    input.expected.expectedMaterialCostCents > 0
      ? input.expected.actualMaterialCostCents - input.expected.expectedMaterialCostCents
      : null;
  if (materialVariance != null && materialVariance > 0) {
    flags.push({
      type: 'MATERIAL_OVERRUN',
      severity: materialVariance > input.expected.expectedMaterialCostCents * 0.2 ? 'critical' : 'warning',
      expected: input.expected.expectedMaterialCostCents,
      actual: input.expected.actualMaterialCostCents,
      variance: materialVariance,
      message: 'Material cost exceeded the estimate.',
    });
  }

  const labourVariance =
    input.expected.expectedLabourCostCents > 0
      ? input.expected.actualLabourCostCents - input.expected.expectedLabourCostCents
      : null;
  if (labourVariance != null && labourVariance > 0) {
    flags.push({
      type: 'LABOUR_OVERRUN',
      severity: labourVariance > input.expected.expectedLabourCostCents * 0.2 ? 'critical' : 'warning',
      expected: input.expected.expectedLabourCostCents,
      actual: input.expected.actualLabourCostCents,
      variance: labourVariance,
      message: 'Labour cost exceeded the estimate.',
    });
  }

  const otherVariance =
    input.expected.expectedOtherCostCents > 0
      ? input.expected.actualOtherDirectCostCents - input.expected.expectedOtherCostCents
      : null;
  if (otherVariance != null && otherVariance > 0) {
    flags.push({
      type: 'OTHER_COST_OVERRUN',
      severity: 'warning',
      expected: input.expected.expectedOtherCostCents,
      actual: input.expected.actualOtherDirectCostCents,
      variance: otherVariance,
      message: 'Other direct costs exceeded the estimate.',
    });
  }

  if (
    input.expected.expectedRevenueCents > 0 &&
    input.actualRevenueCents < input.expected.expectedRevenueCents
  ) {
    const variance = input.actualRevenueCents - input.expected.expectedRevenueCents;
    flags.push({
      type: 'REVENUE_SHORTFALL',
      severity: 'warning',
      expected: input.expected.expectedRevenueCents,
      actual: input.actualRevenueCents,
      variance,
      message: 'Actual revenue is below the quoted/expected amount.',
    });
  }

  if (input.revenueAdjustmentsCents < 0) {
    flags.push({
      type: input.revenueAdjustmentsCents < -50000 ? 'REFUND_CREDIT' : 'CUSTOMER_DISCOUNT',
      severity: 'info',
      expected: null,
      actual: input.revenueAdjustmentsCents,
      variance: input.revenueAdjustmentsCents,
      message:
        input.revenueAdjustmentsCents < -50000
          ? 'Credit or refund adjustment reduced job revenue.'
          : 'Customer discount or credit adjustment applied.',
    });
  }

  if (input.cash.uncollectedRevenueCents > 0 && input.actualRevenueCents > 0) {
    flags.push({
      type: 'UNPAID_INVOICE',
      severity:
        input.cash.uncollectedRevenueCents > input.actualRevenueCents * 0.5 ? 'critical' : 'warning',
      expected: input.actualRevenueCents,
      actual: input.cash.cashCollectedCents,
      variance: input.cash.uncollectedRevenueCents,
      message: 'Invoiced revenue has not been fully collected.',
    });
  }

  if (input.expected.actualLabourCostCents > 0 && input.expected.expectedLabourCostCents <= 0) {
    flags.push({
      type: 'MISSING_LABOUR_ENTRIES',
      severity: 'info',
      expected: 0,
      actual: input.expected.actualLabourCostCents,
      variance: input.expected.actualLabourCostCents,
      message: 'Labour cost recorded without a matching labour estimate on the quote.',
    });
  }

  if (input.materialReturnedCents > 0) {
    flags.push({
      type: 'MATERIAL_WASTE',
      severity: 'info',
      expected: null,
      actual: input.materialReturnedCents,
      variance: -input.materialReturnedCents,
      message: 'Material was returned — review for waste or over-ordering.',
    });
  }

  if (input.repeatVisitCount > 0) {
    flags.push({
      type: 'REPEAT_VISIT',
      severity: 'warning',
      expected: 0,
      actual: input.repeatVisitCount,
      variance: input.repeatVisitCount,
      message: 'Job required additional visits beyond the initial schedule.',
    });
  }

  if (input.cash.unpaidJobCostsCents > 0) {
    flags.push({
      type: 'MISSING_EXPENSE_ALLOCATION',
      severity: 'info',
      expected: null,
      actual: input.cash.unpaidJobCostsCents,
      variance: input.cash.unpaidJobCostsCents,
      message: 'Some job costs are recorded but not yet marked as paid.',
    });
  }

  return flags;
}

export function computeJobProfitability(input: ComputeJobProfitabilityInput): JobProfitabilityResult {
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();

  const primaryQuote =
    input.quotes.find((q) => q.status === 'accepted') ??
    input.quotes.find((q) => !['cancelled', 'superseded'].includes(q.status)) ??
    null;

  const revenueAdjustmentsCents = sumAdjustmentsByKind(input.adjustments, 'revenue');
  const materialAdjustmentsCents = sumAdjustmentsByKind(input.adjustments, 'material_cost');
  const labourAdjustmentsCents = sumAdjustmentsByKind(input.adjustments, 'labour_cost');
  const otherAdjustmentsCents = sumAdjustmentsByKind(input.adjustments, 'other_direct_cost');
  const totalCostAdjustmentsCents = sumAdjustmentsByKind(input.adjustments, 'total_cost');

  const revenue = resolveJobRevenue({
    invoices: input.invoices,
    primaryQuote,
    revenueAdjustmentsCents,
  });

  const material = computeNetMaterialCostCents({
    materialLines: input.materialLines,
    purchaseOrders: input.purchaseOrders,
  });

  const labour = computeLabourCostCents(input.labourEntries);

  const otherDirectCostCents =
    input.directCosts.reduce((sum, row) => sum + row.amountCents, 0) +
    otherAdjustmentsCents +
    (totalCostAdjustmentsCents !== 0 ? totalCostAdjustmentsCents : 0);

  const materialCostCents = material.materialCostCents + materialAdjustmentsCents;
  const labourCostCents = labour.labourCostCents + labourAdjustmentsCents;
  const totalDirectCostCents = materialCostCents + labourCostCents + otherDirectCostCents;
  const grossProfitCents = revenue.jobRevenueCents - totalDirectCostCents;
  const grossMarginPct = safeMarginPct(grossProfitCents, revenue.jobRevenueCents);

  const expectedBase = computeExpectedFromQuote(primaryQuote);
  const expectedTotalCostCents =
    expectedBase.expectedMaterialCostCents +
    expectedBase.expectedLabourCostCents +
    expectedBase.expectedOtherCostCents;
  const expectedGrossProfitCents = expectedBase.expectedRevenueCents - expectedTotalCostCents;

  const expectedActual: JobProfitabilityExpectedActual = {
    expectedRevenueCents: expectedBase.expectedRevenueCents,
    expectedMaterialCostCents: expectedBase.expectedMaterialCostCents,
    expectedLabourCostCents: expectedBase.expectedLabourCostCents,
    expectedOtherCostCents: expectedBase.expectedOtherCostCents,
    expectedTotalCostCents,
    expectedGrossProfitCents,
    expectedGrossMarginPct: safeMarginPct(expectedGrossProfitCents, expectedBase.expectedRevenueCents),
    actualRevenueCents: revenue.jobRevenueCents,
    actualMaterialCostCents: materialCostCents,
    actualLabourCostCents: labourCostCents,
    actualOtherDirectCostCents: otherDirectCostCents,
    actualTotalCostCents: totalDirectCostCents,
    actualGrossProfitCents: grossProfitCents,
    actualGrossMarginPct: grossMarginPct,
  };

  const variance: JobProfitabilityVariance = {
    revenueVarianceCents: expectedActual.actualRevenueCents - expectedActual.expectedRevenueCents,
    materialCostVarianceCents:
      expectedActual.actualMaterialCostCents - expectedActual.expectedMaterialCostCents,
    labourCostVarianceCents:
      expectedActual.actualLabourCostCents - expectedActual.expectedLabourCostCents,
    otherCostVarianceCents:
      expectedActual.actualOtherDirectCostCents - expectedActual.expectedOtherCostCents,
    totalCostVarianceCents:
      expectedActual.actualTotalCostCents - expectedActual.expectedTotalCostCents,
    profitVarianceCents:
      expectedActual.actualGrossProfitCents - expectedActual.expectedGrossProfitCents,
    marginVariancePct:
      expectedActual.actualGrossMarginPct != null && expectedActual.expectedGrossMarginPct != null
        ? Math.round(
            (expectedActual.actualGrossMarginPct - expectedActual.expectedGrossMarginPct) * 100,
          ) / 100
        : null,
  };

  const cashCollectedCents = input.paymentsCents;
  const cashSpentCents = input.directCosts
    .filter((row) => row.isPaid)
    .reduce((sum, row) => sum + row.amountCents, 0);
  const unpaidJobCostsCents = input.directCosts
    .filter((row) => !row.isPaid)
    .reduce((sum, row) => sum + row.amountCents, 0);

  const cash: JobProfitabilityCash = {
    cashCollectedCents,
    cashSpentCents,
    realisedCashProfitCents: cashCollectedCents - cashSpentCents,
    uncollectedRevenueCents: Math.max(0, revenue.jobRevenueCents - cashCollectedCents),
    unpaidJobCostsCents,
  };

  const { completeness, warnings } = assessProfitabilityCompleteness({
    jobStatus: input.jobStatus,
    materialLines: input.materialLines,
    labourMinutes: labour.labourMinutes,
    jobRevenueCents: revenue.jobRevenueCents,
    directCosts: input.directCosts,
    hasInvoiceOrQuote: revenue.invoiceAmountCents > 0 || revenue.approvedAmountCents > 0,
  });

  const leakage = detectMarginLeakage({
    expected: expectedActual,
    actualRevenueCents: revenue.jobRevenueCents,
    cash,
    revenueAdjustmentsCents,
    materialReturnedCents: material.materialsReturnedCents,
    repeatVisitCount: 0,
  });

  const costTransactions: JobProfitabilityCostTransaction[] = [];

  for (const line of input.materialLines) {
    const cost = materialLineCostCents({
      status: line.status,
      quantity: line.quantity,
      fulfilledQuantity: line.fulfilledQuantity,
      unitCostCents: line.unitCostCents,
      materialSource: line.materialSource,
    });
    if (cost === 0 && line.status !== 'returned') continue;
    costTransactions.push({
      id: line.id,
      category: 'material',
      description: line.description,
      amountCents: line.status === 'returned' ? -cost : cost,
      source: line.materialSource,
      sourceRecordId: line.id,
      date: line.createdAt,
      enteredByUserId: line.recordedByUserId,
      isPaid: line.materialSource === 'supplier_purchase',
      notes: null,
    });
  }

  for (const entry of input.labourEntries) {
    if (entry.durationMinutes <= 0) continue;
    const hours = entry.durationMinutes / 60;
    const amountCents = Math.round(
      hours * entry.hourlyCostCents * (entry.overtimeMultiplier > 0 ? entry.overtimeMultiplier : 1),
    );
    costTransactions.push({
      id: entry.id,
      category: 'labour',
      description: `Labour (${entry.durationMinutes} min)`,
      amountCents,
      source: 'mobile_time_entry',
      sourceRecordId: entry.id,
      date: entry.startedAt,
      enteredByUserId: entry.userId,
      isPaid: true,
      notes: null,
    });
  }

  for (const row of input.directCosts) {
    costTransactions.push({
      id: row.id,
      category: 'other',
      description: row.description,
      amountCents: row.amountCents,
      source: row.sourceType,
      sourceRecordId: row.sourceId,
      date: row.costDate,
      enteredByUserId: row.enteredByUserId,
      isPaid: row.isPaid,
      notes: row.notes,
    });
  }

  const summary: JobProfitabilitySummary = {
    jobId: input.jobId,
    currency: input.currency,
    revenueSource: revenue.revenueSource,
    quotedAmountCents: revenue.quotedAmountCents,
    approvedAmountCents: revenue.approvedAmountCents,
    invoiceAmountCents: revenue.invoiceAmountCents,
    creditAdjustmentCents: revenueAdjustmentsCents < 0 ? revenueAdjustmentsCents : 0,
    jobRevenueCents: revenue.jobRevenueCents,
    jobRevenueExVatCents: revenue.jobRevenueExVatCents,
    materialCostCents: input.includeSensitiveCosts ? materialCostCents : 0,
    labourCostCents: input.includeSensitiveCosts ? labourCostCents : 0,
    otherDirectCostCents: input.includeSensitiveCosts ? otherDirectCostCents : 0,
    totalDirectCostCents: input.includeSensitiveCosts ? totalDirectCostCents : 0,
    grossProfitCents: input.includeSensitiveCosts ? grossProfitCents : 0,
    grossMarginPct: input.includeSensitiveCosts ? grossMarginPct : null,
    materialPctOfRevenue: input.includeSensitiveCosts
      ? safePctOfRevenue(materialCostCents, revenue.jobRevenueCents)
      : null,
    labourPctOfRevenue: input.includeSensitiveCosts
      ? safePctOfRevenue(labourCostCents, revenue.jobRevenueCents)
      : null,
    otherCostPctOfRevenue: input.includeSensitiveCosts
      ? safePctOfRevenue(otherDirectCostCents, revenue.jobRevenueCents)
      : null,
    status: input.includeSensitiveCosts
      ? classifyProfitabilityStatus(grossMarginPct, input.thresholds)
      : 'unknown',
    calculatedAt,
    calculationVersion: JPE_CALCULATION_VERSION,
  };

  const result: JobProfitabilityResult = {
    summary,
    expected: input.includeSensitiveCosts
      ? expectedActual
      : {
          ...expectedActual,
          actualLabourCostCents: 0,
          expectedLabourCostCents: 0,
          actualGrossProfitCents: 0,
          expectedGrossProfitCents: 0,
          actualGrossMarginPct: null,
          expectedGrossMarginPct: null,
        },
    variance: input.includeSensitiveCosts
      ? variance
      : {
          revenueVarianceCents: variance.revenueVarianceCents,
          materialCostVarianceCents: 0,
          labourCostVarianceCents: 0,
          otherCostVarianceCents: 0,
          totalCostVarianceCents: 0,
          profitVarianceCents: 0,
          marginVariancePct: null,
        },
    cash,
    completeness,
    completenessWarnings: warnings,
    leakage: input.includeSensitiveCosts ? leakage : [],
    costTransactions: input.includeSensitiveCosts
      ? costTransactions
      : costTransactions.map((row) =>
          row.category === 'labour'
            ? { ...row, amountCents: 0, description: 'Labour (restricted)' }
            : row,
        ),
    labourMinutes: labour.labourMinutes,
    primaryQuoteId: primaryQuote?.id ?? null,
  };

  return result;
}

export function stripUnauthorizedJobProfitability<T extends JobProfitabilityResult>(
  result: T,
  includeSensitiveCosts: boolean,
): T {
  if (includeSensitiveCosts) return result;
  return {
    ...result,
    summary: {
      ...result.summary,
      materialCostCents: 0,
      labourCostCents: 0,
      otherDirectCostCents: 0,
      totalDirectCostCents: 0,
      grossProfitCents: 0,
      grossMarginPct: null,
      materialPctOfRevenue: null,
      labourPctOfRevenue: null,
      otherCostPctOfRevenue: null,
      status: 'unknown',
    },
    expected: {
      ...result.expected,
      actualLabourCostCents: 0,
      expectedLabourCostCents: 0,
      actualGrossProfitCents: 0,
      expectedGrossProfitCents: 0,
      actualGrossMarginPct: null,
      expectedGrossMarginPct: null,
    },
    variance: {
      ...result.variance,
      materialCostVarianceCents: 0,
      labourCostVarianceCents: 0,
      otherCostVarianceCents: 0,
      totalCostVarianceCents: 0,
      profitVarianceCents: 0,
      marginVariancePct: null,
    },
    leakage: [],
    costTransactions: result.costTransactions.map((row) =>
      row.category === 'other' ? row : { ...row, amountCents: 0 },
    ),
  };
}
