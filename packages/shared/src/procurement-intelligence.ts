/**
 * Supplier & Procurement Intelligence (Department 5.2)
 *
 * Extends Inventory Intelligence Foundation + existing procurement / supplier /
 * supplier-price modules with:
 * - Supplier profiles, history, pricing, and purchase history (real records)
 * - Purchase recommendations (drafts only) and cost comparisons from real pricing
 * - AURA suggestions for purchases, supplier opportunities, and cost savings
 *
 * Invariants:
 * - Approval required for purchases — no automatic purchasing
 * - No fake suppliers, POs, or prices; honest empty / unavailable states
 * - Owner approval for PO execute and recommend-accept
 * - Extends inventory intelligence + procurement — does not rebuild them
 */

import {
  canAccessInventoryIntelligence,
  canApproveInventoryIntelligenceDrafts,
  canWriteInventoryIntelligence,
} from './inventory-intelligence.js';

export type PiRecommendationKind =
  | 'purchase_suggestion'
  | 'supplier_opportunity'
  | 'cost_saving'
  | 'reorder_follow_up'
  | 'price_advantage'
  | 'aura_handoff';

export type PiRecommendationStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'accepted';

export type PiInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'inventory_intelligence'
  | 'procurement'
  | 'operations'
  | 'inventory';

export type PiInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type PiAvailability = 'available' | 'unavailable';

export type PiSupplierProfileSummary = {
  supplierId: string;
  name: string;
  status: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  productCount: number;
  purchaseOrderCount: number;
  completedOrderCount: number;
  pendingApprovalCount: number;
  totalSpendCents: number;
  lastOrderAt: string | null;
  pricingRecordCount: number;
  cataloguePriceCount: number;
};

