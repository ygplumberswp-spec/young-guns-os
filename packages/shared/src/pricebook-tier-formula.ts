/**
 * Row 92 — Configurable Young Guns Pricebook Tier Formula
 *
 * Canonical tenant-scoped tier multiplier rules.
 * Authoritative inputs are MULTIPLIERS (not “220% markup”).
 *
 * CRITICAL:
 * - Global automatic pricing remains OFF
 * - YG rule status must stay DRAFT / INACTIVE in Row 92
 * - Real Young Guns catalogue prices must not change
 * - Row 93 override / Row 122 activation — NOT started
 * - Xero writes = 0 · customer sends = 0 · production = 0
 */

import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';

export const PRICEBOOK_TIER_FORMULA_KEY = 'pricebook-tier-formula' as const;

export const PRICEBOOK_TIER_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type PricebookRuleStatus = 'DRAFT' | 'INACTIVE' | 'ACTIVE' | 'RETIRED';

export type PricebookBaseCostType =
  | 'UNIT_COST_CENTS'
  | 'SUPPLIER_NET_COST'
  | 'SUPPLIER_NET_DISCOUNTED'
  | 'UNKNOWN';

export type PricebookTier = {
  /** Inclusive lower bound in cents (0 for first tier). */
  minCentsInclusive: number;
  /** Inclusive upper bound in cents; null = infinity. */
  maxCentsInclusive: number | null;
  /**
   * Multiplier as rational a/b for exact cent math.
   * Example 2.2 → { numerator: 11, denominator: 5 }
   */
  multiplierNumerator: number;
  multiplierDenominator: number;
  label: string;
};

export type PricebookRuleSet = {
  id: string;
  companyId: string;
  name: string;
  version: number;
  status: PricebookRuleStatus;
  baseCostType: PricebookBaseCostType;
  currency: string;
  tiers: PricebookTier[];
  globalAutomationEnabled: boolean;
  createdAt?: string | null;
  createdBy?: string | null;
  approvedAt?: string | null;
  activatedAt?: string | null;
  retiredAt?: string | null;
};

export type PricebookResolveInput = {
  baseCostCents: number | null | undefined;
  ruleSet: PricebookRuleSet;
  costProvenance?: {
    source: string;
    freshness?: string | null;
    isDiscountedNet?: boolean;
    alreadyDiscounted?: boolean;
  } | null;
};

export type PricebookResolveResult =
  | {
      ok: true;
      baseCostCents: number;
      matchedTierIndex: number;
      matchedTierLabel: string;
      multiplier: number;
      multiplierDisplay: string;
      sellPriceExVatCents: number;
      rounding: 'HALF_UP_CENTS';
      ruleVersion: number;
      ruleStatus: PricebookRuleStatus;
      baseCostType: PricebookBaseCostType;
      explanation: string;
      costProvenance: {
        source: string;
        freshness: string | null;
        isDiscountedNet: boolean;
      };
      activationStatus: 'DISABLED' | 'ACTIVE';
      globalAutomationEnabled: false | true;
      vatNote: string;
    }
  | {
      ok: false;
      code:
        | 'PRICE_BASE_COST_MISSING'
        | 'PRICE_BASE_COST_INVALID'
        | 'PRICE_BASE_COST_REVIEW_REQUIRED'
        | 'PRICE_RULE_INACTIVE_APPLY_BLOCKED'
        | 'PRICE_RULE_INVALID'
        | 'PRICE_DOUBLE_DISCOUNT_BLOCKED';
      message: string;
      ruleVersion?: number;
      ruleStatus?: PricebookRuleStatus;
    };

export type PricebookValidationResult = {
  ok: boolean;
  code?: string;
  message: string;
};

export type PricebookAuditEventType =
  | 'price_rule_created'
  | 'price_rule_updated'
  | 'price_rule_previewed'
  | 'price_rule_activation_blocked'
  | 'price_rule_retired';

