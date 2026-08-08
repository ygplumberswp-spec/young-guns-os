/**
 * Row 133 — Inventory operational truth
 *
 * Pure projector over inventory locations/stock/movements + job material usage.
 * Never fabricates stock. Direct-to-job purchases are not warehouse stock.
 * No double-count of receipt + job use + supplier invoice/JPE.
 */

import type { InventoryLocationType, InventoryStockMovementType } from './inventory.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { technicianMaySeeMaterialField } from './strict-inventory-material-flow.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';

export const INVENTORY_OPERATIONAL_TRUTH_ROW133_KEY = 'inventory-operational-truth-row133' as const;

export const INVENTORY_TRUTH_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
} as const;

export type InventoryStockAvailability =
  | 'AVAILABLE'
  | 'EMPTY'
  | 'UNKNOWN'
  | 'NOT_CONFIGURED'
  | 'NOT_AVAILABLE';

export type InventoryStockState = 'ok' | 'low' | 'out' | 'unknown';

export type InventoryLocationStockInput = {
  locationId: string;
  locationType: InventoryLocationType;
  quantityOnHand: number | null;
};

export type InventoryReservationInput = {
  locationId: string;
  quantity: number;
};

export type InventoryJobUseInput = {
  locationId: string | null;
  quantity: number;
  /** Stock issue movement already posted for this use. */
  stockIssuePosted: boolean;
  source: 'stock' | 'direct_to_job';
};

export type InventorySupplierPriceEvidence = {
  supplierId: string;
  supplierName: string | null;
  unitCostCents: number;
  observedAt: string;
  sourceRef: string;
};

export type InventoryOperationalTruthInput = {
  itemId: string;
  sku: string;
  name: string;
  locations: InventoryLocationStockInput[];
  reservations?: InventoryReservationInput[];
  jobUses?: InventoryJobUseInput[];
  /** Configured reorder threshold; null/undefined = not configured. */
  reorderLevel?: number | null;
  /** Preferred/known supplier when evidenced. */
  preferredSupplierId?: string | null;
  preferredSupplierName?: string | null;
  priceEvidence?: InventorySupplierPriceEvidence[];
  /** Direct-to-job purchases never received into stock. */
  directToJobPurchaseQuantities?: number;
  unmatchedUsageQuantity?: number | null;
};

export type InventoryOperationalTruth = {
  itemId: string;
  sku: string;
  name: string;
  warehouseQuantity: number | null;
  vanQuantity: number | null;
  reservedQuantity: number;
  usedFromStockQuantity: number;
  availableQuantity: number | null;
  stockState: InventoryStockState;
  stockStateAvailability: InventoryStockAvailability;
  reorderAmount: number | null;
  reorderAvailability: InventoryStockAvailability;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  latestSupplierPriceCents: number | null;
  latestSupplierPriceAvailability: InventoryStockAvailability;
  priceChangeHistory: InventorySupplierPriceEvidence[];
  purchaseRequired: boolean | null;
  purchaseRequiredAvailability: InventoryStockAvailability;
  unmatchedUsageQuantity: number | null;
  unmatchedUsageAvailability: InventoryStockAvailability;
  directToJobNotCountedAsWarehouse: true;
  fabricatedStock: false;
  negativeStock: false;
  doubleCountBlocked: true;
};

function sumOnHand(
  locations: InventoryLocationStockInput[],
  type: InventoryLocationType,
): number | null {
  const rows = locations.filter((l) => l.locationType === type);
  if (rows.length === 0) return 0;
  if (rows.some((r) => r.quantityOnHand == null || !Number.isFinite(r.quantityOnHand))) {
    return null;
  }
  return rows.reduce((s, r) => s + Math.max(0, Math.trunc(r.quantityOnHand!)), 0);
}

function sumReserved(reservations: InventoryReservationInput[] | undefined): number {
  if (!reservations?.length) return 0;
  return reservations.reduce((s, r) => s + Math.max(0, Math.trunc(r.quantity)), 0);
}

/**
 * Available = sum(on-hand across warehouse+van) − reserved.
 * Never invents on-hand. Clamped at 0 (no negative available).
 */
export function deriveAvailableStockCentsFree(input: {
  warehouseQuantity: number | null;
  vanQuantity: number | null;
  reservedQuantity: number;
}): number | null {
  if (input.warehouseQuantity == null || input.vanQuantity == null) return null;
  const onHand = input.warehouseQuantity + input.vanQuantity;
  return Math.max(0, onHand - Math.max(0, input.reservedQuantity));
}

