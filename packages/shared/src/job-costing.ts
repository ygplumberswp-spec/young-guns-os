import type { QuoteLineCategory } from './finance.js';

export type JobCostingMaterialSourceBreakdown = {
  vehicleStock: number;
  warehouseStock: number;
  supplierPurchase: number;
  customerSupplied: number;
  other: number;
};

export type JobCostingSummary = {
  jobId: string;
  currency: string;
  /** Primary accepted quote, else latest non-cancelled quote. */
  primaryQuoteId: string | null;
  quotedMaterialsCents: number;
  quotedLabourCents: number;
  quotedTotalCents: number;
  materialsUsedCents: number;
  materialsPurchasedCents: number;
  materialsReturnedCents: number;
  labourMinutes: number;
  invoicedCents: number;
  paidCents: number;
  actualCostCents: number;
  grossProfitCents: number | null;
  varianceMaterialsCents: number | null;
  materialLineCount: number;
  purchaseOrderCount: number;
  stockMovementCount: number;
  byMaterialSource: JobCostingMaterialSourceBreakdown;
};

type QuoteLineForCosting = {
  category: QuoteLineCategory;
  lineCostCents: number | null;
  lineSubtotalCents: number;
  isOptional: boolean;
};

type MaterialLineForCosting = {
  status: string;
  quantity: string;
  fulfilledQuantity: string | null;
  unitCostCents: number;
  materialSource: string;
};

const MATERIAL_COST_STATUSES = new Set(['used', 'partially_fulfilled', 'approved']);

export function sumQuoteCategoryCents(
  lines: QuoteLineForCosting[],
  category: QuoteLineCategory,
): number {
  return lines.reduce((sum, line) => {
    if (line.isOptional || line.category !== category) return sum;
    const cost = line.lineCostCents ?? line.lineSubtotalCents;
    return sum + Math.max(0, cost);
  }, 0);
}

export function materialLineCostCents(line: MaterialLineForCosting): number {
  if (!MATERIAL_COST_STATUSES.has(line.status)) return 0;
  const qty = Number(line.fulfilledQuantity ?? line.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(qty * (line.unitCostCents ?? 0));
}

export function sumMaterialLinesCents(lines: MaterialLineForCosting[]): number {
  return lines.reduce((sum, line) => sum + materialLineCostCents(line), 0);
}

export function sumReturnedMaterialCents(lines: MaterialLineForCosting[]): number {
  return lines.reduce((sum, line) => {
    if (line.status !== 'returned') return sum;
    const qty = Number(line.fulfilledQuantity ?? line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return sum;
    return sum + Math.round(qty * (line.unitCostCents ?? 0));
  }, 0);
}

export function buildMaterialSourceBreakdown(
  lines: MaterialLineForCosting[],
): JobCostingMaterialSourceBreakdown {
  const breakdown: JobCostingMaterialSourceBreakdown = {
    vehicleStock: 0,
    warehouseStock: 0,
    supplierPurchase: 0,
    customerSupplied: 0,
    other: 0,
  };

  for (const line of lines) {
    const cost = materialLineCostCents(line);
    if (cost <= 0) continue;
    switch (line.materialSource) {
      case 'vehicle_stock':
        breakdown.vehicleStock += cost;
        break;
      case 'warehouse_stock':
        breakdown.warehouseStock += cost;
        break;
      case 'supplier_purchase':
        breakdown.supplierPurchase += cost;
        break;
      case 'customer_supplied':
        breakdown.customerSupplied += cost;
        break;
      default:
        breakdown.other += cost;
    }
  }

  return breakdown;
}

export function computeJobGrossProfitCents(input: {
  paidCents: number;
  invoicedCents: number;
  actualCostCents: number;
  includeProfit: boolean;
}): number | null {
  if (!input.includeProfit) return null;
  const revenue = input.paidCents > 0 ? input.paidCents : input.invoicedCents;
  return revenue - input.actualCostCents;
}

export function computeMaterialsVarianceCents(
  quotedMaterialsCents: number,
  materialsUsedCents: number,
): number | null {
  if (quotedMaterialsCents <= 0) return null;
  return materialsUsedCents - quotedMaterialsCents;
}
