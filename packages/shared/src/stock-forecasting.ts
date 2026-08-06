/**
 * Stock Forecasting & Automation (Department 5.3)
 *
 * Extends Inventory Intelligence (5.1) + Procurement Intelligence (5.2) with:
 * - Material demand / usage-trend / seasonal demand from real stock movements
 * - Shortage risk and reorder timing grounded in on-hand + lead times
 * - AURA reorder recommendation drafts (what / when / expected usage / why) — Owner approval only
 * - Optional draft PO on Owner accept via Procurement (never auto-order)
 *
 * Invariants:
 * - Recommendations only — never auto-purchase or auto-reorder
 * - No invented demand; forecasts/seasonal unavailable when history is insufficient
 * - Assumptions always explained
 * - Extends 5.1/5.2 — does not rebuild inventory or procurement
 */

import {
  canAccessInventoryIntelligence,
  canApproveInventoryIntelligenceDrafts,
  canWriteInventoryIntelligence,
} from './inventory-intelligence.js';

export type SfAvailability = 'available' | 'unavailable';

export type SfTrendDirection = 'up' | 'flat' | 'down' | 'unavailable';

export type SfShortageRisk = 'none' | 'watch' | 'high' | 'unavailable';

export type SfRecommendationKind =
  | 'reorder'
  | 'buy_now'
  | 'buy_soon'
  | 'watch'
  | 'maintenance_demand'
  | 'job_demand'
  | 'aura_handoff';

export type SfRecommendationStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'accepted';

export type SfInsightTarget =
  | 'command_centre'
  | 'executive_dashboard'
  | 'inventory_intelligence'
  | 'procurement_intelligence'
  | 'procurement'
  | 'maintenance'
  | 'jobs'
  | 'inventory'
  | 'operations';

export type SfInsightStatus = 'open' | 'acknowledged' | 'dismissed';

export type SfUsageTrendPoint = {
  day: string;
  consumed: number;
};

export type SfSeasonalDirection = 'higher' | 'lower' | 'similar' | 'unavailable';

export type SfSeasonalDemand = {
  availability: SfAvailability;
  method: 'month_over_year' | 'quarter_compare' | 'unavailable';
  currentPeriodKey: string | null;
  priorPeriodKey: string | null;
  currentPeriodConsumed: number | null;
  priorPeriodConsumed: number | null;
  /** current / prior when both > 0; null when unavailable. */
  index: number | null;
  direction: SfSeasonalDirection;
  rationale: string;
  assumptions: string[];
};

export type SfItemForecastSummary = {
  id: string;
  inventoryItemId: string;
  sku: string;
  name: string;
  availability: SfAvailability;
  quantityOnHand: number;
  reorderLevel: number;
  windowDays: number;
  issueEventCount: number;
  totalConsumed: number;
  avgDailyDemand: number | null;
  projectedDaysOfCover: number | null;
  suggestedReorderQty: number | null;
  suggestedReorderBy: string | null;
  leadTimeDays: number | null;
  shortageRisk: SfShortageRisk;
  trend: SfTrendDirection;
  seasonal: SfSeasonalDemand;
  assumptions: string[];
  rationale: string;
  jobLinkedConsumption: number;
  maintenanceSignalCount: number;
  sourceAlertId: string | null;
  createdAt: string;
};

export type SfReorderRecommendationSummary = {
  id: string;
  kind: SfRecommendationKind;
  status: SfRecommendationStatus;
  title: string;
  body: string;
  inventoryItemId: string | null;
  supplierId: string | null;
  forecastId: string | null;
  suggestedQuantity: number | null;
  suggestedReorderBy: string | null;
  whyNeeded: string;
  whenToBuy: string;
  whatToBuy: string;
  expectedUsage: string;
  sourceProcurementRecommendationId: string | null;
  draftPurchaseOrderId: string | null;
  /** Invariant: always false. */
  autoReorder: false;
  /** Invariant: always false. */
  autoPurchase: false;
  createdAt: string;
  decidedAt: string | null;
};

export type SfAuraInsightSummary = {
  id: string;
  target: SfInsightTarget;
  status: SfInsightStatus;
  title: string;
  insight: string;
  href: string | null;
  sourceForecastId: string | null;
  sourceRecommendationId: string | null;
  createdAt: string;
};

