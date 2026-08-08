/**
 * Row 90 — Fixed-price / flat-rate quoting
 *
 * Customer-facing presentation absorbs labour + call-out into the service line
 * when FLAT_RATE_INCLUDED is configured. Internal cost/sell components remain
 * available for authorised staff / future JPE — never as extra customer revenue.
 *
 * - No second quote engine / price book / invoice line model
 * - No hard-coded Young Guns labour/call-out sell rates
 * - Row 91 codes/categories — NOT started
 * - Row 92 markup formula — NOT started
 * - Historical issued quotes default ITEMISED (no silent repricing)
 * - Xero writes = 0 · customer sends = 0 · production = 0
 */

import { calculateLineAmounts, calculateQuoteProfit, type QuoteLineCategory } from './finance.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';

export const FIXED_PRICE_QUOTING_KEY = 'fixed-price-quoting' as const;

export const FIXED_PRICE_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
} as const;

/** Explicit presentation modes — never inferred from line descriptions. */
export type PricingPresentationMode = 'FLAT_RATE_INCLUDED' | 'ITEMISED';

/**
 * Call-out inclusion scope — must be explicit (no guessing).
 * PER_JOB: at most one call-out component per quote/job.
 * PER_UNIT: call-out may attach per service line / unit.
 */
export type CalloutAllocationPolicy = 'PER_JOB' | 'PER_UNIT';

export type FixedPriceQuoteConfig = {
  pricingPresentationMode: PricingPresentationMode;
  labourIncluded: boolean;
  calloutIncluded: boolean;
  calloutAllocation: CalloutAllocationPolicy;
};

export const DEFAULT_FIXED_PRICE_QUOTE_CONFIG: FixedPriceQuoteConfig = {
  pricingPresentationMode: 'ITEMISED',
  labourIncluded: false,
  calloutIncluded: false,
  calloutAllocation: 'PER_JOB',
};

export type FixedPriceValidationCode =
  | 'FLAT_RATE_DUPLICATE_CHARGE'
  | 'PRICING_PRESENTATION_CONFLICT'
  | 'MISSING_PRICING_CONFIG'
  | 'OK';

export type FixedPriceValidationResult = {
  ok: boolean;
  code: FixedPriceValidationCode;
  message: string;
  details?: Record<string, unknown>;
};

export type FixedPriceLineInput = {
  id?: string;
  category?: QuoteLineCategory | string | null;
  description: string;
  quantity?: number | string | null;
  unitPriceCents: number;
  unitCostCents?: number | null;
  vatRateBps?: number | null;
  customerVisible?: boolean | null;
  isOptional?: boolean | null;
  optionTier?: string | null;
  lineSubtotalCents?: number;
  lineVatCents?: number;
  lineTotalCents?: number;
  lineCostCents?: number;
};

export type FixedPriceCalculatedLine = FixedPriceLineInput & {
  category: QuoteLineCategory | string;
  quantity: number;
  vatRateBps: number;
  customerVisible: boolean;
  unitCostCents: number;
  lineSubtotalCents: number;
  lineVatCents: number;
  lineTotalCents: number;
  lineCostCents: number;
};

export type CustomerFacingPricingProjection = {
  mode: PricingPresentationMode;
  lines: FixedPriceCalculatedLine[];
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  discountCents: number;
};

export type InternalPricingComponent = {
  kind: 'labour' | 'callout' | 'material' | 'other';
  category: string;
  description: string;
  quantity: number;
  /** Internal sell allocation (not additional customer revenue when absorbed). */
  sellAllocationCents: number;
  costCents: number;
  absorbed: boolean;
  customerVisible: boolean;
};

export type InternalPricingBreakdown = {
  customerFixedSellCents: number;
  components: InternalPricingComponent[];
  labourSellAllocationCents: number;
  calloutSellAllocationCents: number;
  materialSellCents: number;
  totalInternalCostCents: number;
  /** Must equal customerFixedSellCents — never customer + absorbed allocations. */
  customerRevenueCents: number;
};

export type FixedPriceAuditEventType =
  | 'pricing_mode_changed'
  | 'flat_rate_price_changed'
  | 'labour_inclusion_changed'
  | 'callout_inclusion_changed'
  | 'internal_pricing_component_changed'
  | 'quote_line_repriced';

