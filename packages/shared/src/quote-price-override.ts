/**
 * Row 93 — One-off Owner-approved quote markup / price override
 *
 * Quote-specific only. Never mutates:
 * - company_pricebook_rule_sets (Row 92)
 * - inventory_items sell prices
 * - supplier/source cost
 * - other quotes / historical / invoices / Xero
 *
 * Workflow: PROPOSE → PREVIEW → OWNER APPROVE → EXECUTE
 * Global automation remains OFF. Row 94+ not started.
 */

import { canEditQuote, type QuoteStatus } from './finance.js';
import {
  calculateCustomerFacingQuoteAmounts,
  type FixedPriceLineInput,
  type FixedPriceQuoteConfig,
} from './fixed-price-quoting.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import {
  PRICEBOOK_TIER_ROYAL_CAPE,
  assertRow92GlobalAutomationDisabled,
  type PricebookRuleSet,
} from './pricebook-tier-formula.js';

export const QUOTE_PRICE_OVERRIDE_KEY = 'quote-price-override' as const;

export const QUOTE_PRICE_OVERRIDE_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: PRICEBOOK_TIER_ROYAL_CAPE.expectedTotalCents,
  expectedPricingMode: PRICEBOOK_TIER_ROYAL_CAPE.expectedPricingMode,
} as const;

export type QuotePriceOverrideStatus =
  | 'DRAFT_PROPOSAL'
  | 'OWNER_APPROVED'
  | 'EXECUTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'STALE';

export type QuotePriceOverrideBaselineSource =
  | 'QUOTE_LINE_SELL'
  | 'CATALOGUE_SELL'
  | 'ROW92_PREVIEW'
  | 'MANUAL_QUOTE_LINE';

export type QuotePriceOverrideLineInput = {
  lineId: string;
  /** Current draft line unit sell (ex VAT cents). */
  baselineSellPriceCents: number;
  baselineSource: QuotePriceOverrideBaselineSource;
  catalogueItemId?: string | null;
  quantity: number | string;
  description: string;
  category?: string | null;
  vatRateBps?: number | null;
  unitCostCents?: number | null;
  customerVisible?: boolean | null;
  /** Target final unit sell ex VAT — mutually exclusive with targetMultiplier. */
  targetSellPriceCents?: number | null;
  /** Multiplier applied to baseline — mutually exclusive with targetSellPriceCents. */
  targetMultiplier?: number | null;
};

export type QuotePriceOverrideProposalInput = {
  companyId: string;
  quoteId: string;
  quoteStatus: QuoteStatus | string;
  quoteIsImmutable?: boolean;
  quoteUpdatedAt: string | Date;
  xeroQuoteId?: string | null;
  issuedAt?: string | Date | null;
  lines: QuotePriceOverrideLineInput[];
  reason: string;
  pricingConfig: FixedPriceQuoteConfig;
  /** All quote lines (for total recalculation); overridden lines replaced by targets. */
  allQuoteLines: FixedPriceLineInput[];
  discountCents?: number;
  defaultVatRateBps?: number;
  priceRuleSetId?: string | null;
  priceRuleVersion?: number | null;
  row92ComparisonSellCentsByLineId?: Record<string, number | null> | null;
  proposedBy?: string | null;
};

export type QuotePriceOverrideLinePreview = {
  lineId: string;
  description: string;
  baselineSellPriceCents: number;
  baselineSource: QuotePriceOverrideBaselineSource;
  overrideSellPriceCents: number;
  differenceCents: number;
  differenceBps: number | null;
  quantity: number;
  beforeLineSubtotalCents: number;
  afterLineSubtotalCents: number;
  beforeLineVatCents: number;
  afterLineVatCents: number;
  unitCostCents: number | null;
  effectiveMultiplier: number | null;
  effectiveGrossMarginBps: number | null;
  belowKnownCost: boolean;
  row92ComparisonSellCents: number | null;
  row92ComparisonDifferenceCents: number | null;
  catalogueItemId: string | null;
};