export type SfAuraConnection = {
  target: SfInsightTarget;
  label: string;
  href: string;
  status: 'available_link' | 'registry_stub';
  note: string;
};

export type SfForecastSnapshot = {
  availability: SfAvailability;
  itemCount: number;
  forecastableCount: number;
  unavailableCount: number;
  highRiskCount: number;
  rationale: string;
};

export type SfSettings = {
  id: string;
  /** Invariant: always false. */
  autoReorderEnabled: false;
  /** Invariant: always false. */
  autoPurchaseEnabled: false;
  forecastingEnabled: boolean;
  recommendationsEnabled: boolean;
  /** Minimum distinct issue/waste events required before a forecast is available. */
  minIssueEvents: number;
  /** Lookback window in days for demand calculation. */
  windowDays: number;
  notes: string | null;
  updatedAt: string;
};

export type SfDashboard = {
  summary: string;
  productClarification: {
    inventoryOps: string;
    inventoryIntelligence: string;
    procurementIntelligence: string;
    thisLayer: string;
  };
  policy: {
    autoReorderEnabled: false;
    autoPurchaseEnabled: false;
    requiresOwnerApproval: true;
    inventedDemand: false;
  };
  forecast: SfForecastSnapshot;
  itemForecasts: SfItemForecastSummary[];
  recommendations: SfReorderRecommendationSummary[];
  usageTrends: SfUsageTrendPoint[];
  auraInsights: SfAuraInsightSummary[];
  auraConnections: SfAuraConnection[];
  settings: SfSettings;
  pendingApprovals: number;
  maintenancePlanCount: number;
  supplierLinkCount: number;
};

export type RefreshSfForecastsRequest = {
  windowDays?: number;
  submitRecommendationsForApproval?: boolean;
};

export type DecideSfRecommendationRequest = {
  decision: 'approve' | 'reject' | 'accept';
  notes?: string;
  /** Owner accept only: optionally create a draft PO via Procurement (never ordered). */
  createDraftPurchaseOrder?: boolean;
};

export type UpdateSfSettingsRequest = {
  forecastingEnabled?: boolean;
  recommendationsEnabled?: boolean;
  minIssueEvents?: number;
  windowDays?: number;
  notes?: string | null;
};

export type CreateSfAuraInsightRequest = {
  target: SfInsightTarget;
  title: string;
  insight: string;
  href?: string;
  sourceForecastId?: string;
  sourceRecommendationId?: string;
};

export type AcknowledgeSfInsightRequest = {
  status: 'acknowledged' | 'dismissed';
};

// ─── Access (extends inventory intelligence RBAC) ─────────────────────────────

export function canAccessStockForecasting(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canAccessInventoryIntelligence(identity);
}

export function canWriteStockForecasting(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canWriteInventoryIntelligence(identity);
}

export function canApproveStockForecasting(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveInventoryIntelligenceDrafts(identity);
}

