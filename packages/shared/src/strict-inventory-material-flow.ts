/**
 * STRICT INVENTORY MATERIAL FLOW
 *
 * Inventory = real on-hand materials/parts only.
 * Every parts-used entry is STOCK or DIRECT PURCHASE / JOB EXPENSE — one authoritative cost path.
 */

import type { JobMaterialSource } from './job-execution.js';

/** Technician-facing binary source (maps onto JobMaterialSource). */
export type MaterialFlowSource = 'STOCK' | 'DIRECT_PURCHASE';

export type StockVarianceStatus = 'none' | 'review_required' | 'resolved';

export const STOCK_VARIANCE_REVIEW_LABEL = 'STOCK VARIANCE — REVIEW REQUIRED';

const STOCK_SOURCES = new Set<JobMaterialSource>(['vehicle_stock', 'warehouse_stock']);
const DIRECT_SOURCES = new Set<JobMaterialSource>(['supplier_purchase']);

export function isStockMaterialSource(source: string): boolean {
  return STOCK_SOURCES.has(source as JobMaterialSource);
}

export function isDirectPurchaseMaterialSource(source: string): boolean {
  return DIRECT_SOURCES.has(source as JobMaterialSource);
}

export function materialFlowSourceFor(source: string): MaterialFlowSource | null {
  if (isStockMaterialSource(source)) return 'STOCK';
  if (isDirectPurchaseMaterialSource(source)) return 'DIRECT_PURCHASE';
  return null;
}

/** Map technician binary source to a concrete JobMaterialSource. */
export function resolveJobMaterialSource(input: {
  flowSource: MaterialFlowSource;
  /** vehicle vs warehouse when STOCK; ignored for DIRECT. */
  stockLocationKind?: 'vehicle' | 'warehouse';
}): JobMaterialSource {
  if (input.flowSource === 'DIRECT_PURCHASE') return 'supplier_purchase';
  return input.stockLocationKind === 'warehouse' ? 'warehouse_stock' : 'vehicle_stock';
}

export function parseMaterialQuantity(value: string | number | null | undefined): number {
  const qty = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(qty)) return 0;
  return qty;
}

/**
 * Quantity still charged to the job after returns / unused receive-into-stock.
 * fulfilled − returned (never negative).
 */
export function materialChargeableQuantity(input: {
  quantity: string | number;
  fulfilledQuantity?: string | number | null;
  returnedQuantity?: string | number | null;
  status?: string;
}): number {
  const fulfilled = parseMaterialQuantity(input.fulfilledQuantity ?? input.quantity);
  if (fulfilled <= 0) return 0;

  const explicitReturned = input.returnedQuantity;
  if (explicitReturned != null && String(explicitReturned).length > 0) {
    return Math.max(0, fulfilled - parseMaterialQuantity(explicitReturned));
  }

  // Legacy: status flipped to returned with no returned_quantity column → nothing chargeable.
  if (input.status === 'returned') return 0;
  return fulfilled;
}

export function materialReturnedQuantity(input: {
  quantity: string | number;
  fulfilledQuantity?: string | number | null;
  returnedQuantity?: string | number | null;
  status?: string;
}): number {
  if (input.returnedQuantity != null && String(input.returnedQuantity).length > 0) {
    return Math.max(0, parseMaterialQuantity(input.returnedQuantity));
  }
  if (input.status === 'returned') {
    return Math.max(0, parseMaterialQuantity(input.fulfilledQuantity ?? input.quantity));
  }
  return 0;
}

/** Direct purchase must carry a slip/receipt or supplier reference — not a stock-only path. */
export function directPurchaseEvidenceOk(input: {
  supplierReference?: string | null;
  receiptDocumentationId?: string | null;
}): boolean {
  const ref = input.supplierReference?.trim();
  const doc = input.receiptDocumentationId?.trim();
  return Boolean(ref || doc);
}

/**
 * Anti double-count: stock lines must never also post a material_line direct cost,
 * and direct-purchase lines must never decrement inventory unless received into stock.
 */
export function materialPathConflict(input: {
  materialSource: string;
  hasStockMovementIssue: boolean;
  hasMaterialLineDirectCost: boolean;
}): string | null {
  const flow = materialFlowSourceFor(input.materialSource);
  if (flow === 'STOCK' && input.hasMaterialLineDirectCost) {
    return 'STOCK material cannot also post a direct-purchase expense for the same line';
  }
  if (flow === 'DIRECT_PURCHASE' && input.hasStockMovementIssue) {
    return 'DIRECT PURCHASE must not decrement inventory unless unused material is received into stock';
  }
  return null;
}

export function stockVarianceReviewRequired(input: {
  requestedQuantity: number;
  availableQuantity: number;
}): boolean {
  return (
    Number.isFinite(input.requestedQuantity) &&
    Number.isFinite(input.availableQuantity) &&
    input.requestedQuantity > Math.max(0, input.availableQuantity)
  );
}

export function technicianMaySeeMaterialField(
  field:
    | 'description'
    | 'quantityAvailable'
    | 'quantityUsed'
    | 'quantityReturned'
    | 'flowSource'
    | 'slipUpload'
    | 'unitCost'
    | 'lineTotal'
    | 'inventoryValuation'
    | 'supplierCostHistory'
    | 'markup'
    | 'margin'
    | 'companyProfit'
    | 'stockAnalytics',
): boolean {
  switch (field) {
    case 'description':
    case 'quantityAvailable':
    case 'quantityUsed':
    case 'quantityReturned':
    case 'flowSource':
    case 'slipUpload':
      return true;
    default:
      return false;
  }
}