export type QuotePriceOverridePreview = {
  quoteId: string;
  companyId: string;
  reason: string;
  previewHash: string;
  quoteUpdatedAt: string;
  lines: QuotePriceOverrideLinePreview[];
  beforeSubtotalCents: number;
  afterSubtotalCents: number;
  beforeVatCents: number;
  afterVatCents: number;
  beforeTotalCents: number;
  afterTotalCents: number;
  vatDeltaCents: number;
  totalDeltaCents: number;
  hasBelowKnownCostWarning: boolean;
  priceRuleSetId: string | null;
  priceRuleVersion: number | null;
};

export type QuotePriceOverrideRecord = {
  id: string;
  companyId: string;
  quoteId: string;
  status: QuotePriceOverrideStatus;
  reason: string;
  previewHash: string;
  quoteUpdatedAt: string;
  lineIds: string[];
  baselineSnapshot: QuotePriceOverrideLinePreview[];
  proposedSellByLineId: Record<string, number>;
  beforeTotalCents: number;
  afterTotalCents: number;
  priceRuleSetId: string | null;
  priceRuleVersion: number | null;
  proposedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  executedBy: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  cancelReason?: string | null;
  createdAt?: string | null;
};

export type QuotePriceOverrideErrorCode =
  | 'PRICE_OVERRIDE_REASON_REQUIRED'
  | 'PRICE_OVERRIDE_INPUT_CONFLICT'
  | 'PRICE_OVERRIDE_INVALID_PRICE'
  | 'PRICE_OVERRIDE_NO_LINES'
  | 'PRICE_OVERRIDE_QUOTE_NOT_EDITABLE'
  | 'PRICE_OVERRIDE_STALE_APPROVAL'
  | 'PRICE_OVERRIDE_APPROVAL_REQUIRED'
  | 'PRICE_OVERRIDE_FORBIDDEN'
  | 'PRICE_OVERRIDE_NOT_FOUND'
  | 'PRICE_OVERRIDE_ALREADY_EXECUTED'
  | 'PRICE_OVERRIDE_IDEMPOTENT_SUCCESS'
  | 'PRICE_OVERRIDE_CROSS_TENANT'
  | 'OVERRIDE_BELOW_KNOWN_COST'
  | 'PRICE_OVERRIDE_INVALID_STATUS';

export class QuotePriceOverrideError extends Error {
  constructor(
    public readonly code: QuotePriceOverrideErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'QuotePriceOverrideError';
  }
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseQty(quantity: number | string | null | undefined): number {
  const n = typeof quantity === 'number' ? quantity : Number(quantity ?? 1);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

function lineAmounts(unitPriceCents: number, quantity: number, vatRateBps: number) {
  const subtotal = Math.round(unitPriceCents * quantity);
  const vat = Math.round((subtotal * vatRateBps) / 10_000);
  return { subtotal, vat, total: subtotal + vat };
}

export function resolveOverrideSellPriceCents(input: {
  baselineSellPriceCents: number;
  targetSellPriceCents?: number | null;
  targetMultiplier?: number | null;
}): { ok: true; overrideSellPriceCents: number } | { ok: false; code: QuotePriceOverrideErrorCode; message: string } {
  const hasTarget =
    input.targetSellPriceCents != null && Number.isFinite(input.targetSellPriceCents);
  const hasMult = input.targetMultiplier != null && Number.isFinite(input.targetMultiplier);
  if (hasTarget && hasMult) {
    return {
      ok: false,
      code: 'PRICE_OVERRIDE_INPUT_CONFLICT',
      message: 'Provide either targetSellPriceCents or targetMultiplier, not both',
    };
  }
  if (!hasTarget && !hasMult) {
    return {
      ok: false,
      code: 'PRICE_OVERRIDE_INVALID_PRICE',
      message: 'Override requires targetSellPriceCents or targetMultiplier',
    };
  }
  let cents: number;
  if (hasTarget) {
    cents = Math.trunc(input.targetSellPriceCents as number);
  } else {
    const mult = input.targetMultiplier as number;
    if (mult <= 0) {
      return {
        ok: false,
        code: 'PRICE_OVERRIDE_INVALID_PRICE',
        message: 'targetMultiplier must be positive',
      };
    }
    cents = Math.round(input.baselineSellPriceCents * mult);
  }
  if (!Number.isInteger(cents) || cents < 0) {
    return {
      ok: false,
      code: 'PRICE_OVERRIDE_INVALID_PRICE',
      message: 'Override sell price must be a non-negative integer cent amount',
    };
  }
  return { ok: true, overrideSellPriceCents: cents };
}

export function assertQuoteEligibleForPriceOverride(input: {
  status: QuoteStatus | string;
  isImmutable?: boolean;
  xeroQuoteId?: string | null;
  issuedAt?: string | Date | null;
}): void {
  const status = input.status as QuoteStatus;
  if (input.isImmutable) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_QUOTE_NOT_EDITABLE',
      'Immutable quote cannot receive a one-off price override',
    );
  }
  if (input.issuedAt || (input.xeroQuoteId && ['sent', 'viewed', 'accepted', 'declined', 'converted', 'cancelled', 'superseded', 'expired'].includes(status))) {
    if (!canEditQuote({ isImmutable: false, status })) {
      throw new QuotePriceOverrideError(
        'PRICE_OVERRIDE_QUOTE_NOT_EDITABLE',
        `Quote status ${status} is not eligible for one-off override`,
      );
    }
  }
  if (!canEditQuote({ isImmutable: Boolean(input.isImmutable), status })) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_QUOTE_NOT_EDITABLE',
      `Quote status ${status} is not eligible for one-off override`,
    );
  }
}