export function canManageStockForecastingSettings(identity: {
  roleName: string;
  permissions: string[];
}): boolean {
  return canApproveStockForecasting(identity);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const SF_PRODUCT_COPY = {
  inventoryOps:
    'Operational inventory (items, stock levels, movements) remains under /inventory.',
  inventoryIntelligence:
    'Inventory Intelligence alert drafts remain under /inventory-intelligence — this layer forecasts demand from the same real ledger.',
  procurementIntelligence:
    'Procurement Intelligence purchase drafts remain under /procurement-intelligence — reorder recommendations may link there but never auto-purchase.',
  thisLayer:
    'Stock Forecasting computes demand, shortage risk, reorder timing, usage trends, and seasonal demand from real movements / jobs / maintenance signals when available. Recommendations only — Owner approval required. Unavailable when history is insufficient. Never invents demand.',
} as const;

export const SF_DEFAULT_MIN_ISSUE_EVENTS = 3;
export const SF_DEFAULT_WINDOW_DAYS = 30;
/** Lookback used for seasonal comparisons when real history exists. */
export const SF_SEASONAL_LOOKBACK_DAYS = 400;
export const SF_SEASONAL_MIN_PERIOD_EVENTS = 2;

export function unavailableSeasonalDemand(rationale: string): SfSeasonalDemand {
  return {
    availability: 'unavailable',
    method: 'unavailable',
    currentPeriodKey: null,
    priorPeriodKey: null,
    currentPeriodConsumed: null,
    priorPeriodConsumed: null,
    index: null,
    direction: 'unavailable',
    rationale,
    assumptions: [
      'Seasonal demand requires real issue/waste history across comparable calendar periods.',
      'Never invents seasonal indexes when history is insufficient.',
    ],
  };
}

/**
 * Honest seasonal signal from real consumption points.
 * Prefers same calendar month year-over-year; else compares current quarter vs prior
 * quarter in history when both have enough events. Otherwise unavailable.
 */
export function computeSeasonalDemand(input: {
  points: Array<{ at: Date; consumed: number }>;
  now?: Date;
  minPeriodEvents?: number;
}): SfSeasonalDemand {
  const now = input.now ?? new Date();
  const minEvents = input.minPeriodEvents ?? SF_SEASONAL_MIN_PERIOD_EVENTS;
  const usable = input.points.filter((p) => p.consumed > 0);
  if (usable.length === 0) {
    return unavailableSeasonalDemand(
      'No real issue/waste consumption in seasonal lookback — seasonal demand unavailable (not invented).',
    );
  }

  const monthKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const quarterKey = (d: Date) =>
    `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;

  const byMonth = new Map<string, { consumed: number; events: number }>();
  const byQuarter = new Map<string, { consumed: number; events: number }>();
  for (const p of usable) {
    const mk = monthKey(p.at);
    const qk = quarterKey(p.at);
    const m = byMonth.get(mk) ?? { consumed: 0, events: 0 };
    m.consumed += p.consumed;
    m.events += 1;
    byMonth.set(mk, m);
    const q = byQuarter.get(qk) ?? { consumed: 0, events: 0 };
    q.consumed += p.consumed;
    q.events += 1;
    byQuarter.set(qk, q);
  }

  const currentMonth = monthKey(now);
  const priorYearMonth = `${now.getUTCFullYear() - 1}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const curMonth = byMonth.get(currentMonth);
  const priorMonth = byMonth.get(priorYearMonth);
  if (curMonth && priorMonth && curMonth.events >= minEvents && priorMonth.events >= minEvents) {
    const index =
      priorMonth.consumed > 0
        ? Number((curMonth.consumed / priorMonth.consumed).toFixed(3))
        : null;
    const direction: SfSeasonalDirection =
      index == null
        ? 'unavailable'
        : index > 1.15
          ? 'higher'
          : index < 0.85
            ? 'lower'
            : 'similar';
    return {
      availability: 'available',
      method: 'month_over_year',
      currentPeriodKey: currentMonth,
      priorPeriodKey: priorYearMonth,
      currentPeriodConsumed: curMonth.consumed,
      priorPeriodConsumed: priorMonth.consumed,
      index,
      direction,
      rationale: `Month-over-year from real issue/waste: ${currentMonth} consumed ${curMonth.consumed} vs ${priorYearMonth} ${priorMonth.consumed} (index ${index ?? 'n/a'}).`,
      assumptions: [
        'Compared same calendar month across years using real issue/waste movements only.',
        `Minimum ${minEvents} consumption event(s) required in each month.`,
        'No invented seasonal baseline.',
      ],
    };
  }

  const currentQuarter = quarterKey(now);
  const prevQuarterDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1),
  );
  const priorQuarter = quarterKey(prevQuarterDate);
  const curQ = byQuarter.get(currentQuarter);
  const priorQ = byQuarter.get(priorQuarter);
  if (curQ && priorQ && curQ.events >= minEvents && priorQ.events >= minEvents) {
    const index =
      priorQ.consumed > 0 ? Number((curQ.consumed / priorQ.consumed).toFixed(3)) : null;
    const direction: SfSeasonalDirection =
      index == null
        ? 'unavailable'
        : index > 1.15
          ? 'higher'
          : index < 0.85
            ? 'lower'
            : 'similar';
    return {
      availability: 'available',
      method: 'quarter_compare',
      currentPeriodKey: currentQuarter,
      priorPeriodKey: priorQuarter,
      currentPeriodConsumed: curQ.consumed,
      priorPeriodConsumed: priorQ.consumed,
      index,
      direction,
      rationale: `Quarter compare from real issue/waste: ${currentQuarter} consumed ${curQ.consumed} vs ${priorQuarter} ${priorQ.consumed} (index ${index ?? 'n/a'}). Same-month YoY history was insufficient.`,
      assumptions: [
        'Same-month year-over-year unavailable — fell back to adjacent quarter comparison on real history.',
        `Minimum ${minEvents} consumption event(s) required in each quarter.`,
        'No invented seasonal baseline.',
      ],
    };
  }

  return unavailableSeasonalDemand(
    `Insufficient comparable periods for seasonal demand (need same month YoY or two quarters with ≥${minEvents} real issue/waste event(s) each). Not invented.`,
  );
}