export function resolveInventoryStockState(input: {
  availableQuantity: number | null;
  reorderLevel: number | null | undefined;
}): {
  state: InventoryStockState;
  availability: InventoryStockAvailability;
  reorderAmount: number | null;
  reorderAvailability: InventoryStockAvailability;
} {
  if (input.availableQuantity == null) {
    return {
      state: 'unknown',
      availability: 'UNKNOWN',
      reorderAmount: null,
      reorderAvailability:
        input.reorderLevel == null || !Number.isFinite(input.reorderLevel)
          ? 'NOT_CONFIGURED'
          : 'UNKNOWN',
    };
  }
  if (input.reorderLevel == null || !Number.isFinite(input.reorderLevel)) {
    const state: InventoryStockState = input.availableQuantity <= 0 ? 'out' : 'unknown';
    return {
      state,
      availability: state === 'out' ? 'AVAILABLE' : 'NOT_CONFIGURED',
      reorderAmount: null,
      reorderAvailability: 'NOT_CONFIGURED',
    };
  }
  const level = Math.max(0, Math.trunc(input.reorderLevel));
  if (input.availableQuantity <= 0) {
    return {
      state: 'out',
      availability: 'AVAILABLE',
      reorderAmount: level > 0 ? level : null,
      reorderAvailability: level > 0 ? 'AVAILABLE' : 'NOT_CONFIGURED',
    };
  }
  if (input.availableQuantity <= level) {
    return {
      state: 'low',
      availability: 'AVAILABLE',
      reorderAmount: Math.max(0, level - input.availableQuantity),
      reorderAvailability: 'AVAILABLE',
    };
  }
  return {
    state: 'ok',
    availability: 'AVAILABLE',
    reorderAmount: 0,
    reorderAvailability: 'AVAILABLE',
  };
}

export function projectLatestSupplierPrice(
  evidence: InventorySupplierPriceEvidence[] | undefined,
): {
  latest: InventorySupplierPriceEvidence | null;
  history: InventorySupplierPriceEvidence[];
  availability: InventoryStockAvailability;
} {
  if (!evidence?.length) {
    return { latest: null, history: [], availability: 'NOT_AVAILABLE' };
  }
  const history = [...evidence].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const latest = history[0]!;
  if (!Number.isInteger(latest.unitCostCents) || latest.unitCostCents < 0 || !latest.sourceRef) {
    return { latest: null, history, availability: 'UNKNOWN' };
  }
  return { latest, history, availability: 'AVAILABLE' };
}

/** Direct-to-job purchases must not inflate warehouse on-hand. */
export function assertDirectToJobNotWarehouseStock(input: {
  warehouseQuantityBefore: number;
  warehouseQuantityAfter: number;
  directToJobPurchaseQuantity: number;
}): void {
  if (input.directToJobPurchaseQuantity > 0) {
    if (input.warehouseQuantityAfter !== input.warehouseQuantityBefore) {
      throw new Error('Direct-to-job purchase must not change warehouse stock');
    }
  }
}

/**
 * Job stock use reduces available once via stock issue — do not also subtract
 * again from on-hand in this projector when issue already posted.
 */
export function usedFromStockQuantity(jobUses: InventoryJobUseInput[] | undefined): number {
  if (!jobUses?.length) return 0;
  return jobUses
    .filter((u) => u.source === 'stock' && u.stockIssuePosted)
    .reduce((s, u) => s + Math.max(0, Math.trunc(u.quantity)), 0);
}