export function buildQuotePriceOverridePreview(
  input: QuotePriceOverrideProposalInput,
): QuotePriceOverridePreview {
  const reason = input.reason?.trim() ?? '';
  if (!reason) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_REASON_REQUIRED',
      'Override reason is required',
    );
  }
  if (!input.lines.length) {
    throw new QuotePriceOverrideError('PRICE_OVERRIDE_NO_LINES', 'Select at least one quote line');
  }
  assertQuoteEligibleForPriceOverride({
    status: input.quoteStatus,
    isImmutable: input.quoteIsImmutable,
    xeroQuoteId: input.xeroQuoteId,
    issuedAt: input.issuedAt,
  });

  const overrideByLine = new Map<string, number>();
  const linePreviews: QuotePriceOverrideLinePreview[] = [];

  for (const line of input.lines) {
    if (!Number.isInteger(line.baselineSellPriceCents) || line.baselineSellPriceCents < 0) {
      throw new QuotePriceOverrideError(
        'PRICE_OVERRIDE_INVALID_PRICE',
        `Invalid baseline for line ${line.lineId}`,
      );
    }
    const resolved = resolveOverrideSellPriceCents({
      baselineSellPriceCents: line.baselineSellPriceCents,
      targetSellPriceCents: line.targetSellPriceCents,
      targetMultiplier: line.targetMultiplier,
    });
    if (!resolved.ok) {
      throw new QuotePriceOverrideError(resolved.code, resolved.message);
    }
    overrideByLine.set(line.lineId, resolved.overrideSellPriceCents);
    const qty = parseQty(line.quantity);
    const vatBps = line.vatRateBps ?? input.defaultVatRateBps ?? 1500;
    const before = lineAmounts(line.baselineSellPriceCents, qty, vatBps);
    const after = lineAmounts(resolved.overrideSellPriceCents, qty, vatBps);
    const diff = resolved.overrideSellPriceCents - line.baselineSellPriceCents;
    const differenceBps =
      line.baselineSellPriceCents > 0
        ? Math.round((diff * 10_000) / line.baselineSellPriceCents)
        : null;
    const cost =
      line.unitCostCents != null && Number.isFinite(line.unitCostCents)
        ? Math.trunc(line.unitCostCents)
        : null;
    const belowKnownCost = cost != null && cost > 0 && resolved.overrideSellPriceCents < cost;
    const effectiveMultiplier =
      cost != null && cost > 0
        ? resolved.overrideSellPriceCents / cost
        : line.baselineSellPriceCents > 0
          ? resolved.overrideSellPriceCents / line.baselineSellPriceCents
          : null;
    const marginBps =
      cost != null && resolved.overrideSellPriceCents > 0
        ? Math.round(
            ((resolved.overrideSellPriceCents - cost) * 10_000) / resolved.overrideSellPriceCents,
          )
        : null;
    const row92 =
      input.row92ComparisonSellCentsByLineId?.[line.lineId] != null
        ? input.row92ComparisonSellCentsByLineId[line.lineId]!
        : null;

    linePreviews.push({
      lineId: line.lineId,
      description: line.description,
      baselineSellPriceCents: line.baselineSellPriceCents,
      baselineSource: line.baselineSource,
      overrideSellPriceCents: resolved.overrideSellPriceCents,
      differenceCents: diff,
      differenceBps,
      quantity: qty,
      beforeLineSubtotalCents: before.subtotal,
      afterLineSubtotalCents: after.subtotal,
      beforeLineVatCents: before.vat,
      afterLineVatCents: after.vat,
      unitCostCents: cost,
      effectiveMultiplier,
      effectiveGrossMarginBps: cost == null ? null : marginBps,
      belowKnownCost,
      row92ComparisonSellCents: row92,
      row92ComparisonDifferenceCents:
        row92 == null ? null : resolved.overrideSellPriceCents - row92,
      catalogueItemId: line.catalogueItemId ?? null,
    });
  }

  const beforeCalc = calculateCustomerFacingQuoteAmounts({
    lines: input.allQuoteLines,
    config: input.pricingConfig,
    discountCents: input.discountCents,
    defaultVatRateBps: input.defaultVatRateBps,
  });

  const afterLines = input.allQuoteLines.map((l) => {
    const id = l.id;
    if (id && overrideByLine.has(id)) {
      return { ...l, unitPriceCents: overrideByLine.get(id)! };
    }
    return l;
  });
  const afterCalc = calculateCustomerFacingQuoteAmounts({
    lines: afterLines,
    config: input.pricingConfig,
    discountCents: input.discountCents,
    defaultVatRateBps: input.defaultVatRateBps,
  });

  const quoteUpdatedAt = toIso(input.quoteUpdatedAt);
  const previewHash = buildOverridePreviewHash({
    quoteId: input.quoteId,
    quoteUpdatedAt,
    lineIds: input.lines.map((l) => l.lineId).sort(),
    proposedSellByLineId: Object.fromEntries(overrideByLine),
    afterTotalCents: afterCalc.totalCents,
    reason,
  });

  return {
    quoteId: input.quoteId,
    companyId: input.companyId,
    reason,
    previewHash,
    quoteUpdatedAt,
    lines: linePreviews,
    beforeSubtotalCents: beforeCalc.subtotalCents,
    afterSubtotalCents: afterCalc.subtotalCents,
    beforeVatCents: beforeCalc.vatCents,
    afterVatCents: afterCalc.vatCents,
    beforeTotalCents: beforeCalc.totalCents,
    afterTotalCents: afterCalc.totalCents,
    vatDeltaCents: afterCalc.vatCents - beforeCalc.vatCents,
    totalDeltaCents: afterCalc.totalCents - beforeCalc.totalCents,
    hasBelowKnownCostWarning: linePreviews.some((l) => l.belowKnownCost),
    priceRuleSetId: input.priceRuleSetId ?? null,
    priceRuleVersion: input.priceRuleVersion ?? null,
  };
}

