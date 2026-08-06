/**
 * Inventory Intelligence Foundation (Department 5.1)
 *
 * Extends existing inventory / procurement / job-material modules with:
 * - Stock tracking visibility and warehouse overview (real records only)
 * - Material usage pattern signals from real stock movements / job materials
 * - Shortage / reorder alert drafts (never auto-PO / auto-reorder)
 * - AURA insight handoffs from real inventory signals
 *
 * Invariants:
 * - No fake stock levels, usage, or shortages
 * - Unavailable when no real signals — never invented
 * - No automatic purchase orders or stock mutations from this layer
 * - Owner approval required for alert drafts and sensitive settings
 */

export type InvIntelAlertKind =
  | 'shortage'
  | 'below_reorder'
  | 'zero_stock'
  | 'usage_spike'
  | 'slow_moving'
  | 'warehouse_visibility';

export type InvIntelAlertStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'acknowledged';

export type InvIntelUsageKind =
  | 'job_issue'
  | 'job_return'
  | 'po_receipt'
  | 'adjustment'
  | 'waste'
  | 'net_consumption';

export type InvIntelInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'procurement'
  | 'operations'
  | 'jobs'
  | 'inventory';

export type InvIntelInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type InvIntelAvailability = 'available' | 'unavailable';

export type InvIntelStockRow = {
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  status: string;
  reorderLevel: number;
  totalQuantityOnHand: number;
  isLowStock: boolean;
  locationBreakdown: Array<{
    locationId: string;
    locationName: string;
    locationType: string;
    quantityOnHand: number;
  }>;
};

export type InvIntelWarehouseRow = {
  locationId: string;
  name: string;
  code: string | null;
  locationType: string;
  isDefault: boolean;
  vehicleId: string | null;
  distinctItemCount: number;
  totalUnitsOnHand: number;
};

export type InvIntelMovementRow = {
  id: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  locationId: string;
  locationName: string;
  movementType: string;
  quantityDelta: number;
  quantityAfter: number;
  jobId: string | null;
  purchaseOrderId: string | null;
  recordedByUserId: string | null;
  createdAt: string;
};

export type InvIntelMaterialUsageRow = {
  id: string;
  jobId: string;
  inventoryItemId: string | null;
  itemSku: string | null;
  itemName: string | null;
  quantity: number;
  materialSource: string;
  status: string;
  locationId: string | null;
  stockMovementId: string | null;
  recordedByUserId: string;
  createdAt: string;
};

export type InvIntelAlertDraftSummary = {
  id: string;
  kind: InvIntelAlertKind;
  status: InvIntelAlertStatus;
  title: string;
  body: string;
  inventoryItemId: string | null;
  locationId: string | null;
  quantityOnHand: number | null;
  reorderLevel: number | null;
  /** Invariant: always false — this layer never auto-creates POs. */
  autoReorder: false;
  /** Invariant: always false — this layer never mutates stock. */
  autoStockMutation: false;
  createdAt: string;
  decidedAt: string | null;
};

export type InvIntelUsageSignalSummary = {
  id: string;
  kind: InvIntelUsageKind;
  title: string;
  body: string;
  inventoryItemId: string | null;
  jobId: string | null;
  purchaseOrderId: string | null;
  movementCount: number;
  netQuantityDelta: number;
  windowDays: number;
  availability: InvIntelAvailability;
  createdAt: string;
};

export type InvIntelAuraInsightSummary = {
  id: string;
  target: InvIntelInsightTarget;
  status: InvIntelInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceAlertId: string | null;
  sourceUsageSignalId: string | null;
  createdAt: string;
};