export function buildExpectedUsageText(input: {
  avgDailyDemand: number | null;
  suggestedQuantity: number | null;
  leadTimeDays: number | null;
  seasonal: SfSeasonalDemand;
}): string {
  if (input.avgDailyDemand == null) {
    return 'Expected usage unavailable — insufficient real consumption history (not invented).';
  }
  const lead = input.leadTimeDays ?? 7;
  const duringLead = Number((input.avgDailyDemand * lead).toFixed(2));
  const parts = [
    `Expected usage ≈ ${input.avgDailyDemand}/day from real issue/waste average; ~${duringLead} unit(s) over ${lead}-day lead window.`,
  ];
  if (input.suggestedQuantity != null) {
    parts.push(`Suggested buy ${input.suggestedQuantity} aims to restore cover from that rate.`);
  }
  if (input.seasonal.availability === 'available' && input.seasonal.direction !== 'unavailable') {
    parts.push(
      `Seasonal signal ${input.seasonal.direction} (${input.seasonal.method}: ${input.seasonal.currentPeriodKey} vs ${input.seasonal.priorPeriodKey}, index ${input.seasonal.index ?? 'n/a'}).`,
    );
  } else {
    parts.push('Seasonal adjustment unavailable — not applied.');
  }
  return parts.join(' ');
}

export function buildSfForecastSnapshot(input: {
  itemCount: number;
  forecastableCount: number;
  unavailableCount: number;
  highRiskCount: number;
}): SfForecastSnapshot {
  if (input.itemCount === 0) {
    return {
      availability: 'unavailable',
      itemCount: 0,
      forecastableCount: 0,
      unavailableCount: 0,
      highRiskCount: 0,
      rationale:
        'No inventory items yet — forecasting unavailable (not invented). Create real catalogue records first.',
    };
  }
  if (input.forecastableCount === 0) {
    return {
      availability: 'unavailable',
      itemCount: input.itemCount,
      forecastableCount: 0,
      unavailableCount: input.unavailableCount,
      highRiskCount: 0,
      rationale:
        'Insufficient real issue/waste movement history for demand forecasts — unavailable (not invented). Record stock issues from jobs before forecasting.',
    };
  }
  return {
    availability: 'available',
    itemCount: input.itemCount,
    forecastableCount: input.forecastableCount,
    unavailableCount: input.unavailableCount,
    highRiskCount: input.highRiskCount,
    rationale: `Forecasts available for ${input.forecastableCount} of ${input.itemCount} item(s) with sufficient real consumption history. ${input.unavailableCount} item(s) remain unavailable. High shortage risk: ${input.highRiskCount}.`,
  };
}

export function computeAvgDailyDemand(input: {
  totalConsumed: number;
  windowDays: number;
  issueEventCount: number;
  minIssueEvents: number;
}): { avgDailyDemand: number | null; availability: SfAvailability; rationale: string } {
  const windowDays = Math.max(1, input.windowDays);
  if (input.issueEventCount < input.minIssueEvents || input.totalConsumed <= 0) {
    return {
      avgDailyDemand: null,
      availability: 'unavailable',
      rationale: `Need at least ${input.minIssueEvents} real issue/waste event(s) with positive consumption in the last ${windowDays} day(s); found ${input.issueEventCount} event(s), consumed ${input.totalConsumed}. Demand not invented.`,
    };
  }
  const avg = input.totalConsumed / windowDays;
  return {
    avgDailyDemand: Number(avg.toFixed(4)),
    availability: 'available',
    rationale: `Average daily demand ${avg.toFixed(4)} = ${input.totalConsumed} units consumed across ${input.issueEventCount} issue/waste event(s) over ${windowDays} day(s).`,
  };
}