export function buildOverridePreviewHash(input: {
  quoteId: string;
  quoteUpdatedAt: string;
  lineIds: string[];
  proposedSellByLineId: Record<string, number>;
  afterTotalCents: number;
  reason: string;
}): string {
  const payload = JSON.stringify({
    quoteId: input.quoteId,
    quoteUpdatedAt: input.quoteUpdatedAt,
    lineIds: [...input.lineIds].sort(),
    proposed: input.proposedSellByLineId,
    afterTotalCents: input.afterTotalCents,
    reason: input.reason.trim(),
  });
  // Deterministic non-crypto fingerprint (fixture-safe; server may also store raw fields).
  let h = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `qpo_${(h >>> 0).toString(16)}_${input.quoteId.slice(0, 8)}`;
}

export function createOverrideProposalFromPreview(input: {
  id: string;
  preview: QuotePriceOverridePreview;
  proposedBy?: string | null;
}): QuotePriceOverrideRecord {
  return {
    id: input.id,
    companyId: input.preview.companyId,
    quoteId: input.preview.quoteId,
    status: 'DRAFT_PROPOSAL',
    reason: input.preview.reason,
    previewHash: input.preview.previewHash,
    quoteUpdatedAt: input.preview.quoteUpdatedAt,
    lineIds: input.preview.lines.map((l) => l.lineId),
    baselineSnapshot: input.preview.lines,
    proposedSellByLineId: Object.fromEntries(
      input.preview.lines.map((l) => [l.lineId, l.overrideSellPriceCents]),
    ),
    beforeTotalCents: input.preview.beforeTotalCents,
    afterTotalCents: input.preview.afterTotalCents,
    priceRuleSetId: input.preview.priceRuleSetId,
    priceRuleVersion: input.preview.priceRuleVersion,
    proposedBy: input.proposedBy ?? null,
    approvedBy: null,
    approvedAt: null,
    executedAt: null,
    executedBy: null,
    createdAt: new Date().toISOString(),
  };
}