/**
 * Young Guns draft formula — multipliers, not markup % labels.
 * Status DRAFT · globalAutomationEnabled false · NOT authorised to mutate catalogue.
 *
 * Base-cost authority: prefers SUPPLIER_NET_DISCOUNTED when provenance confirms a
 * genuine net/discounted cost. Falls back to inventory unit_cost_cents only when
 * that field is the approved cost basis (never retail/RRP/sell, never guessed discount).
 */
export const YOUNG_GUNS_DRAFT_TIER_FORMULA: Omit<
  PricebookRuleSet,
  'id' | 'companyId' | 'createdAt' | 'createdBy'
> = {
  name: 'Young Guns Pricebook Tier Formula',
  version: 1,
  status: 'DRAFT',
  baseCostType: 'SUPPLIER_NET_DISCOUNTED',
  currency: 'ZAR',
  globalAutomationEnabled: false,
  approvedAt: null,
  activatedAt: null,
  retiredAt: null,
  tiers: [
    {
      minCentsInclusive: 0,
      maxCentsInclusive: 50_000,
      multiplierNumerator: 11,
      multiplierDenominator: 5,
      label: 'Up to R500 → 2.2x',
    },
    {
      minCentsInclusive: 50_001,
      maxCentsInclusive: 150_000,
      multiplierNumerator: 2,
      multiplierDenominator: 1,
      label: 'R500.01–R1,500 → 2.0x',
    },
    {
      minCentsInclusive: 150_001,
      maxCentsInclusive: null,
      multiplierNumerator: 168,
      multiplierDenominator: 100,
      label: 'Above R1,500 → 1.68x',
    },
  ],
};