export function computeDaysOfCover(input: {
  quantityOnHand: number;
  avgDailyDemand: number | null;
}): number | null {
  if (input.avgDailyDemand == null || input.avgDailyDemand <= 0) return null;
  return Number((input.quantityOnHand / input.avgDailyDemand).toFixed(2));
}

export function computeShortageRisk(input: {
  availability: SfAvailability;
  quantityOnHand: number;
  reorderLevel: number;
  projectedDaysOfCover: number | null;
  leadTimeDays: number | null;
}): SfShortageRisk {
  if (input.availability === 'unavailable') return 'unavailable';
  if (input.quantityOnHand <= 0) return 'high';
  if (input.reorderLevel > 0 && input.quantityOnHand <= input.reorderLevel) return 'high';
  if (
    input.projectedDaysOfCover != null &&
    input.leadTimeDays != null &&
    input.projectedDaysOfCover <= input.leadTimeDays
  ) {
    return 'high';
  }
  if (input.projectedDaysOfCover != null && input.projectedDaysOfCover <= 14) return 'watch';
  return 'none';
}

export function computeTrend(input: {
  firstHalfConsumed: number;
  secondHalfConsumed: number;
  availability: SfAvailability;
}): SfTrendDirection {
  if (input.availability === 'unavailable') return 'unavailable';
  const a = input.firstHalfConsumed;
  const b = input.secondHalfConsumed;
  if (a === 0 && b === 0) return 'flat';
  if (b > a * 1.15) return 'up';
  if (b < a * 0.85) return 'down';
  return 'flat';
}

export function suggestedReorderByDate(input: {
  projectedDaysOfCover: number | null;
  leadTimeDays: number | null;
  now?: Date;
}): string | null {
  if (input.projectedDaysOfCover == null) return null;
  const lead = input.leadTimeDays ?? 0;
  const daysUntilOrder = Math.max(0, Math.floor(input.projectedDaysOfCover - lead));
  const base = input.now ?? new Date();
  const when = new Date(base.getTime() + daysUntilOrder * 24 * 60 * 60 * 1000);
  return when.toISOString().slice(0, 10);
}

export function suggestedForecastReorderQty(input: {
  quantityOnHand: number;
  reorderLevel: number;
  avgDailyDemand: number | null;
  leadTimeDays: number | null;
  coverTargetDays?: number;
}): number | null {
  if (input.avgDailyDemand == null || input.avgDailyDemand <= 0) {
    if (input.reorderLevel > 0 && input.quantityOnHand < input.reorderLevel) {
      return Math.max(1, input.reorderLevel - input.quantityOnHand);
    }
    return null;
  }
  const coverTarget = input.coverTargetDays ?? Math.max(14, (input.leadTimeDays ?? 0) + 7);
  const targetOnHand = Math.ceil(input.avgDailyDemand * coverTarget);
  const fromReorder =
    input.reorderLevel > 0 ? Math.max(0, input.reorderLevel - input.quantityOnHand) : 0;
  const fromCover = Math.max(0, targetOnHand - input.quantityOnHand);
  const qty = Math.max(fromReorder, fromCover);
  return qty > 0 ? qty : null;
}