export function canProposeQuotePriceOverride(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function canApproveQuotePriceOverride(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client') return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*')) return true;
  return role === 'owner' || role === 'company owner';
}

export function approveQuotePriceOverride(input: {
  record: QuotePriceOverrideRecord;
  actorId: string;
  roleName?: string | null;
  permissions?: string[] | null;
  currentQuoteUpdatedAt: string | Date;
}): QuotePriceOverrideRecord {
  if (!canApproveQuotePriceOverride(input)) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_FORBIDDEN',
      'Only Owner may approve a one-off quote price override',
    );
  }
  if (input.record.status !== 'DRAFT_PROPOSAL') {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_INVALID_STATUS',
      `Cannot approve override in status ${input.record.status}`,
    );
  }
  if (toIso(input.currentQuoteUpdatedAt) !== input.record.quoteUpdatedAt) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_STALE_APPROVAL',
      'Quote changed after proposal — re-propose required',
    );
  }
  return {
    ...input.record,
    status: 'OWNER_APPROVED',
    approvedBy: input.actorId,
    approvedAt: new Date().toISOString(),
  };
}

export function rejectQuotePriceOverride(input: {
  record: QuotePriceOverrideRecord;
  actorId: string;
  roleName?: string | null;
  permissions?: string[] | null;
}): QuotePriceOverrideRecord {
  if (!canApproveQuotePriceOverride(input)) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_FORBIDDEN',
      'Only Owner may reject a one-off quote price override',
    );
  }
  if (!['DRAFT_PROPOSAL', 'OWNER_APPROVED'].includes(input.record.status)) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_INVALID_STATUS',
      `Cannot reject override in status ${input.record.status}`,
    );
  }
  return {
    ...input.record,
    status: 'REJECTED',
    rejectedBy: input.actorId,
    rejectedAt: new Date().toISOString(),
  };
}

export function cancelQuotePriceOverride(input: {
  record: QuotePriceOverrideRecord;
  actorId: string;
  roleName?: string | null;
  permissions?: string[] | null;
  cancelReason?: string | null;
}): QuotePriceOverrideRecord {
  if (!canProposeQuotePriceOverride(input)) {
    throw new QuotePriceOverrideError('PRICE_OVERRIDE_FORBIDDEN', 'Cancel not permitted');
  }
  if (input.record.status === 'EXECUTED') {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_ALREADY_EXECUTED',
      'Executed overrides cannot be casually cancelled — use lifecycle correction',
    );
  }
  return {
    ...input.record,
    status: 'CANCELLED',
    cancelReason: input.cancelReason?.trim() || 'cancelled',
  };
}