export function multiplierToDisplay(numerator: number, denominator: number): string {
  const value = numerator / denominator;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${text}x`;
}

export function applyMultiplierExactCents(
  baseCostCents: number,
  numerator: number,
  denominator: number,
): number {
  if (!Number.isInteger(baseCostCents) || baseCostCents < 0) {
    throw new Error('Base cost must be a non-negative integer cent amount');
  }
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) {
    throw new Error('Multiplier fraction invalid');
  }
  // Half-up via integer arithmetic: round(n/d) = floor((n + d/2) / d) for positive.
  return Math.floor((baseCostCents * numerator + Math.floor(denominator / 2)) / denominator);
}

export function validatePricebookRuleSet(ruleSet: PricebookRuleSet): PricebookValidationResult {
  if (!ruleSet.companyId?.trim()) {
    return { ok: false, code: 'PRICE_RULE_INVALID', message: 'companyId is required' };
  }
  if (ruleSet.currency !== 'ZAR') {
    return { ok: false, code: 'PRICE_RULE_INVALID', message: 'Unknown or unsupported currency for Row 92' };
  }
  if (!Array.isArray(ruleSet.tiers) || ruleSet.tiers.length === 0) {
    return { ok: false, code: 'PRICE_RULE_INVALID', message: 'At least one tier is required' };
  }
  if (ruleSet.globalAutomationEnabled === true && ruleSet.status !== 'ACTIVE') {
    return {
      ok: false,
      code: 'PRICE_RULE_INVALID',
      message: 'globalAutomationEnabled cannot be true unless status is ACTIVE',
    };
  }

  const sorted = [...ruleSet.tiers].sort(
    (a, b) => a.minCentsInclusive - b.minCentsInclusive,
  );
  for (let i = 0; i < sorted.length; i += 1) {
    const tier = sorted[i]!;
    if (tier.minCentsInclusive < 0) {
      return { ok: false, code: 'PRICE_RULE_INVALID', message: 'Negative tier thresholds are not allowed' };
    }
    if (tier.multiplierNumerator <= 0 || tier.multiplierDenominator <= 0) {
      return { ok: false, code: 'PRICE_RULE_INVALID', message: 'Zero/negative multipliers are not allowed' };
    }
    if (
      tier.maxCentsInclusive != null &&
      tier.maxCentsInclusive < tier.minCentsInclusive
    ) {
      return { ok: false, code: 'PRICE_RULE_INVALID', message: 'Tier max must be >= min' };
    }
    if (i > 0) {
      const prev = sorted[i - 1]!;
      if (prev.maxCentsInclusive == null) {
        return { ok: false, code: 'PRICE_RULE_INVALID', message: 'Only the last tier may be unbounded' };
      }
      if (tier.minCentsInclusive <= prev.maxCentsInclusive) {
        return { ok: false, code: 'PRICE_RULE_INVALID', message: 'Overlapping tiers are not allowed' };
      }
      if (tier.minCentsInclusive !== prev.maxCentsInclusive + 1) {
        return {
          ok: false,
          code: 'PRICE_RULE_INVALID',
          message: 'Tier gaps are not allowed — tiers must be contiguous',
        };
      }
    }
  }
  return { ok: true, message: 'Rule set is valid' };
}

export function matchPricebookTier(
  baseCostCents: number,
  tiers: PricebookTier[],
): { index: number; tier: PricebookTier } | null {
  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i]!;
    const maxOk =
      tier.maxCentsInclusive == null || baseCostCents <= tier.maxCentsInclusive;
    if (baseCostCents >= tier.minCentsInclusive && maxOk) {
      return { index: i, tier };
    }
  }
  return null;
}

/**
 * Server-authoritative sell-price resolver.
 * Does NOT apply/mutate catalogue prices. Preview/calculation only unless a
 * future authorised workflow activates a rule (blocked in Row 92).
 */
export function resolvePricebookSellPrice(input: PricebookResolveInput): PricebookResolveResult {
  const validation = validatePricebookRuleSet(input.ruleSet);
  if (!validation.ok) {
    return {
      ok: false,
      code: 'PRICE_RULE_INVALID',
      message: validation.message,
      ruleVersion: input.ruleSet.version,
      ruleStatus: input.ruleSet.status,
    };
  }

  if (input.baseCostCents == null || !Number.isFinite(input.baseCostCents)) {
    return {
      ok: false,
      code: 'PRICE_BASE_COST_MISSING',
      message: 'Base cost is missing — formula must not invent a sell price',
      ruleVersion: input.ruleSet.version,
      ruleStatus: input.ruleSet.status,
    };
  }
  if (!Number.isInteger(input.baseCostCents)) {
    return {
      ok: false,
      code: 'PRICE_BASE_COST_INVALID',
      message: 'Base cost must be integer cents',
      ruleVersion: input.ruleSet.version,
      ruleStatus: input.ruleSet.status,
    };
  }
  if (input.baseCostCents < 0) {
    return {
      ok: false,
      code: 'PRICE_BASE_COST_INVALID',
      message: 'Negative base cost is invalid',
      ruleVersion: input.ruleSet.version,
      ruleStatus: input.ruleSet.status,
    };
  }
  if (input.ruleSet.baseCostType === 'UNKNOWN') {
    return {
      ok: false,
      code: 'PRICE_BASE_COST_REVIEW_REQUIRED',
      message: 'Base cost type is UNKNOWN — do not apply formula',
      ruleVersion: input.ruleSet.version,
      ruleStatus: input.ruleSet.status,
    };
  }
  if (
    input.costProvenance?.alreadyDiscounted === true &&
    input.costProvenance?.isDiscountedNet === false
  ) {
    return {
      ok: false,
      code: 'PRICE_DOUBLE_DISCOUNT_BLOCKED',
      message: 'Supplier discount must not be applied twice',
      ruleVersion: input.ruleSet.version,
      ruleStatus: input.ruleSet.status,
    };
  }
  if (
    (input.ruleSet.baseCostType === 'SUPPLIER_NET_DISCOUNTED' ||
      input.ruleSet.baseCostType === 'SUPPLIER_NET_COST') &&
    input.costProvenance?.isDiscountedNet !== true
  ) {
    return {
      ok: false,
      code: 'PRICE_BASE_COST_REVIEW_REQUIRED',
      message:
        'Net/discounted supplier cost provenance required — do not guess discounts or treat sell/RRP as cost',
      ruleVersion: input.ruleSet.version,
      ruleStatus: input.ruleSet.status,
    };
  }
  if (input.baseCostCents === 0) {
    return {
      ok: false,
      code: 'PRICE_BASE_COST_REVIEW_REQUIRED',
      message:
        'Zero base cost cannot silently produce a meaningful sell price — REVIEW REQUIRED',
      ruleVersion: input.ruleSet.version,
      ruleStatus: input.ruleSet.status,
    };
  }

  const matched = matchPricebookTier(input.baseCostCents, input.ruleSet.tiers);
  if (!matched) {
    return {
      ok: false,
      code: 'PRICE_RULE_INVALID',
      message: 'No tier matched base cost',
      ruleVersion: input.ruleSet.version,
      ruleStatus: input.ruleSet.status,
    };
  }

  const sellPriceExVatCents = applyMultiplierExactCents(
    input.baseCostCents,
    matched.tier.multiplierNumerator,
    matched.tier.multiplierDenominator,
  );
  const multiplier = matched.tier.multiplierNumerator / matched.tier.multiplierDenominator;
  const multiplierDisplay = multiplierToDisplay(
    matched.tier.multiplierNumerator,
    matched.tier.multiplierDenominator,
  );

  return {
    ok: true,
    baseCostCents: input.baseCostCents,
    matchedTierIndex: matched.index,
    matchedTierLabel: matched.tier.label,
    multiplier,
    multiplierDisplay,
    sellPriceExVatCents,
    rounding: 'HALF_UP_CENTS',
    ruleVersion: input.ruleSet.version,
    ruleStatus: input.ruleSet.status,
    baseCostType: input.ruleSet.baseCostType,
    explanation: `Base ${input.baseCostCents}c × ${multiplierDisplay} (${matched.tier.label}) → ${sellPriceExVatCents}c ex VAT (rule v${input.ruleSet.version}, ${input.ruleSet.status})`,
    costProvenance: {
      source: input.costProvenance?.source ?? input.ruleSet.baseCostType,
      freshness: input.costProvenance?.freshness ?? null,
      isDiscountedNet: Boolean(input.costProvenance?.isDiscountedNet),
    },
    activationStatus: input.ruleSet.status === 'ACTIVE' && input.ruleSet.globalAutomationEnabled ? 'ACTIVE' : 'DISABLED',
    globalAutomationEnabled: Boolean(input.ruleSet.globalAutomationEnabled),
    vatNote:
      'Multiplier applies to VAT-exclusive base cost; VAT calculated separately via canonical tax handling',
  };
}

/** Row 92: activation always blocked without explicit later Owner authorisation path. */
export function assertPricebookRuleActivationAllowed(input: {
  status: PricebookRuleStatus;
  ownerConfirmationToken?: string | null;
  row92ActivationAuthorised?: boolean;
}): { ok: true } | { ok: false; code: 'PRICEBOOK_RULE_OWNER_CONFIRMATION_REQUIRED'; message: string } {
  // Conversation authorises implementation/preview only — not activation.
  if (!input.row92ActivationAuthorised) {
    return {
      ok: false,
      code: 'PRICEBOOK_RULE_OWNER_CONFIRMATION_REQUIRED',
      message:
        'Global pricebook tier automation remains OFF. Owner confirmation / later authorised activation is required before ACTIVE status.',
    };
  }
  if (!input.ownerConfirmationToken?.trim()) {
    return {
      ok: false,
      code: 'PRICEBOOK_RULE_OWNER_CONFIRMATION_REQUIRED',
      message: 'Owner confirmation token required to activate pricebook rules',
    };
  }
  return { ok: true };
}

export function assertInactiveRuleCannotMutateCatalogue(input: {
  ruleStatus: PricebookRuleStatus;
  catalogueRowsMutated: number;
}): void {
  if (input.ruleStatus !== 'ACTIVE' && input.catalogueRowsMutated > 0) {
    throw new Error('Inactive/DRAFT pricebook rule must not mutate catalogue prices');
  }
}

export function buildYoungGunsDraftRuleSet(companyId: string, id = 'yg-draft-v1'): PricebookRuleSet {
  return {
    id,
    companyId,
    ...YOUNG_GUNS_DRAFT_TIER_FORMULA,
    globalAutomationEnabled: false,
    status: 'DRAFT',
  };
}

export function projectCustomerSafeSellPrice(input: {
  sellPriceExVatCents: number | null;
  description: string;
}): { description: string; unitPriceCents: number | null } {
  return {
    description: input.description,
    unitPriceCents: input.sellPriceExVatCents,
  };
}

export function assertNoPriceFormulaLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoPriceFormulaLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'multiplier',
    'multiplierDisplay',
    'matchedTierLabel',
    'baseCostCents',
    'unitCostCents',
    'markupBps',
    'marginBps',
    'ruleVersion',
    'globalAutomationEnabled',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Price formula internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') assertNoPriceFormulaLeak(value, `${path}.${key}`);
  }
}

export function canConfigurePricebookRules(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*')) return true;
  if (role === 'owner' || role === 'company owner') return true;
  return false;
}

export function canPreviewPricebookRules(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  if (canConfigurePricebookRules(input)) return true;
  const role = (input.roleName ?? '').toLowerCase();
  const perms = input.permissions ?? [];
  if (role === 'technician' || role === 'client') return false;
  if (perms.includes('finance:write') || perms.includes('inventory:write')) return true;
  return ['admin', 'manager'].includes(role);
}

export function buildPricebookRuleAuditEvent(input: {
  eventType: PricebookAuditEventType;
  companyId: string;
  ruleSetId: string;
  actorId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}): {
  companyId: string;
  action: PricebookAuditEventType;
  entityType: 'pricebook_rule_set';
  entityId: string;
  metadata: Record<string, unknown>;
} {
  return {
    companyId: input.companyId,
    action: input.eventType,
    entityType: 'pricebook_rule_set',
    entityId: input.ruleSetId,
    metadata: {
      eventType: input.eventType,
      ruleSetId: input.ruleSetId,
      actorId: input.actorId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
      timestamp: new Date().toISOString(),
      sensitiveCostOmitted: true,
    },
  };
}

export function assertRow90PricingUnchangedByTierFormula(input: {
  beforeMode?: string | null;
  afterMode?: string | null;
}): void {
  if ((input.beforeMode ?? null) !== (input.afterMode ?? null)) {
    throw new Error('Row 92 must not alter Row 90 pricing presentation mode');
  }
}

export function assertRow91ClassificationUnchanged(input: {
  before: { ygpCode?: string | null; catalogueCategory?: string | null; itemType?: string | null };
  after: { ygpCode?: string | null; catalogueCategory?: string | null; itemType?: string | null };
}): void {
  if (input.before.ygpCode !== input.after.ygpCode) throw new Error('Row 92 must not alter ygpCode');
  if (input.before.catalogueCategory !== input.after.catalogueCategory) {
    throw new Error('Row 92 must not alter catalogueCategory');
  }
  if (input.before.itemType !== input.after.itemType) {
    throw new Error('Row 92 must not alter itemType');
  }
}

export function assertRoyalCapePricebookUnchanged(input: {
  quoteId: string;
  xeroQuoteId: string | null | undefined;
  xeroQuoteNumber: string | null | undefined;
  totalCents: number;
  customerId: string;
  jobId: string | null | undefined;
  pricingPresentationMode?: string | null;
}): void {
  const rc = PRICEBOOK_TIER_ROYAL_CAPE;
  if (input.quoteId !== rc.royalCapeQuoteId) throw new Error('Royal Cape quote id mismatch');
  if ((input.xeroQuoteId ?? null) !== rc.royalCapeXeroQuoteId) {
    throw new Error('Royal Cape Xero quote id changed');
  }
  if ((input.xeroQuoteNumber ?? '').trim() !== rc.royalCapeQuoteNumber) {
    throw new Error('Royal Cape official number changed');
  }
  if (input.customerId !== rc.canonicalCustomerId) throw new Error('Royal Cape customer changed');
  if ((input.jobId ?? null) !== rc.jobId) throw new Error('Royal Cape job changed');
  if (input.totalCents !== rc.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== rc.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function assertRow92NoXeroWrites(n: number): void {
  if (n !== 0) throw new Error('Row 92 requires Xero writes = 0');
}
export function assertRow92NoCustomerSends(n: number): void {
  if (n !== 0) throw new Error('Row 92 requires customer sends = 0');
}
export function assertRow92NoProductionWrites(n: number): void {
  if (n !== 0) throw new Error('Row 92 requires production writes = 0');
}
export function assertRow92NoRealPriceChanges(n: number): void {
  if (n !== 0) throw new Error('Row 92 requires real YG price changes = 0');
}
export function assertRow92GlobalAutomationDisabled(enabled: boolean): void {
  if (enabled) throw new Error('Row 92 global automation must remain disabled');
}
export function assertRow93NotStarted(started: boolean): void {
  if (started) throw new Error('Row 93 must not start during Row 92');
}
export function assertRow122NotStarted(started: boolean): void {
  if (started) throw new Error('Row 122 must not start during Row 92');
}

/** Boundary fixture helpers (cents). */
export const PRICEBOOK_BOUNDARY_FIXTURES = [
  { baseCostCents: 1, expectMultiplier: 2.2 },
  { baseCostCents: 49_999, expectMultiplier: 2.2 },
  { baseCostCents: 50_000, expectMultiplier: 2.2 },
  { baseCostCents: 50_001, expectMultiplier: 2.0 },
  { baseCostCents: 149_999, expectMultiplier: 2.0 },
  { baseCostCents: 150_000, expectMultiplier: 2.0 },
  { baseCostCents: 150_001, expectMultiplier: 1.68 },
] as const;

export function serializeRuleTiers(tiers: PricebookTier[]): unknown {
  return tiers.map((t) => ({
    minCentsInclusive: t.minCentsInclusive,
    maxCentsInclusive: t.maxCentsInclusive,
    multiplierNumerator: t.multiplierNumerator,
    multiplierDenominator: t.multiplierDenominator,
    label: t.label,
  }));
}

export function parseRuleTiers(value: unknown): PricebookTier[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const t = raw as Record<string, unknown>;
    return {
      minCentsInclusive: Number(t.minCentsInclusive),
      maxCentsInclusive: t.maxCentsInclusive == null ? null : Number(t.maxCentsInclusive),
      multiplierNumerator: Number(t.multiplierNumerator),
      multiplierDenominator: Number(t.multiplierDenominator),
      label: String(t.label ?? ''),
    };
  });
}

export type PricebookBulkImpactItem = {
  itemId: string;
  itemCode?: string | null;
  name: string;
  currentSellCents: number | null;
  baseCostCents: number | null;
  costSource: string;
  isDiscountedNet?: boolean;
};

export type PricebookBulkImpactRow = {
  itemId: string;
  itemCode: string | null;
  name: string;
  currentSellCents: number | null;
  baseCostCents: number | null;
  proposedSellCents: number | null;
  differenceCents: number | null;
  matchedTier: string | null;
  multiplierDisplay: string | null;
  costSource: string;
  warning: string | null;
  status: 'PROPOSED' | 'MISSING_COST' | 'REVIEW_REQUIRED' | 'INVALID' | 'BLOCKED';
};

/**
 * READ-ONLY bulk impact preview. Never mutates catalogue.
 * When rule is not ACTIVE or automation is off, rows stay PROPOSED/blocked — applied = 0.
 */
export function buildBulkImpactPreview(input: {
  ruleSet: PricebookRuleSet;
  items: PricebookBulkImpactItem[];
}): {
  rows: PricebookBulkImpactRow[];
  applied: 0;
  proposedCount: number;
  missingCostCount: number;
  reviewRequiredCount: number;
  globalAutomationEnabled: false | true;
  ruleStatus: PricebookRuleStatus;
} {
  assertRow92GlobalAutomationDisabled(input.ruleSet.globalAutomationEnabled === true);
  const rows: PricebookBulkImpactRow[] = input.items.map((item) => {
    const resolved = resolvePricebookSellPrice({
      baseCostCents: item.baseCostCents,
      ruleSet: input.ruleSet,
      costProvenance: {
        source: item.costSource,
        isDiscountedNet: item.isDiscountedNet === true,
        alreadyDiscounted: item.isDiscountedNet === true,
      },
    });
    if (!resolved.ok) {
      const status =
        resolved.code === 'PRICE_BASE_COST_MISSING'
          ? 'MISSING_COST'
          : resolved.code === 'PRICE_BASE_COST_REVIEW_REQUIRED'
            ? 'REVIEW_REQUIRED'
            : resolved.code === 'PRICE_RULE_INACTIVE_APPLY_BLOCKED'
              ? 'BLOCKED'
              : 'INVALID';
      return {
        itemId: item.itemId,
        itemCode: item.itemCode ?? null,
        name: item.name,
        currentSellCents: item.currentSellCents,
        baseCostCents: item.baseCostCents,
        proposedSellCents: null,
        differenceCents: null,
        matchedTier: null,
        multiplierDisplay: null,
        costSource: item.costSource,
        warning: resolved.message,
        status,
      };
    }
    const differenceCents =
      item.currentSellCents == null ? null : resolved.sellPriceExVatCents - item.currentSellCents;
    return {
      itemId: item.itemId,
      itemCode: item.itemCode ?? null,
      name: item.name,
      currentSellCents: item.currentSellCents,
      baseCostCents: resolved.baseCostCents,
      proposedSellCents: resolved.sellPriceExVatCents,
      differenceCents,
      matchedTier: resolved.matchedTierLabel,
      multiplierDisplay: resolved.multiplierDisplay,
      costSource: resolved.costProvenance.source,
      warning: input.ruleSet.status === 'ACTIVE' ? null : 'Rule not ACTIVE — preview only, not applied',
      status: 'PROPOSED',
    };
  });
  return {
    rows,
    applied: 0,
    proposedCount: rows.filter((r) => r.status === 'PROPOSED').length,
    missingCostCount: rows.filter((r) => r.status === 'MISSING_COST').length,
    reviewRequiredCount: rows.filter((r) => r.status === 'REVIEW_REQUIRED').length,
    globalAutomationEnabled: Boolean(input.ruleSet.globalAutomationEnabled),
    ruleStatus: input.ruleSet.status,
  };
}

/** Apply path — blocked for DRAFT/INACTIVE and whenever automation is off. */
export function assertPricebookRuleMayApplyToCatalogue(ruleSet: PricebookRuleSet): {
  ok: true;
} | {
  ok: false;
  code: 'PRICE_RULE_INACTIVE_APPLY_BLOCKED' | 'PRICEBOOK_RULE_OWNER_CONFIRMATION_REQUIRED';
  message: string;
} {
  if (ruleSet.globalAutomationEnabled !== true || ruleSet.status !== 'ACTIVE') {
    return {
      ok: false,
      code: 'PRICE_RULE_INACTIVE_APPLY_BLOCKED',
      message: 'Inactive/DRAFT pricebook rule cannot mutate catalogue prices — preview only',
    };
  }
  return assertPricebookRuleActivationAllowed({
    status: ruleSet.status,
    row92ActivationAuthorised: false,
  });
}

export function nextRuleVersion(currentVersion: number): number {
  return currentVersion + 1;
}

/** Idempotent draft save fingerprint — same tiers/config → same signature. */
export function ruleConfigFingerprint(ruleSet: Pick<PricebookRuleSet, 'tiers' | 'baseCostType' | 'currency' | 'globalAutomationEnabled' | 'status'>): string {
  return JSON.stringify({
    status: ruleSet.status,
    baseCostType: ruleSet.baseCostType,
    currency: ruleSet.currency,
    globalAutomationEnabled: ruleSet.globalAutomationEnabled,
    tiers: serializeRuleTiers(ruleSet.tiers),
  });
}