export type PiPurchaseHistoryRow = {
  purchaseOrderId: string;
  referenceNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  totalCostCents: number;
  itemCount: number;
  orderedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PiPricingRecordSummary = {
  id: string;
  source: 'supplier_product' | 'price_catalogue';
  supplierId: string | null;
  supplierName: string | null;
  productName: string;
  supplierSku: string | null;
  inventoryItemId: string | null;
  unitCostCents: number;
  leadTimeDays: number | null;
  isActive: boolean;
  updatedAt: string;
};

export type PiCostComparisonLine = {
  supplierId: string;
  supplierName: string;
  unitCostCents: number;
  source: 'supplier_product' | 'price_catalogue';
  productName: string;
  leadTimeDays: number | null;
};

export type PiCostComparisonSummary = {
  id: string;
  title: string;
  productKey: string;
  inventoryItemId: string | null;
  availability: PiAvailability;
  lowestUnitCostCents: number | null;
  highestUnitCostCents: number | null;
  savingsOpportunityCents: number | null;
  lineCount: number;
  lines: PiCostComparisonLine[];
  rationale: string;
  createdAt: string;
};

export type PiPurchaseRecommendationSummary = {
  id: string;
  kind: PiRecommendationKind;
  status: PiRecommendationStatus;
  title: string;
  body: string;
  supplierId: string | null;
  inventoryItemId: string | null;
  suggestedQuantity: number | null;
  estimatedUnitCostCents: number | null;
  estimatedTotalCostCents: number | null;
  sourceInventoryAlertId: string | null;
  draftPurchaseOrderId: string | null;
  /** Invariant: always false — never auto-purchases. */
  autoPurchase: false;
  createdAt: string;
  decidedAt: string | null;
};

export type PiAuraInsightSummary = {
  id: string;
  target: PiInsightTarget;
  status: PiInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceRecommendationId: string | null;
  sourceCostComparisonId: string | null;
  createdAt: string;
};

export type PiAuraConnection = {
  target: PiInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type PiSupplierSnapshot = {
  availability: PiAvailability;
  supplierCount: number;
  activeSupplierCount: number;
  pricingRecordCount: number;
  rationale: string;
};

export type PiPurchaseSnapshot = {
  availability: PiAvailability;
  purchaseOrderCount: number;
  pendingApprovalCount: number;
  openOrderCount: number;
  completedOrderCount: number;
  totalSpendCents: number | null;
  rationale: string;
};

export type PiSettings = {
  id: string;
  /** Invariant: always false. */
  autoPurchaseEnabled: false;
  recommendationsEnabled: boolean;
  costComparisonsEnabled: boolean;
  notes: string | null;
  updatedAt: string;
};

export type PiDashboard = {
  summary: string;
  productClarification: {
    inventoryOps: string;
    inventoryIntelligence: string;
    procurementOps: string;
    thisLayer: string;
  };
  policy: {
    autoPurchaseEnabled: false;
    requiresOwnerApproval: true;
    fakeSuppliers: false;
    fakePrices: false;
  };
  suppliers: PiSupplierSnapshot;
  purchases: PiPurchaseSnapshot;
  supplierProfiles: PiSupplierProfileSummary[];
  purchaseHistory: PiPurchaseHistoryRow[];
  pricingRecords: PiPricingRecordSummary[];
  costComparisons: PiCostComparisonSummary[];
  recommendations: PiPurchaseRecommendationSummary[];
  auraInsights: PiAuraInsightSummary[];
  auraConnections: PiAuraConnection[];
  settings: PiSettings;
  pendingApprovals: number;
  inventoryAlertLinkCount: number;
};

export type RefreshPiRecommendationsRequest = {
  submitForApproval?: boolean;
};

export type DecidePiRecommendationRequest = {
  decision: 'approve' | 'reject' | 'accept';
  notes?: string;
  /** When accept + Owner: optionally create a draft PO (never ordered automatically). */
  createDraftPurchaseOrder?: boolean;
};

export type RefreshPiCostComparisonsRequest = {
  productKey?: string;
};

export type UpdatePiSettingsRequest = {
  recommendationsEnabled?: boolean;
  costComparisonsEnabled?: boolean;
  notes?: string | null;
};

export type CreatePiAuraInsightRequest = {
  target: PiInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceRecommendationId?: string;
  sourceCostComparisonId?: string;
};

export type AcknowledgePiInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access ───────────────────────────────────────────────────────────────────

export function canAccessProcurementIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canAccessInventoryIntelligence(identity);
}

export function canWriteProcurementIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canWriteInventoryIntelligence(identity);
}

/** Owner approval for recommend-accept and PO execute paths. */
export function canApproveProcurementIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveInventoryIntelligenceDrafts(identity);
}