export function assertOverrideExecutable(input: {
  record: QuotePriceOverrideRecord;
  quoteId: string;
  companyId: string;
  currentQuoteUpdatedAt: string | Date;
  expectedPreviewHash?: string | null;
}): { ok: true } | { ok: false; code: 'PRICE_OVERRIDE_IDEMPOTENT_SUCCESS'; message: string } {
  if (input.record.companyId !== input.companyId) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_CROSS_TENANT',
      'Override belongs to another tenant',
    );
  }
  if (input.record.quoteId !== input.quoteId) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_STALE_APPROVAL',
      'Override quote mismatch',
    );
  }
  if (input.record.status === 'EXECUTED') {
    return {
      ok: false,
      code: 'PRICE_OVERRIDE_IDEMPOTENT_SUCCESS',
      message: 'Override already executed — no double apply',
    };
  }
  if (input.record.status !== 'OWNER_APPROVED') {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_APPROVAL_REQUIRED',
      'Owner approval required before execute',
    );
  }
  if (toIso(input.currentQuoteUpdatedAt) !== input.record.quoteUpdatedAt) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_STALE_APPROVAL',
      'Quote changed after approval — re-approve required',
    );
  }
  if (
    input.expectedPreviewHash &&
    input.expectedPreviewHash !== input.record.previewHash
  ) {
    throw new QuotePriceOverrideError(
      'PRICE_OVERRIDE_STALE_APPROVAL',
      'Preview hash mismatch — re-approve required',
    );
  }
  return { ok: true };
}

export function markOverrideExecuted(input: {
  record: QuotePriceOverrideRecord;
  actorId: string;
}): QuotePriceOverrideRecord {
  return {
    ...input.record,
    status: 'EXECUTED',
    executedAt: new Date().toISOString(),
    executedBy: input.actorId,
  };
}

/** Apply proposed unit prices onto all quote lines (execution plan only — no DB). */
export function applyOverrideToQuoteLines(input: {
  allQuoteLines: FixedPriceLineInput[];
  proposedSellByLineId: Record<string, number>;
}): FixedPriceLineInput[] {
  return input.allQuoteLines.map((line) => {
    if (line.id && input.proposedSellByLineId[line.id] != null) {
      return { ...line, unitPriceCents: input.proposedSellByLineId[line.id]! };
    }
    return line;
  });
}

export function assertRow92UnchangedByOverride(input: {
  before: Pick<PricebookRuleSet, 'version' | 'status' | 'globalAutomationEnabled'>;
  after: Pick<PricebookRuleSet, 'version' | 'status' | 'globalAutomationEnabled'>;
}): void {
  assertRow92GlobalAutomationDisabled(input.before.globalAutomationEnabled);
  assertRow92GlobalAutomationDisabled(input.after.globalAutomationEnabled);
  if (input.before.version !== input.after.version) {
    throw new Error('Row 93 must not change Row 92 rule version');
  }
  if (input.before.status !== input.after.status) {
    throw new Error('Row 93 must not change Row 92 rule status');
  }
  if (input.after.status === 'ACTIVE' || input.after.globalAutomationEnabled) {
    throw new Error('Row 93 must not activate Row 92');
  }
}

export function assertCataloguePriceUnchangedByOverride(input: {
  beforeSellCents: number;
  afterSellCents: number;
}): void {
  if (input.beforeSellCents !== input.afterSellCents) {
    throw new Error('Row 93 must not mutate catalogue sell prices');
  }
}

export function assertSourceCostUnchangedByOverride(input: {
  beforeCostCents: number;
  afterCostCents: number;
}): void {
  if (input.beforeCostCents !== input.afterCostCents) {
    throw new Error('Row 93 must not mutate source/supplier cost');
  }
}

export function assertNewQuoteDoesNotInheritOverride(input: {
  priorOverrideSellCents: number;
  newQuoteLineSellCents: number;
  catalogueSellCents: number;
}): void {
  if (
    input.newQuoteLineSellCents === input.priorOverrideSellCents &&
    input.catalogueSellCents !== input.priorOverrideSellCents
  ) {
    throw new Error('New quote must not inherit prior one-off override price');
  }
}

export function projectCustomerSafeOverrideQuote(input: {
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents?: number;
  quoteTotalCents: number;
  officialNumber: string;
}): {
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents?: number;
  quoteTotalCents: number;
  officialNumber: string;
} {
  return {
    description: input.description,
    quantity: input.quantity,
    unitPriceCents: input.unitPriceCents,
    lineTotalCents: input.lineTotalCents,
    quoteTotalCents: input.quoteTotalCents,
    officialNumber: input.officialNumber,
  };
}