export type InvIntelAuraConnection = {
  target: InvIntelInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type InvIntelSettings = {
  id: string;
  /** Invariant: always false. */
  autoReorderEnabled: false;
  /** Invariant: always false. */
  autoStockMutationEnabled: false;
  alertDraftsEnabled: boolean;
  usageSignalsEnabled: boolean;
  shortageThresholdMode: 'reorder_level' | 'zero_only';
  notes: string | null;
  updatedAt: string;
};

export type InvIntelStockSnapshot = {
  availability: InvIntelAvailability;
  itemCount: number;
  locationCount: number;
  lowStockCount: number;
  totalUnitsOnHand: number;
  rationale: string;
};

export type InvIntelUsageSnapshot = {
  availability: InvIntelAvailability;
  movementCount: number;
  materialLineCount: number;
  jobsWithUsage: number;
  rationale: string;
};

export type InvIntelDashboard = {
  summary: string;
  productClarification: {
    inventoryOps: string;
    procurement: string;
    thisLayer: string;
  };
  policy: {
    autoReorderEnabled: false;
    autoStockMutationEnabled: false;
    requiresOwnerApproval: true;
    fakeStock: false;
  };
  stock: InvIntelStockSnapshot;
  usage: InvIntelUsageSnapshot;
  warehouses: InvIntelWarehouseRow[];
  stockRows: InvIntelStockRow[];
  recentMovements: InvIntelMovementRow[];
  materialUsage: InvIntelMaterialUsageRow[];
  alertDrafts: InvIntelAlertDraftSummary[];
  usageSignals: InvIntelUsageSignalSummary[];
  auraInsights: InvIntelAuraInsightSummary[];
  auraConnections: InvIntelAuraConnection[];
  settings: InvIntelSettings;
  pendingApprovals: number;
  supplierLinkCount: number;
  openPurchaseOrderCount: number;
};

export type RefreshInvIntelAlertsRequest = {
  submitForApproval?: boolean;
};

export type DecideInvIntelAlertRequest = {
  decision: 'approve' | 'reject' | 'acknowledge';
  notes?: string;
};

export type RefreshInvIntelUsageRequest = {
  windowDays?: number;
};

export type UpdateInvIntelSettingsRequest = {
  alertDraftsEnabled?: boolean;
  usageSignalsEnabled?: boolean;
  shortageThresholdMode?: 'reorder_level' | 'zero_only';
  notes?: string | null;
};

export type CreateInvIntelAuraInsightRequest = {
  target: InvIntelInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceAlertId?: string;
  sourceUsageSignalId?: string;
};

export type AcknowledgeInvIntelInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access ───────────────────────────────────────────────────────────────────

export function canAccessInventoryIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (identity.roleName === 'Technician' || identity.roleName === 'Client') {
    return false;
  }
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('inventory:read') ||
    identity.permissions.includes('inventory:write') ||
    identity.permissions.includes('procurement:read') ||
    identity.permissions.includes('procurement:write') ||
    identity.permissions.includes('agents:read')
  );
}

export function canWriteInventoryIntelligence(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canAccessInventoryIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.permissions.includes('inventory:write') ||
    identity.permissions.includes('procurement:write')
  );
}

export function canApproveInventoryIntelligenceDrafts(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  if (!canWriteInventoryIntelligence(identity)) return false;
  if (identity.permissions.includes('*')) return true;
  return (
    identity.roleName === 'Company Owner' ||
    identity.roleName === 'Owner' ||
    identity.roleName === 'Platform Owner'
  );
}

export function canManageInventoryIntelligenceSettings(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveInventoryIntelligenceDrafts(identity);
}

// ─── Pure helpers (honest empty / draft builders) ─────────────────────────────

export const INV_INTEL_PRODUCT_COPY = {
  inventoryOps:
    'Operational inventory (items, stock levels, movements) remains under /inventory — this layer does not replace it.',
  procurement:
    'Suppliers and purchase orders remain under /procurement — alert drafts never auto-create POs.',
  thisLayer:
    'Inventory Intelligence surfaces real stock, warehouse visibility, usage history, and Owner-gated alert/insight drafts. No fake stock. Never auto-reorder.',
} as const;

export function buildInvIntelStockSnapshot(input: {
  itemCount: number;
  locationCount: number;
  lowStockCount: number;
  totalUnitsOnHand: number;
}): InvIntelStockSnapshot {
  if (input.itemCount === 0 && input.locationCount === 0) {
    return {
      availability: 'unavailable',
      itemCount: 0,
      locationCount: 0,
      lowStockCount: 0,
      totalUnitsOnHand: 0,
      rationale:
        'No inventory items or locations yet — stock intelligence unavailable (not invented). Create real catalogue and warehouse records first.',
    };
  }
  return {
    availability: 'available',
    itemCount: input.itemCount,
    locationCount: input.locationCount,
    lowStockCount: input.lowStockCount,
    totalUnitsOnHand: input.totalUnitsOnHand,
    rationale: `Derived from ${input.itemCount} item(s) across ${input.locationCount} location(s). Low-stock count uses real on-hand vs reorder level only.`,
  };
}