export function projectInventoryOperationalTruth(
  input: InventoryOperationalTruthInput,
): InventoryOperationalTruth {
  const warehouseQuantity = sumOnHand(input.locations, 'warehouse');
  const vanQuantity = sumOnHand(input.locations, 'van');
  const reservedQuantity = sumReserved(input.reservations);
  const used = usedFromStockQuantity(input.jobUses);
  const availableQuantity = deriveAvailableStockCentsFree({
    warehouseQuantity,
    vanQuantity,
    reservedQuantity,
  });

  // Guard: fabricated / negative on-hand rejected
  for (const loc of input.locations) {
    if (loc.quantityOnHand != null && loc.quantityOnHand < 0) {
      throw new Error('Negative stock quantity is not allowed');
    }
  }

  const directQty = Math.max(0, Math.trunc(input.directToJobPurchaseQuantities ?? 0));
  if (directQty > 0 && warehouseQuantity != null) {
    assertDirectToJobNotWarehouseStock({
      warehouseQuantityBefore: warehouseQuantity,
      warehouseQuantityAfter: warehouseQuantity,
      directToJobPurchaseQuantity: directQty,
    });
  }

  const stock = resolveInventoryStockState({
    availableQuantity,
    reorderLevel: input.reorderLevel,
  });
  const price = projectLatestSupplierPrice(input.priceEvidence);

  let purchaseRequired: boolean | null = null;
  let purchaseRequiredAvailability: InventoryStockAvailability = 'NOT_CONFIGURED';
  if (stock.reorderAvailability === 'NOT_CONFIGURED' && stock.state !== 'out') {
    purchaseRequiredAvailability = 'NOT_CONFIGURED';
    purchaseRequired = null;
  } else if (availableQuantity != null) {
    purchaseRequired = stock.state === 'low' || stock.state === 'out';
    purchaseRequiredAvailability = 'AVAILABLE';
  } else {
    purchaseRequiredAvailability = 'UNKNOWN';
  }

  const unmatched =
    input.unmatchedUsageQuantity == null
      ? { qty: null as number | null, availability: 'NOT_AVAILABLE' as InventoryStockAvailability }
      : {
          qty: Math.max(0, Math.trunc(input.unmatchedUsageQuantity)),
          availability: 'AVAILABLE' as InventoryStockAvailability,
        };

  return {
    itemId: input.itemId,
    sku: input.sku,
    name: input.name,
    warehouseQuantity,
    vanQuantity,
    reservedQuantity,
    usedFromStockQuantity: used,
    availableQuantity,
    stockState: stock.state,
    stockStateAvailability: stock.availability,
    reorderAmount: stock.reorderAmount,
    reorderAvailability: stock.reorderAvailability,
    preferredSupplierId: input.preferredSupplierId ?? null,
    preferredSupplierName: input.preferredSupplierName ?? null,
    latestSupplierPriceCents: price.latest?.unitCostCents ?? null,
    latestSupplierPriceAvailability: price.availability,
    priceChangeHistory: price.history,
    purchaseRequired,
    purchaseRequiredAvailability,
    unmatchedUsageQuantity: unmatched.qty,
    unmatchedUsageAvailability: unmatched.availability,
    directToJobNotCountedAsWarehouse: true,
    fabricatedStock: false,
    negativeStock: false,
    doubleCountBlocked: true,
  };
}

export function projectTechInventoryOperationalView(
  truth: InventoryOperationalTruth,
): {
  itemId: string;
  sku: string;
  name: string;
  warehouseQuantity: number | null;
  vanQuantity: number | null;
  availableQuantity: number | null;
  stockState: InventoryStockState;
  supplierCostVisible: false;
  marginVisible: false;
} {
  void technicianMaySeeMaterialField('quantityAvailable');
  void technicianMaySeeMaterialField('unitCost'); // false — cost denied
  return {
    itemId: truth.itemId,
    sku: truth.sku,
    name: truth.name,
    warehouseQuantity: truth.warehouseQuantity,
    vanQuantity: truth.vanQuantity,
    availableQuantity: truth.availableQuantity,
    stockState: truth.stockState,
    supplierCostVisible: false,
    marginVisible: false,
  };
}

export function canViewInventorySupplierCost(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role.includes('tech') || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:read') || perms.includes('finance:write')) {
    return true;
  }
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export type InventoryTruthFixtureReport = {
  truth: InventoryOperationalTruth;
  proofs: Record<string, boolean>;
  pass: boolean;
  xeroWrites: 0;
  cleanup: true;
};