export function assertNoOverrideInternalLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoOverrideInternalLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'baselineSellPriceCents',
    'overrideReason',
    'approvedBy',
    'proposedBy',
    'previewHash',
    'effectiveMultiplier',
    'effectiveGrossMarginBps',
    'unitCostCents',
    'belowKnownCost',
    'row92ComparisonSellCents',
    'priceRuleVersion',
    'oneOffOverrideReason',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`Override internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') assertNoOverrideInternalLeak(value, `${path}.${key}`);
  }
}

export type QuotePriceOverrideAuditEventType =
  | 'price_override_proposed'
  | 'price_override_updated'
  | 'price_override_approved'
  | 'price_override_rejected'
  | 'price_override_cancelled'
  | 'price_override_execution_blocked'
  | 'price_override_executed';

export function buildQuotePriceOverrideAuditEvent(input: {
  eventType: QuotePriceOverrideAuditEventType;
  companyId: string;
  quoteId: string;
  overrideId: string;
  actorId?: string | null;
  lineIds?: string[];
  baselineTotalCents?: number | null;
  overrideTotalCents?: number | null;
  reason?: string | null;
  previewHash?: string | null;
  metadata?: Record<string, unknown>;
}): {
  companyId: string;
  action: QuotePriceOverrideAuditEventType;
  entityType: 'quote_line_price_override';
  entityId: string;
  metadata: Record<string, unknown>;
} {
  return {
    companyId: input.companyId,
    action: input.eventType,
    entityType: 'quote_line_price_override',
    entityId: input.overrideId,
    metadata: {
      eventType: input.eventType,
      quoteId: input.quoteId,
      overrideId: input.overrideId,
      actorId: input.actorId ?? null,
      lineIds: input.lineIds ?? [],
      baselineTotalCents: input.baselineTotalCents ?? null,
      overrideTotalCents: input.overrideTotalCents ?? null,
      reason: input.reason ?? null,
      previewHash: input.previewHash ?? null,
      timestamp: new Date().toISOString(),
      customerFacing: false,
      ...(input.metadata ?? {}),
    },
  };
}

export function assertRoyalCapeOverrideUnchanged(input: {
  quoteId: string;
  totalCents: number;
  xeroQuoteId: string | null | undefined;
  customerId: string;
  jobId: string | null | undefined;
  pricingPresentationMode?: string | null;
}): void {
  const rc = QUOTE_PRICE_OVERRIDE_ROYAL_CAPE;
  if (input.quoteId !== rc.royalCapeQuoteId) throw new Error('Royal Cape quote id mismatch');
  if (input.totalCents !== rc.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if ((input.xeroQuoteId ?? null) !== rc.royalCapeXeroQuoteId) {
    throw new Error('Royal Cape Xero quote id changed');
  }
  if (input.customerId !== rc.canonicalCustomerId) throw new Error('Royal Cape customer changed');
  if ((input.jobId ?? null) !== rc.jobId) throw new Error('Royal Cape job changed');
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== rc.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function assertRow93NoXeroWrites(n: number): void {
  if (n !== 0) throw new Error('Row 93 requires Xero writes = 0');
}
export function assertRow93NoCustomerSends(n: number): void {
  if (n !== 0) throw new Error('Row 93 requires customer sends = 0');
}
export function assertRow93NoProductionWrites(n: number): void {
  if (n !== 0) throw new Error('Row 93 requires production writes = 0');
}
export function assertRow93NoRealHistoricalQuoteChanges(n: number): void {
  if (n !== 0) throw new Error('Row 93 requires real historical quote changes = 0');
}
export function assertRow94NotStarted(started: boolean): void {
  if (started) throw new Error('Row 94 must not start during Row 93');
}
export function assertRow122NotStartedDuringRow93(started: boolean): void {
  if (started) throw new Error('Row 122 must not start during Row 93');
}

/** Staff-only indicator for 360 surfaces — no cost/margin leak. */
export function projectInternalOverrideIndicator(applied: boolean): {
  oneOffOverrideApplied: boolean;
  label: string | null;
} {
  return {
    oneOffOverrideApplied: applied,
    label: applied ? 'ONE-OFF OVERRIDE APPLIED' : null,
  };
}