export function buildInvIntelUsageSnapshot(input: {
  movementCount: number;
  materialLineCount: number;
  jobsWithUsage: number;
}): InvIntelUsageSnapshot {
  if (input.movementCount === 0 && input.materialLineCount === 0) {
    return {
      availability: 'unavailable',
      movementCount: 0,
      materialLineCount: 0,
      jobsWithUsage: 0,
      rationale:
        'No stock movements or job material lines yet — usage patterns unavailable (not invented).',
    };
  }
  return {
    availability: 'available',
    movementCount: input.movementCount,
    materialLineCount: input.materialLineCount,
    jobsWithUsage: input.jobsWithUsage,
    rationale: `Usage derived from ${input.movementCount} movement(s) and ${input.materialLineCount} job material line(s) across ${input.jobsWithUsage} job(s).`,
  };
}

export function buildShortageAlertDraft(input: {
  sku: string;
  name: string;
  quantityOnHand: number;
  reorderLevel: number;
  locationName?: string | null;
}): { kind: InvIntelAlertKind; title: string; body: string } {
  const kind: InvIntelAlertKind =
    input.quantityOnHand <= 0 ? 'zero_stock' : 'below_reorder';
  const loc = input.locationName ? ` at ${input.locationName}` : '';
  return {
    kind,
    title: `${kind === 'zero_stock' ? 'Zero stock' : 'Below reorder'} — ${input.sku}`.slice(0, 200),
    body: [
      `${input.name} (${input.sku})${loc}: on-hand ${input.quantityOnHand}, reorder level ${input.reorderLevel}.`,
      '',
      'Alert draft only — not a purchase order. Not an automatic stock change.',
      'Owner approval required before any procurement follow-up.',
    ].join('\n'),
  };
}

export function buildUsageSignalDraft(input: {
  kind: InvIntelUsageKind;
  sku: string;
  name: string;
  netQuantityDelta: number;
  movementCount: number;
  windowDays: number;
  jobId?: string | null;
}): { title: string; body: string } {
  return {
    title: `Usage signal — ${input.sku} (${input.kind})`.slice(0, 200),
    body: [
      `${input.name} (${input.sku}): net delta ${input.netQuantityDelta} over ${input.movementCount} movement(s) in the last ${input.windowDays} day(s).`,
      input.jobId ? `Linked job: ${input.jobId}` : 'No single job link (aggregated).',
      '',
      'Signal draft from real ledger rows only. Not a forecast invention. Not an auto-reorder.',
    ].join('\n'),
  };
}

export function listInvIntelAuraConnections(): InvIntelAuraConnection[] {
  return [
    {
      target: 'inventory',
      label: 'Inventory operations',
      href: '/inventory/stock',
      status: 'available_link',
      note: 'Live stock overview from operational inventory.',
    },
    {
      target: 'procurement',
      label: 'Procurement',
      href: '/procurement',
      status: 'available_link',
      note: 'Suppliers and purchase orders — alert drafts do not auto-create POs.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Material usage links to real jobs when recorded.',
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
      note: 'Executive surface link; inventory insights stay draft until acknowledged.',
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

export function defaultInvIntelSettings(partial?: {
  id?: string;
  alertDraftsEnabled?: boolean;
  usageSignalsEnabled?: boolean;
  shortageThresholdMode?: 'reorder_level' | 'zero_only';
  notes?: string | null;
  updatedAt?: string;
}): InvIntelSettings {
  return {
    id: partial?.id ?? 'pending',
    autoReorderEnabled: false,
    autoStockMutationEnabled: false,
    alertDraftsEnabled: partial?.alertDraftsEnabled ?? true,
    usageSignalsEnabled: partial?.usageSignalsEnabled ?? true,
    shortageThresholdMode: partial?.shortageThresholdMode ?? 'reorder_level',
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}