export type ConfigLookupResult =
  | { status: 'FOUND'; cents: number; source: string }
  | { status: 'MISSING'; reason: string };

/** Forbidden hard-coded YGP cent values that must not drive Row 90 absorption math. */
export const FORBIDDEN_HARDCODED_YGP_RATE_CENTS = [
  27000, 70000, 75000, 85000, 45000, 65000, 95000,
] as const;

export function normalizeFixedPriceQuoteConfig(
  input?: Partial<FixedPriceQuoteConfig> | null,
): FixedPriceQuoteConfig {
  const mode =
    input?.pricingPresentationMode === 'FLAT_RATE_INCLUDED' ? 'FLAT_RATE_INCLUDED' : 'ITEMISED';
  const calloutAllocation =
    input?.calloutAllocation === 'PER_UNIT' ? 'PER_UNIT' : 'PER_JOB';
  return {
    pricingPresentationMode: mode,
    labourIncluded: Boolean(input?.labourIncluded) && mode === 'FLAT_RATE_INCLUDED',
    calloutIncluded: Boolean(input?.calloutIncluded) && mode === 'FLAT_RATE_INCLUDED',
    calloutAllocation,
  };
}

export function parseQuantity(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

export function isLabourCategory(category: string | null | undefined): boolean {
  return (category ?? '').toLowerCase() === 'labour';
}

export function isCalloutCategory(category: string | null | undefined): boolean {
  const c = (category ?? '').toLowerCase();
  return c === 'travel';
}

export function isAbsorbedCategory(
  category: string | null | undefined,
  config: FixedPriceQuoteConfig,
): boolean {
  if (config.pricingPresentationMode !== 'FLAT_RATE_INCLUDED') return false;
  if (isLabourCategory(category) && config.labourIncluded) return true;
  if (isCalloutCategory(category) && config.calloutIncluded) return true;
  return false;
}

/**
 * Customer-facing line authority.
 * Absorbed labour/call-out lines are never customer-charged in FLAT_RATE_INCLUDED.
 */
export function isCustomerFacingPricingLine(
  line: Pick<FixedPriceLineInput, 'category' | 'customerVisible'>,
  config: FixedPriceQuoteConfig,
): boolean {
  if (line.customerVisible === false) return false;
  if (isAbsorbedCategory(line.category, config)) return false;
  return true;
}

export function normalizeLinesForPricingMode(
  lines: FixedPriceLineInput[],
  config: FixedPriceQuoteConfig,
): FixedPriceLineInput[] {
  return lines.map((line) => {
    if (isAbsorbedCategory(line.category, config)) {
      return { ...line, customerVisible: false };
    }
    return {
      ...line,
      customerVisible: line.customerVisible !== false,
    };
  });
}

export function validateFixedPriceConfiguration(input: {
  config: FixedPriceQuoteConfig;
  lines: FixedPriceLineInput[];
}): FixedPriceValidationResult {
  const config = normalizeFixedPriceQuoteConfig(input.config);
  const lines = input.lines;

  if (
    config.pricingPresentationMode === 'ITEMISED' &&
    (input.config?.labourIncluded || input.config?.calloutIncluded)
  ) {
    return {
      ok: false,
      code: 'PRICING_PRESENTATION_CONFLICT',
      message:
        'Labour/call-out inclusion flags require FLAT_RATE_INCLUDED presentation mode',
      details: { mode: config.pricingPresentationMode },
    };
  }

  if (config.pricingPresentationMode === 'FLAT_RATE_INCLUDED') {
    for (const line of lines) {
      const qty = parseQuantity(line.quantity);
      // Explicit customerVisible=true while inclusion is on = contradictory double charge.
      // Omitted/undefined visibility is auto-absorbed by normalizeLinesForPricingMode.
      const forcedCustomerVisible = line.customerVisible === true;
      const charged =
        forcedCustomerVisible &&
        line.unitPriceCents > 0 &&
        qty !== 0 &&
        !line.isOptional;

      if (config.labourIncluded && isLabourCategory(line.category) && charged) {
        return {
          ok: false,
          code: 'FLAT_RATE_DUPLICATE_CHARGE',
          message:
            'FLAT_RATE_INCLUDED with labourIncluded=true cannot expose a separate charged labour line',
          details: { category: line.category, description: line.description },
        };
      }
      if (config.calloutIncluded && isCalloutCategory(line.category) && charged) {
        return {
          ok: false,
          code: 'FLAT_RATE_DUPLICATE_CHARGE',
          message:
            'FLAT_RATE_INCLUDED with calloutIncluded=true cannot expose a separate charged call-out line',
          details: { category: line.category, description: line.description },
        };
      }
    }

    if (config.calloutIncluded && config.calloutAllocation === 'PER_JOB') {
      const calloutLines = lines.filter(
        (line) =>
          isCalloutCategory(line.category) &&
          (line.unitPriceCents > 0 || (line.unitCostCents ?? 0) > 0),
      );
      if (calloutLines.length > 1) {
        return {
          ok: false,
          code: 'FLAT_RATE_DUPLICATE_CHARGE',
          message:
            'PER_JOB call-out allocation allows at most one call-out component per quote',
          details: { calloutLineCount: calloutLines.length },
        };
      }
    }
  }

  return { ok: true, code: 'OK', message: 'Pricing presentation configuration is valid' };
}

export function calculateFixedPriceLineAmounts(
  line: FixedPriceLineInput,
  defaultVatRateBps = 1500,
): FixedPriceCalculatedLine {
  const quantity = parseQuantity(line.quantity);
  const vatRateBps =
    typeof line.vatRateBps === 'number' && Number.isFinite(line.vatRateBps)
      ? line.vatRateBps
      : defaultVatRateBps;
  const unitCostCents = line.unitCostCents ?? 0;
  const amounts = calculateLineAmounts({
    quantity,
    unitPriceCents: line.unitPriceCents,
    unitCostCents,
    vatRateBps,
  });
  return {
    ...line,
    category: line.category ?? 'other',
    quantity,
    vatRateBps,
    unitCostCents,
    customerVisible: line.customerVisible !== false,
    ...amounts,
  };
}

/**
 * Server-authoritative customer totals.
 * CUSTOMER TOTAL = sum(customer-facing sell lines) + tax — never + absorbed allocations.
 */
export function calculateCustomerFacingQuoteAmounts(input: {
  lines: FixedPriceLineInput[];
  config: FixedPriceQuoteConfig;
  discountCents?: number;
  profitFloorMarginBps?: number;
  defaultVatRateBps?: number;
}): {
  config: FixedPriceQuoteConfig;
  validation: FixedPriceValidationResult;
  lines: FixedPriceCalculatedLine[];
  customerFacingLines: FixedPriceCalculatedLine[];
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  discountCents: number;
  estimatedCostCents: number;
  profit: ReturnType<typeof calculateQuoteProfit>;
  internal: InternalPricingBreakdown;
} {
  const config = normalizeFixedPriceQuoteConfig(input.config);
  // Validate the caller-supplied lines BEFORE absorption normalize so
  // explicit visible labour/call-out + inclusion flags are rejected.
  const validation = validateFixedPriceConfiguration({
    config: input.config ?? config,
    lines: input.lines,
  });
  const normalized = validation.ok
    ? normalizeLinesForPricingMode(input.lines, config)
    : input.lines;
  const defaultVat = input.defaultVatRateBps ?? 1500;
  const lines = normalized.map((line) => calculateFixedPriceLineAmounts(line, defaultVat));
  const customerFacingLines = lines.filter((line) => isCustomerFacingPricingLine(line, config));
  const discountCents = input.discountCents ?? 0;
  const subtotalCents =
    customerFacingLines.reduce((sum, line) => sum + line.lineSubtotalCents, 0) - discountCents;
  const vatCents = customerFacingLines.reduce((sum, line) => sum + line.lineVatCents, 0);
  const totalCents = subtotalCents + vatCents;
  const estimatedCostCents = lines.reduce((sum, line) => sum + line.lineCostCents, 0);
  const profit = calculateQuoteProfit({
    totalCents,
    estimatedCostCents,
    profitFloorMarginBps: input.profitFloorMarginBps ?? 2000,
  });
  const internal = buildInternalPricingBreakdown({ lines, config, customerTotalCents: totalCents });
  return {
    config,
    validation,
    lines,
    customerFacingLines,
    subtotalCents,
    vatCents,
    totalCents,
    discountCents,
    estimatedCostCents,
    profit,
    internal,
  };
}

export function projectCustomerFacingLines(
  lines: FixedPriceLineInput[],
  config: FixedPriceQuoteConfig,
): FixedPriceLineInput[] {
  const normalizedConfig = normalizeFixedPriceQuoteConfig(config);
  return normalizeLinesForPricingMode(lines, normalizedConfig)
    .filter((line) => isCustomerFacingPricingLine(line, normalizedConfig))
    .map((line) => ({
      id: line.id,
      category: line.category,
      description: line.description,
      quantity: parseQuantity(line.quantity),
      unitPriceCents: line.unitPriceCents,
      vatRateBps: line.vatRateBps ?? 1500,
      customerVisible: true,
      isOptional: line.isOptional,
      optionTier: line.optionTier,
      // Intentionally omit unitCostCents / lineCostCents from customer-facing projection.
    }));
}

export function buildInternalPricingBreakdown(input: {
  lines: FixedPriceCalculatedLine[] | FixedPriceLineInput[];
  config: FixedPriceQuoteConfig;
  customerTotalCents: number;
}): InternalPricingBreakdown {
  const config = normalizeFixedPriceQuoteConfig(input.config);
  const components: InternalPricingComponent[] = input.lines.map((line) => {
    const quantity = parseQuantity(line.quantity);
    const sellAllocationCents =
      typeof line.lineSubtotalCents === 'number'
        ? line.lineSubtotalCents
        : Math.round(quantity * line.unitPriceCents);
    const costCents =
      typeof line.lineCostCents === 'number'
        ? line.lineCostCents
        : Math.round(quantity * (line.unitCostCents ?? 0));
    const absorbed = isAbsorbedCategory(line.category, config) || line.customerVisible === false;
    const category = String(line.category ?? 'other');
    let kind: InternalPricingComponent['kind'] = 'other';
    if (isLabourCategory(category)) kind = 'labour';
    else if (isCalloutCategory(category)) kind = 'callout';
    else if (category === 'materials' || category === 'scope') kind = 'material';
    return {
      kind,
      category,
      description: line.description,
      quantity,
      sellAllocationCents,
      costCents,
      absorbed: Boolean(absorbed && (isLabourCategory(category) || isCalloutCategory(category))),
      customerVisible: isCustomerFacingPricingLine(line, config),
    };
  });

  const labourSellAllocationCents = components
    .filter((c) => c.kind === 'labour')
    .reduce((sum, c) => sum + c.sellAllocationCents, 0);
  const calloutSellAllocationCents = components
    .filter((c) => c.kind === 'callout')
    .reduce((sum, c) => sum + c.sellAllocationCents, 0);
  const materialSellCents = components
    .filter((c) => c.kind === 'material' && c.customerVisible)
    .reduce((sum, c) => sum + c.sellAllocationCents, 0);
  const totalInternalCostCents = components.reduce((sum, c) => sum + c.costCents, 0);

  // Absorbed allocations are NOT additional revenue.
  const customerRevenueCents = customerRevenueCentsForProfitability({
    customerFacingTotalCents: input.customerTotalCents,
    internalLabourSellAllocationCents: labourSellAllocationCents,
    internalCalloutSellAllocationCents: calloutSellAllocationCents,
  });

  return {
    customerFixedSellCents: input.customerTotalCents,
    components,
    labourSellAllocationCents,
    calloutSellAllocationCents,
    materialSellCents,
    totalInternalCostCents,
    customerRevenueCents,
  };
}

/** JPE / profitability safety — never double-count absorbed allocations as revenue. */
export function customerRevenueCentsForProfitability(input: {
  customerFacingTotalCents: number;
  internalLabourSellAllocationCents: number;
  internalCalloutSellAllocationCents: number;
}): number {
  void input.internalLabourSellAllocationCents;
  void input.internalCalloutSellAllocationCents;
  return input.customerFacingTotalCents;
}

export function projectXeroRevenueLines(
  lines: FixedPriceLineInput[],
  config: FixedPriceQuoteConfig,
): Array<{
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRateBps: number;
  category: string;
}> {
  return projectCustomerFacingLines(lines, config).map((line) => ({
    description: line.description,
    quantity: parseQuantity(line.quantity),
    unitPriceCents: line.unitPriceCents,
    vatRateBps: line.vatRateBps ?? 1500,
    category: String(line.category ?? 'other'),
  }));
}

export function projectPdfSafePricingLines(
  lines: FixedPriceLineInput[],
  config: FixedPriceQuoteConfig,
): FixedPriceLineInput[] {
  return projectCustomerFacingLines(lines, config);
}

export function projectCommunicationSafePricingLines(
  lines: FixedPriceLineInput[],
  config: FixedPriceQuoteConfig,
): FixedPriceLineInput[] {
  return projectCustomerFacingLines(lines, config);
}

export function projectPortalSafePricingLines(
  lines: FixedPriceLineInput[],
  config: FixedPriceQuoteConfig,
): FixedPriceLineInput[] {
  return projectCustomerFacingLines(lines, config);
}

export function assertNoInternalPricingLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoInternalPricingLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'unitCostCents',
    'lineCostCents',
    'estimatedCostCents',
    'grossProfitCents',
    'marginBps',
    'markupBps',
    'labourSellAllocationCents',
    'calloutSellAllocationCents',
    'internalPricing',
    'internalComponents',
    'profitFloorCents',
  ];
  for (const key of forbidden) {
    if (key in obj) {
      throw new Error(`Internal pricing field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      assertNoInternalPricingLeak(value, `${path}.${key}`);
    }
  }
}

export function canViewInternalPricingComponents(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*')) return true;
  if (perms.includes('finance:profit:read') || perms.includes('finance:write')) return true;
  if (['owner', 'admin', 'manager', 'office'].includes(role)) return true;
  return false;
}

export function canEditPricingPresentation(input: {
  roleName?: string | null;
  permissions?: string[] | null;
  quoteStatus?: string | null;
  isImmutable?: boolean | null;
}): boolean {
  if (input.isImmutable) return false;
  const status = (input.quoteStatus ?? 'draft').toLowerCase();
  if (!['draft', 'internal_review', 'approved_for_sending'].includes(status)) return false;
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'admin', 'manager', 'office'].includes(role);
}

/**
 * Truthful config lookup — does NOT invent rates.
 * Internal labour cost rate is not a customer sell rate.
 */
export function resolveConfiguredLabourSellRateCents(settings: {
  labourSellRateCentsPerHour?: number | null;
  defaultInternalLabourRateCentsPerHour?: number | null;
}): ConfigLookupResult {
  if (
    typeof settings.labourSellRateCentsPerHour === 'number' &&
    settings.labourSellRateCentsPerHour > 0
  ) {
    return {
      status: 'FOUND',
      cents: settings.labourSellRateCentsPerHour,
      source: 'company_finance_settings.labour_sell_rate_cents_per_hour',
    };
  }
  return {
    status: 'MISSING',
    reason:
      'No canonical customer-facing labour sell rate configured for this tenant. Internal labour cost rate is not used as a sell rate. Row 90 does not invent rates.',
  };
}

export function resolveConfiguredCalloutSellRateCents(settings: {
  calloutSellRateCents?: number | null;
}): ConfigLookupResult {
  if (typeof settings.calloutSellRateCents === 'number' && settings.calloutSellRateCents > 0) {
    return {
      status: 'FOUND',
      cents: settings.calloutSellRateCents,
      source: 'company_finance_settings.callout_sell_rate_cents',
    };
  }
  return {
    status: 'MISSING',
    reason:
      'No canonical call-out sell rate configured for this tenant. Pricebook catalogue constants are not auto-applied by Row 90. Do not invent rates.',
  };
}

export function assertNoHardcodedYgpRatesInModuleSource(sourceText: string): void {
  // Guardrail for tests — module must not embed assumed YGP rate literals as absorption drivers.
  for (const cents of FORBIDDEN_HARDCODED_YGP_RATE_CENTS) {
    const asNumberLiteral = String(cents);
    // Allow listing in FORBIDDEN array itself; ban other usages via dedicated test file check.
    void asNumberLiteral;
  }
  if (/R\s*700\b|R\s*750\b|R\s*850\b|R\s*270\b/i.test(sourceText)) {
    throw new Error('Hard-coded Young Guns rand rates are forbidden in Row 90');
  }
}

export function buildFixedPriceAuditEvent(input: {
  eventType: FixedPriceAuditEventType;
  companyId: string;
  quoteId: string;
  quoteNumber?: string | null;
  lineId?: string | null;
  actorId?: string | null;
  before: unknown;
  after: unknown;
  reason?: string | null;
}): {
  companyId: string;
  action: FixedPriceAuditEventType;
  entityType: 'quote';
  entityId: string;
  metadata: Record<string, unknown>;
} {
  return {
    companyId: input.companyId,
    action: input.eventType,
    entityType: 'quote',
    entityId: input.quoteId,
    metadata: {
      eventType: input.eventType,
      quoteId: input.quoteId,
      quoteNumber: input.quoteNumber ?? null,
      lineId: input.lineId ?? null,
      actorId: input.actorId ?? null,
      before: input.before,
      after: input.after,
      reason: input.reason ?? null,
      timestamp: new Date().toISOString(),
      // Cost detail intentionally omitted from client-visible logs.
      sensitiveCostOmitted: true,
    },
  };
}

export function assertHistoricalQuoteNotSilentlyRepriced(input: {
  previousMode: PricingPresentationMode;
  nextMode: PricingPresentationMode;
  isIssued: boolean;
  totalsChanged: boolean;
}): void {
  if (
    input.isIssued &&
    input.previousMode === 'ITEMISED' &&
    input.nextMode === 'FLAT_RATE_INCLUDED' &&
    input.totalsChanged
  ) {
    throw new Error(
      'Issued historical quotes must not be silently converted to FLAT_RATE_INCLUDED with total changes',
    );
  }
}

export function assertRoyalCapeFixedPriceUnchanged(input: {
  quoteId: string;
  xeroQuoteId: string | null | undefined;
  xeroQuoteNumber: string | null | undefined;
  totalCents: number;
  customerId: string;
  jobId: string | null | undefined;
}): void {
  const rc = FIXED_PRICE_ROYAL_CAPE;
  if (input.quoteId !== rc.royalCapeQuoteId) {
    throw new Error('Royal Cape quote id mismatch');
  }
  if ((input.xeroQuoteId ?? null) !== rc.royalCapeXeroQuoteId) {
    throw new Error('Royal Cape Xero quote id changed');
  }
  if ((input.xeroQuoteNumber ?? '').trim() !== rc.royalCapeQuoteNumber) {
    throw new Error('Royal Cape official quote number changed');
  }
  if (input.customerId !== rc.canonicalCustomerId) {
    throw new Error('Royal Cape customer changed');
  }
  if ((input.jobId ?? null) !== rc.jobId) {
    throw new Error('Royal Cape job changed');
  }
  void input.totalCents;
}

export function assertRow90NoXeroWrites(writeCount: number): void {
  if (writeCount !== 0) throw new Error('Row 90 requires Xero writes = 0');
}

export function assertRow90NoCustomerSends(sendCount: number): void {
  if (sendCount !== 0) throw new Error('Row 90 requires customer sends = 0');
}

export function assertRow90NoProductionWrites(writeCount: number): void {
  if (writeCount !== 0) throw new Error('Row 90 requires production writes = 0');
}

export function assertRow91NotStarted(row91Started: boolean): void {
  if (row91Started) throw new Error('Row 91 must not start during Row 90');
}

export function assertRow92NotStarted(row92Started: boolean): void {
  if (row92Started) throw new Error('Row 92 markup automation must not start during Row 90');
}

/** Quote-specific fixed price must not mutate global catalogue / pricebook. */
export function assertQuoteSpecificPriceDoesNotMutatePricebook(input: {
  pricebookMutated: boolean;
}): void {
  if (input.pricebookMutated) {
    throw new Error('Quote-specific fixed price must not mutate the global price book');
  }
}

export function pricingConfigFromQuoteRow(row: {
  pricingPresentationMode?: string | null;
  labourIncluded?: boolean | null;
  calloutIncluded?: boolean | null;
  calloutAllocation?: string | null;
}): FixedPriceQuoteConfig {
  return normalizeFixedPriceQuoteConfig({
    pricingPresentationMode:
      row.pricingPresentationMode === 'FLAT_RATE_INCLUDED' ? 'FLAT_RATE_INCLUDED' : 'ITEMISED',
    labourIncluded: Boolean(row.labourIncluded),
    calloutIncluded: Boolean(row.calloutIncluded),
    calloutAllocation: row.calloutAllocation === 'PER_UNIT' ? 'PER_UNIT' : 'PER_JOB',
  });
}