export function canManageProcurementIntelligenceSettings(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveProcurementIntelligence(identity);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const PI_PRODUCT_COPY = {
  inventoryOps:
    'Operational inventory (items, stock levels, movements) remains under /inventory.',
  inventoryIntelligence:
    'Inventory Intelligence alert drafts remain under /inventory-intelligence — this layer may follow up with purchase recommendation drafts only.',
  procurementOps:
    'Suppliers and purchase orders remain under /procurement — this layer does not replace operational PO workflow.',
  thisLayer:
    'Supplier & Procurement Intelligence surfaces real supplier profiles, pricing, purchase history, cost comparisons, and Owner-gated purchase recommendation drafts. Never auto-purchases. No fake suppliers or prices.',
} as const;

export function buildPiSupplierSnapshot(input: {
  supplierCount: number;
  activeSupplierCount: number;
  pricingRecordCount: number;
}): PiSupplierSnapshot {
  if (input.supplierCount === 0) {
    return {
      availability: 'unavailable',
      supplierCount: 0,
      activeSupplierCount: 0,
      pricingRecordCount: 0,
      rationale:
        'No suppliers yet — supplier intelligence unavailable (not invented). Create real supplier records in Procurement first.',
    };
  }
  return {
    availability: 'available',
    supplierCount: input.supplierCount,
    activeSupplierCount: input.activeSupplierCount,
    pricingRecordCount: input.pricingRecordCount,
    rationale: `Derived from ${input.supplierCount} real supplier(s); ${input.pricingRecordCount} pricing record(s) from supplier products / catalogue.`,
  };
}

export function buildPiPurchaseSnapshot(input: {
  purchaseOrderCount: number;
  pendingApprovalCount: number;
  openOrderCount: number;
  completedOrderCount: number;
  totalSpendCents: number;
}): PiPurchaseSnapshot {
  if (input.purchaseOrderCount === 0) {
    return {
      availability: 'unavailable',
      purchaseOrderCount: 0,
      pendingApprovalCount: 0,
      openOrderCount: 0,
      completedOrderCount: 0,
      totalSpendCents: null,
      rationale:
        'No purchase orders yet — purchase history unavailable (not invented). Create real POs in Procurement when ready.',
    };
  }
  return {
    availability: 'available',
    purchaseOrderCount: input.purchaseOrderCount,
    pendingApprovalCount: input.pendingApprovalCount,
    openOrderCount: input.openOrderCount,
    completedOrderCount: input.completedOrderCount,
    totalSpendCents: input.totalSpendCents,
    rationale: `Derived from ${input.purchaseOrderCount} real purchase order(s); spend totals use stored PO totals only.`,
  };
}

export function buildPiCostComparison(input: {
  productKey: string;
  inventoryItemId?: string | null;
  lines: PiCostComparisonLine[];
}): Omit<PiCostComparisonSummary, 'id' | 'createdAt'> {
  const key = input.productKey.trim() || 'unknown product';
  if (input.lines.length === 0) {
    return {
      title: `Cost comparison — ${key}`.slice(0, 200),
      productKey: key,
      inventoryItemId: input.inventoryItemId ?? null,
      availability: 'unavailable',
      lowestUnitCostCents: null,
      highestUnitCostCents: null,
      savingsOpportunityCents: null,
      lineCount: 0,
      lines: [],
      rationale:
        'No real supplier pricing rows for this product — comparison unavailable (not invented).',
    };
  }
  const costs = input.lines.map((l) => l.unitCostCents);
  const lowest = Math.min(...costs);
  const highest = Math.max(...costs);
  const multiSupplier = new Set(input.lines.map((l) => l.supplierId)).size >= 2;
  return {
    title: `Cost comparison — ${key}`.slice(0, 200),
    productKey: key,
    inventoryItemId: input.inventoryItemId ?? null,
    availability: 'available',
    lowestUnitCostCents: lowest,
    highestUnitCostCents: highest,
    savingsOpportunityCents: multiSupplier ? Math.max(0, highest - lowest) : null,
    lineCount: input.lines.length,
    lines: [...input.lines].sort((a, b) => a.unitCostCents - b.unitCostCents),
    rationale: multiSupplier
      ? `Compared ${input.lines.length} real price row(s) across suppliers. Savings opportunity is highest−lowest unit cost when multiple suppliers exist.`
      : `Single-supplier pricing only (${input.lines.length} row(s)) — no multi-supplier savings claim.`,
  };
}

export function buildPurchaseRecommendationDraft(input: {
  kind: PiRecommendationKind;
  sku?: string | null;
  name?: string | null;
  supplierName?: string | null;
  quantityOnHand?: number | null;
  reorderLevel?: number | null;
  unitCostCents?: number | null;
  suggestedQuantity?: number | null;
}): { kind: PiRecommendationKind; title: string; body: string } {
  const label = [input.sku, input.name].filter(Boolean).join(' — ') || 'item';
  const supplier = input.supplierName ? ` via ${input.supplierName}` : '';
  switch (input.kind) {
    case 'cost_saving':
      return {
        kind: input.kind,
        title: `Cost saving opportunity — ${label}`.slice(0, 200),
        body: [
          `Pricing comparison suggests a lower unit cost may be available${supplier}.`,
          input.unitCostCents != null
            ? `Reference unit cost from real pricing: ${input.unitCostCents} cents.`
            : 'Unit cost unavailable without a real pricing row.',
          '',
          'Draft recommendation only — not a purchase order. Not automatic purchasing.',
          'Owner approval required before any procurement follow-up.',
        ].join('\n'),
      };
    case 'supplier_opportunity':
      return {
        kind: input.kind,
        title: `Supplier opportunity — ${label}`.slice(0, 200),
        body: [
          `Supplier coverage or pricing gap detected for ${label}${supplier}.`,
          'Based on real supplier / product / catalogue rows only.',
          '',
          'Draft only — Owner must approve before any PO draft is created.',
        ].join('\n'),
      };
    case 'reorder_follow_up':
    case 'purchase_suggestion':
    default:
      return {
        kind: input.kind === 'reorder_follow_up' ? 'reorder_follow_up' : 'purchase_suggestion',
        title: `Purchase suggestion — ${label}`.slice(0, 200),
        body: [
          `${label}${supplier}: suggested follow-up from real stock / pricing signals.`,
          input.quantityOnHand != null
            ? `On-hand ${input.quantityOnHand}${input.reorderLevel != null ? `, reorder level ${input.reorderLevel}` : ''}.`
            : 'On-hand not linked — suggestion is not inventing stock.',
          input.suggestedQuantity != null
            ? `Suggested quantity (draft): ${input.suggestedQuantity}.`
            : 'Suggested quantity left blank when not grounded in reorder math.',
          input.unitCostCents != null
            ? `Estimated unit cost from real pricing: ${input.unitCostCents} cents.`
            : 'Estimated cost unavailable without real pricing.',
          '',
          'Draft recommendation only — not a purchase order. Never auto-purchased.',
          'Owner approval required to accept; draft PO creation is optional and still requires Owner PO approval to execute.',
        ].join('\n'),
      };
  }
}

export function listPiAuraConnections(): PiAuraConnection[] {
  return [
    {
      target: 'procurement',
      label: 'Procurement operations',
      href: '/procurement',
      status: 'available_link',
      note: 'Suppliers and purchase orders — recommendations never auto-create ordered POs.',
    },
    {
      target: 'inventory_intelligence',
      label: 'Inventory Intelligence',
      href: '/inventory-intelligence',
      status: 'available_link',
      note: 'Shortage / reorder alert drafts may inform purchase recommendation drafts.',
    },
    {
      target: 'inventory',
      label: 'Inventory operations',
      href: '/inventory/stock',
      status: 'available_link',
      note: 'Live stock overview from operational inventory.',
    },
    {
      target: 'command_centre',
      label: 'AURA Command Centre',
      href: '/aura/command-centre',
      status: 'available_link',
      note: 'Insight handoffs for Owner review.',
    },
    {
      target: 'executive_dashboard',
      label: 'Executive dashboard',
      href: '/',
      status: 'registry_stub',
      note: 'Executive surface link; procurement insights stay draft until acknowledged.',
    },
    {
      target: 'operations',
      label: 'Operations',
      href: '/scheduling',
      status: 'registry_stub',
      note: 'Ops handoff stub — no invented dispatch impact.',
    },
  ];
}

export function defaultPiSettings(partial?: {
  id?: string;
  recommendationsEnabled?: boolean;
  costComparisonsEnabled?: boolean;
  notes?: string | null;
  updatedAt?: string;
}): PiSettings {
  return {
    id: partial?.id ?? 'pending',
    autoPurchaseEnabled: false,
    recommendationsEnabled: partial?.recommendationsEnabled ?? true,
    costComparisonsEnabled: partial?.costComparisonsEnabled ?? true,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}

export function suggestedReorderQuantity(input: {
  quantityOnHand: number;
  reorderLevel: number;
}): number | null {
  if (input.reorderLevel <= 0) return null;
  if (input.quantityOnHand >= input.reorderLevel) return null;
  return Math.max(1, input.reorderLevel - input.quantityOnHand);
}