export function buildSfReorderRecommendationDraft(input: {
  kind: SfRecommendationKind;
  sku: string;
  name: string;
  suggestedQuantity: number | null;
  suggestedReorderBy: string | null;
  shortageRisk: SfShortageRisk;
  avgDailyDemand: number | null;
  projectedDaysOfCover: number | null;
  leadTimeDays: number | null;
  seasonal: SfSeasonalDemand;
  assumptions: string[];
}): {
  kind: SfRecommendationKind;
  title: string;
  body: string;
  whatToBuy: string;
  whenToBuy: string;
  whyNeeded: string;
  expectedUsage: string;
} {
  const label = `${input.sku} — ${input.name}`;
  const whatToBuy =
    input.suggestedQuantity != null
      ? `Buy ${input.suggestedQuantity} unit(s) of ${label}`
      : `Review purchase need for ${label} (quantity not grounded — left blank)`;
  const whenToBuy =
    input.suggestedReorderBy != null
      ? `Suggested order-by date ${input.suggestedReorderBy} (cover minus supplier lead time${input.leadTimeDays != null ? ` ${input.leadTimeDays}d` : ''}).`
      : 'Order-by date unavailable until demand history supports days-of-cover.';
  const whyNeeded = [
    input.shortageRisk === 'high'
      ? 'Shortage risk is high from real on-hand vs reorder/lead-time cover.'
      : input.shortageRisk === 'watch'
        ? 'Watch-level cover from real consumption trend.'
        : 'Forecast signal from real usage history.',
    input.avgDailyDemand != null
      ? `Avg daily demand ${input.avgDailyDemand}; projected cover ${input.projectedDaysOfCover ?? 'n/a'} day(s).`
      : 'Avg daily demand unavailable — recommendation still draft-only.',
    input.seasonal.availability === 'available'
      ? `Seasonal demand ${input.seasonal.direction} vs prior comparable period.`
      : 'Seasonal demand unavailable — not used as a purchase driver.',
  ].join(' ');
  const expectedUsage = buildExpectedUsageText({
    avgDailyDemand: input.avgDailyDemand,
    suggestedQuantity: input.suggestedQuantity,
    leadTimeDays: input.leadTimeDays,
    seasonal: input.seasonal,
  });

  return {
    kind: input.kind,
    title: `Reorder recommendation — ${input.sku}`.slice(0, 200),
    body: [
      whatToBuy,
      whenToBuy,
      `Expected usage: ${expectedUsage}`,
      whyNeeded,
      '',
      'Assumptions:',
      ...input.assumptions.map((a) => `- ${a}`),
      '',
      'Draft recommendation only — not a purchase order. Never auto-reordered or auto-purchased.',
      'Owner approval required before any procurement follow-up. Accept may create a draft PO only.',
    ].join('\n'),
    whatToBuy,
    whenToBuy,
    whyNeeded,
    expectedUsage,
  };
}

export function listSfAuraConnections(): SfAuraConnection[] {
  return [
    {
      target: 'inventory_intelligence',
      label: 'Inventory Intelligence',
      href: '/inventory-intelligence',
      status: 'available_link',
      note: 'Shortage alert drafts and usage signals feed forecasting inputs.',
    },
    {
      target: 'procurement_intelligence',
      label: 'Procurement Intelligence',
      href: '/procurement-intelligence',
      status: 'available_link',
      note: 'Reorder drafts may link to purchase recommendation drafts — never auto-purchase.',
    },
    {
      target: 'procurement',
      label: 'Procurement operations',
      href: '/procurement',
      status: 'available_link',
      note: 'Suppliers and POs remain operational under /procurement.',
    },
    {
      target: 'inventory',
      label: 'Inventory operations',
      href: '/inventory/stock',
      status: 'available_link',
      note: 'Live stock overview from operational inventory.',
    },
    {
      target: 'jobs',
      label: 'Jobs',
      href: '/jobs',
      status: 'available_link',
      note: 'Job-linked stock issues contribute to demand when recorded.',
    },
    {
      target: 'maintenance',
      label: 'Recurring Maintenance',
      href: '/recurring-maintenance',
      status: 'available_link',
      note: 'Active maintenance plans are counted as demand context when present — no invented parts lists.',
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
      note: 'Executive surface link; forecasts stay recommendation-only.',
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

export function defaultSfSettings(partial?: {
  id?: string;
  forecastingEnabled?: boolean;
  recommendationsEnabled?: boolean;
  minIssueEvents?: number;
  windowDays?: number;
  notes?: string | null;
  updatedAt?: string;
}): SfSettings {
  return {
    id: partial?.id ?? 'pending',
    autoReorderEnabled: false,
    autoPurchaseEnabled: false,
    forecastingEnabled: partial?.forecastingEnabled ?? true,
    recommendationsEnabled: partial?.recommendationsEnabled ?? true,
    minIssueEvents: partial?.minIssueEvents ?? SF_DEFAULT_MIN_ISSUE_EVENTS,
    windowDays: partial?.windowDays ?? SF_DEFAULT_WINDOW_DAYS,
    notes: partial?.notes ?? null,
    updatedAt: partial?.updatedAt ?? new Date(0).toISOString(),
  };
}