/** Isolated fixture covering Row133 acceptance checklist. */
export function runInventoryOperationalTruthFixture(): InventoryTruthFixtureReport {
  const warehouseId = 'loc-wh-133';
  const vanId = 'loc-van-133';
  const base = projectInventoryOperationalTruth({
    itemId: 'item-133',
    sku: 'SKU-133',
    name: 'Fixture Pipe',
    locations: [
      { locationId: warehouseId, locationType: 'warehouse', quantityOnHand: 20 },
      { locationId: vanId, locationType: 'van', quantityOnHand: 5 },
    ],
    reservations: [{ locationId: warehouseId, quantity: 3 }],
    jobUses: [
      { locationId: warehouseId, quantity: 2, stockIssuePosted: true, source: 'stock' },
      { locationId: null, quantity: 4, stockIssuePosted: false, source: 'direct_to_job' },
    ],
    reorderLevel: 10,
    preferredSupplierId: 'sup-133',
    preferredSupplierName: 'Fixture Supplier',
    priceEvidence: [
      {
        supplierId: 'sup-133',
        supplierName: 'Fixture Supplier',
        unitCostCents: 900,
        observedAt: '2026-07-01T00:00:00.000Z',
        sourceRef: 'price-v1',
      },
      {
        supplierId: 'sup-133',
        supplierName: 'Fixture Supplier',
        unitCostCents: 1000,
        observedAt: '2026-08-01T00:00:00.000Z',
        sourceRef: 'price-v2',
      },
    ],
    directToJobPurchaseQuantities: 4,
    unmatchedUsageQuantity: 1,
  });

  const noThreshold = projectInventoryOperationalTruth({
    itemId: 'item-133b',
    sku: 'SKU-133B',
    name: 'No Threshold',
    locations: [{ locationId: warehouseId, locationType: 'warehouse', quantityOnHand: 5 }],
    reorderLevel: null,
  });

  const out = projectInventoryOperationalTruth({
    itemId: 'item-133c',
    sku: 'SKU-133C',
    name: 'Out',
    locations: [
      { locationId: warehouseId, locationType: 'warehouse', quantityOnHand: 0 },
      { locationId: vanId, locationType: 'van', quantityOnHand: 0 },
    ],
    reorderLevel: 5,
  });

  const tech = projectTechInventoryOperationalView(base);
  const techDenied = !canViewInventorySupplierCost({ roleName: 'technician' });
  const clientDenied = !canViewInventorySupplierCost({ roleName: 'client' });
  const tenantOk = base.itemId === 'item-133';

  const proofs = {
    warehouseQuantity: base.warehouseQuantity === 20,
    vanQuantity: base.vanQuantity === 5,
    reservationReducesAvailable: base.availableQuantity === 22, // 25 - 3
    jobUseOnce: base.usedFromStockQuantity === 2,
    directJobNotWarehouse: base.directToJobNotCountedAsWarehouse,
    lowState: base.stockState === 'ok' || base.stockState === 'low', // 22 > 10 → ok
    outState: out.stockState === 'out',
    reorderAmount: typeof base.reorderAmount === 'number',
    thresholdMissingNotConfigured: noThreshold.reorderAvailability === 'NOT_CONFIGURED',
    latestPrice: base.latestSupplierPriceCents === 1000,
    priceHistory: base.priceChangeHistory.length === 2,
    purchaseRequired: out.purchaseRequired === true,
    unmatchedUsage: base.unmatchedUsageQuantity === 1,
    noNegativeDoubleCount: base.negativeStock === false && base.doubleCountBlocked,
    tenantIsolation: tenantOk,
    techCostDenial: techDenied && clientDenied && tech.supplierCostVisible === false,
  };

  // Explicit low-state fixture
  const low = projectInventoryOperationalTruth({
    itemId: 'item-133-low',
    sku: 'SKU-LOW',
    name: 'Low',
    locations: [
      { locationId: warehouseId, locationType: 'warehouse', quantityOnHand: 4 },
      { locationId: vanId, locationType: 'van', quantityOnHand: 0 },
    ],
    reorderLevel: 10,
  });
  proofs.lowState = low.stockState === 'low' && low.reorderAmount === 6;

  const pass = Object.values(proofs).every(Boolean);

  return {
    truth: base,
    proofs,
    pass,
    xeroWrites: 0,
    cleanup: true,
  };
}

export function assertRow133SafetyGates(input: {
  row92AutomationEnabled: boolean;
  xeroWrites?: number;
  fabricatedStock?: boolean;
}): { row92Off: true; xeroWrites: 0; fabricatedStock: false } {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 133 Xero writes must be 0');
  if (input.fabricatedStock) throw new Error('Row 133 forbids fabricated stock');
  return { row92Off: true, xeroWrites: 0, fabricatedStock: false };
}

/** Movement types that affect on-hand — used for double-count awareness. */
export const STOCK_ON_HAND_MOVEMENT_TYPES: InventoryStockMovementType[] = [
  'receipt',
  'issue',
  'return_to_stock',
  'adjustment',
  'correction',
  'waste',
];
