/**
 * Row 97 — AURA Quote Intelligence / Profitable-Price Guardrail
 *
 * Deterministic resolver only. AURA narrative MUST consume this output.
 * AI must NOT invent monetary values, margins, market prices, or competitor prices.
 *
 * Reuses Row 96 cost completeness + company profitFloorMarginBps.
 * Row 92 remains DRAFT / automation=false — preview only.
 * Does NOT execute Row 93 overrides.
 */

import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import type { QuoteCostConfidence, QuoteCostSummary } from './quote-cost-model.js';

export const QUOTE_PRICE_INTELLIGENCE_KEY = 'aura-quote-price-intelligence' as const;

export const QUOTE_PRICE_INTELLIGENCE_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type CostFloorStatus = 'COMPLETE' | 'COST_FLOOR_INCOMPLETE';

export type ProfitFloorConfigStatus =
  | 'CONFIGURED'
  | 'PROFIT_FLOOR_NOT_CONFIGURED';

export type TargetPriceStatus =
  | 'CONFIGURED'
  | 'TARGET_PRICE_NOT_CONFIGURED'
  | 'TARGET_BELOW_APPROVED_FLOOR'
  | 'UNAVAILABLE_COST_INCOMPLETE';

export type TargetPriceSource =
  | 'COMPANY_PROFIT_FLOOR_MARGIN_BPS'
  | 'ROW92_DRAFT_PREVIEW'
  | 'NONE';

export type MarketEvidenceStatus =
  | 'AVAILABLE'
  | 'MARKET_EVIDENCE_INSUFFICIENT';

export type SellVsFloorStatus =
  | 'BELOW_KNOWN_COST'
  | 'BELOW_APPROVED_FLOOR'
  | 'BELOW_TARGET'
  | 'ON_TARGET'
  | 'ABOVE_TARGET'
  | 'MARKET_EVIDENCE_UNAVAILABLE'
  | 'COST_FLOOR_INCOMPLETE'
  | 'UNAVAILABLE';

export type QuotePriceIntelligenceWarning =
  | 'PRICE_BELOW_KNOWN_COST'
  | 'PRICE_BELOW_APPROVED_PROFIT_FLOOR'
  | 'COST_FLOOR_INCOMPLETE'
  | 'TARGET_PRICE_NOT_CONFIGURED'
  | 'TARGET_BELOW_APPROVED_FLOOR'
  | 'PROFIT_FLOOR_NOT_CONFIGURED'
  | 'MARKET_EVIDENCE_INSUFFICIENT'
  | 'ROW92_PREVIEW_DRAFT_ONLY'
  | 'ROW93_OVERRIDE_BELOW_FLOOR'
  | 'ROW93_OVERRIDE_BELOW_COST';

export type MarketEvidenceSummary = {
  status: MarketEvidenceStatus;
  evidenceSource: string | null;
  sampleCount: number;
  dateRange: { from: string | null; to: string | null };
  comparableBasis: string | null;
  lowCents: number | null;
  medianCents: number | null;
  highCents: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  limitations: string[];
};

export type Row92DraftPreview = {
  labelled: 'DRAFT_PREVIEW_ONLY';
  status: string;
  globalAutomationEnabled: false;
  previewSellExVatCents: number | null;
  note: string;
};

export type QuotePriceIntelligenceInput = {
  currentSellExVatCents: number | null;
  /** Row 96 summary — authoritative cost completeness. */
  costSummary: Pick<
    QuoteCostSummary,
    | 'totalEstimatedCostCents'
    | 'costEstimateIncomplete'
    | 'confidence'
    | 'estimatedGrossProfitCents'
    | 'grossMarginBps'
    | 'markupBps'
    | 'multiplier'
    | 'warnings'
  > | null;
  /**
   * Explicit company profit-floor / target gross-margin setting (bps).
   * Null / undefined → PROFIT_FLOOR_NOT_CONFIGURED.
   * Do NOT invent a Young Guns margin.
   */
  profitFloorMarginBps: number | null | undefined;
  /** Optional Row 92 DRAFT preview sell (already computed elsewhere). Never activates. */
  row92DraftPreviewSellExVatCents?: number | null;
  row92RuleStatus?: string | null;
  row92GlobalAutomationEnabled?: boolean | null;
  /** Optional exact comparable sells (ex VAT) — already filtered by caller. */
  exactComparableSellExVatCents?: number[];
  comparableBasis?: string | null;
  comparableDateFrom?: string | null;
  comparableDateTo?: string | null;
  /** Row 93 override present on this quote? */
  hasRow93Override?: boolean;
  row93OverrideSellExVatCents?: number | null;
};

export type QuotePriceIntelligenceResult = {
  currentSellExVatCents: number | null;
  knownCostFloorCents: number | null;
  costFloorStatus: CostFloorStatus;
  costCompleteness: QuoteCostConfidence | 'UNKNOWN';
  profitFloorConfigStatus: ProfitFloorConfigStatus;
  profitFloorMarginBps: number | null;
  approvedProfitFloorCents: number | null;
  targetProfitablePriceCents: number | null;
  targetStatus: TargetPriceStatus;
  targetSource: TargetPriceSource;
  marketEvidence: MarketEvidenceSummary;
  estimatedGrossProfitCents: number | null;
  estimatedGrossMarginBps: number | null;
  markupBps: number | null;
  multiplier: number | null;
  sellVsFloorStatus: SellVsFloorStatus;
  warnings: QuotePriceIntelligenceWarning[];
  missingInputs: string[];
  confidence: 'COMPLETE' | 'PARTIAL' | 'REVIEW_REQUIRED' | 'INSUFFICIENT_INFORMATION';
  recommendationStatus: 'SAFE_TO_CONSIDER' | 'UNSAFE' | 'INSUFFICIENT_EVIDENCE';
  recommendationExplanation: string;
  row92Preview: Row92DraftPreview | null;
  evidence: {
    costSource: 'ROW96_CANONICAL_TOTAL_ESTIMATED_COST' | 'NONE';
    profitFloorSource: 'COMPANY_FINANCE_SETTINGS_PROFIT_FLOOR_MARGIN_BPS' | 'NONE';
    targetSource: TargetPriceSource;
    marketSource: string | null;
  };
  auraNarrativeFacts: string[];
};

function medianCents(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

export function resolveQuotePriceIntelligence(
  input: QuotePriceIntelligenceInput,
): QuotePriceIntelligenceResult {
  assertRow92GlobalAutomationDisabled(Boolean(input.row92GlobalAutomationEnabled));

  const warnings: QuotePriceIntelligenceWarning[] = [];
  const missingInputs: string[] = [];
  const auraNarrativeFacts: string[] = [];

  const costIncomplete =
    !input.costSummary ||
    input.costSummary.costEstimateIncomplete ||
    input.costSummary.totalEstimatedCostCents == null;

  let knownCostFloorCents: number | null = null;
  let costFloorStatus: CostFloorStatus = 'COST_FLOOR_INCOMPLETE';
  if (
    input.costSummary &&
    !input.costSummary.costEstimateIncomplete &&
    input.costSummary.totalEstimatedCostCents != null &&
    input.costSummary.totalEstimatedCostCents >= 0
  ) {
    knownCostFloorCents = input.costSummary.totalEstimatedCostCents;
    costFloorStatus = 'COMPLETE';
    auraNarrativeFacts.push(
      `Known cost floor is ${knownCostFloorCents} cents ex VAT from Row 96 canonical total estimated cost.`,
    );
  } else {
    warnings.push('COST_FLOOR_INCOMPLETE');
    missingInputs.push('complete_row96_total_estimated_cost');
    auraNarrativeFacts.push(
      'Cost floor is incomplete — Row 96 total estimated cost is missing or incomplete. Do not invent missing material costs.',
    );
  }

  const costCompleteness: QuoteCostConfidence | 'UNKNOWN' =
    input.costSummary?.confidence ?? 'UNKNOWN';

  const hasProfitFloorConfig =
    input.profitFloorMarginBps != null &&
    Number.isFinite(input.profitFloorMarginBps) &&
    input.profitFloorMarginBps >= 0;

  let profitFloorConfigStatus: ProfitFloorConfigStatus = hasProfitFloorConfig
    ? 'CONFIGURED'
    : 'PROFIT_FLOOR_NOT_CONFIGURED';
  let approvedProfitFloorCents: number | null = null;
  const profitFloorMarginBps = hasProfitFloorConfig ? input.profitFloorMarginBps! : null;

  if (!hasProfitFloorConfig) {
    warnings.push('PROFIT_FLOOR_NOT_CONFIGURED');
    missingInputs.push('company_profit_floor_margin_bps');
    auraNarrativeFacts.push(
      'No explicit company profit-floor margin is configured. Do not invent a Young Guns minimum margin.',
    );
  } else if (costFloorStatus === 'COMPLETE' && knownCostFloorCents != null) {
    // Target/floor sell from cost + configured margin: cost * (1 + bps/10000)
    approvedProfitFloorCents = Math.round(
      knownCostFloorCents * (1 + profitFloorMarginBps! / 10_000),
    );
    auraNarrativeFacts.push(
      `Approved profit floor uses company profitFloorMarginBps=${profitFloorMarginBps} → ${approvedProfitFloorCents} cents ex VAT.`,
    );
  } else {
    auraNarrativeFacts.push(
      `Company profitFloorMarginBps=${profitFloorMarginBps} is configured, but approved profit-floor price cannot be computed until the cost floor is complete.`,
    );
  }

  // Target: same authorised company margin when available; never invent.
  let targetProfitablePriceCents: number | null = null;
  let targetStatus: TargetPriceStatus = 'TARGET_PRICE_NOT_CONFIGURED';
  let targetSource: TargetPriceSource = 'NONE';

  if (!hasProfitFloorConfig) {
    warnings.push('TARGET_PRICE_NOT_CONFIGURED');
    missingInputs.push('authorised_target_margin_or_price');
    auraNarrativeFacts.push('Target profitable price is not configured.');
  } else if (costFloorStatus !== 'COMPLETE' || knownCostFloorCents == null) {
    targetStatus = 'UNAVAILABLE_COST_INCOMPLETE';
    missingInputs.push('complete_cost_for_target');
    auraNarrativeFacts.push(
      'Target profitable price cannot be computed while the cost floor is incomplete.',
    );
  } else {
    targetProfitablePriceCents = approvedProfitFloorCents;
    targetSource = 'COMPANY_PROFIT_FLOOR_MARGIN_BPS';
    targetStatus = 'CONFIGURED';
    if (
      targetProfitablePriceCents != null &&
      knownCostFloorCents != null &&
      targetProfitablePriceCents < knownCostFloorCents
    ) {
      warnings.push('TARGET_BELOW_APPROVED_FLOOR');
      targetStatus = 'TARGET_BELOW_APPROVED_FLOOR';
      auraNarrativeFacts.push(
        'Target candidate is below the known cost floor — do not silently lower or clamp; treat as TARGET_BELOW_APPROVED_FLOOR.',
      );
      // Do not recommend the unsafe target as actionable.
      targetProfitablePriceCents = null;
    }
  }

  // Row 92 DRAFT preview — evidence only, never activation.
  let row92Preview: Row92DraftPreview | null = null;
  if (
    input.row92DraftPreviewSellExVatCents != null ||
    input.row92RuleStatus != null
  ) {
    const automationOn = input.row92GlobalAutomationEnabled === true;
    row92Preview = {
      labelled: 'DRAFT_PREVIEW_ONLY',
      status: input.row92RuleStatus ?? 'DRAFT',
      globalAutomationEnabled: false,
      previewSellExVatCents: automationOn
        ? null
        : input.row92DraftPreviewSellExVatCents ?? null,
      note: 'Row 92 rule is DRAFT/preview only — not applied, not activated, does not reprice catalogue or quote.',
    };
    warnings.push('ROW92_PREVIEW_DRAFT_ONLY');
    auraNarrativeFacts.push(row92Preview.note);
    if (
      targetStatus === 'TARGET_PRICE_NOT_CONFIGURED' &&
      row92Preview.previewSellExVatCents != null &&
      costFloorStatus === 'COMPLETE'
    ) {
      // May surface as DRAFT preview evidence, not as activated target.
      auraNarrativeFacts.push(
        `Row 92 DRAFT preview sell (ex VAT) = ${row92Preview.previewSellExVatCents} cents — labelled DRAFT_PREVIEW_ONLY.`,
      );
    }
  }

  // Market evidence — exact samples only (caller must not fuzzy-match).
  const samples = (input.exactComparableSellExVatCents ?? []).filter(
    (n) => Number.isFinite(n) && n >= 0,
  );
  let marketEvidence: MarketEvidenceSummary;
  if (samples.length === 0) {
    marketEvidence = {
      status: 'MARKET_EVIDENCE_INSUFFICIENT',
      evidenceSource: null,
      sampleCount: 0,
      dateRange: { from: null, to: null },
      comparableBasis: input.comparableBasis ?? null,
      lowCents: null,
      medianCents: null,
      highCents: null,
      confidence: 'NONE',
      limitations: [
        'No exact comparable historical sells were provided.',
        'Do not invent competitor prices or fuzzy-match descriptions.',
      ],
    };
    warnings.push('MARKET_EVIDENCE_INSUFFICIENT');
    missingInputs.push('exact_comparable_market_evidence');
    auraNarrativeFacts.push('Market evidence is insufficient — no invented competitor pricing.');
  } else {
    marketEvidence = {
      status: 'AVAILABLE',
      evidenceSource: 'EXACT_COMPARABLE_HISTORICAL_YG_QUOTES',
      sampleCount: samples.length,
      dateRange: {
        from: input.comparableDateFrom ?? null,
        to: input.comparableDateTo ?? null,
      },
      comparableBasis: input.comparableBasis ?? 'exact_canonical_identity',
      lowCents: Math.min(...samples),
      medianCents: medianCents(samples),
      highCents: Math.max(...samples),
      confidence: samples.length >= 5 ? 'HIGH' : samples.length >= 2 ? 'MEDIUM' : 'LOW',
      limitations: [
        'Comparables are limited to exact canonical identity/scenario matches supplied by the server.',
        'Not a broad market survey.',
      ],
    };
    auraNarrativeFacts.push(
      `Market evidence: ${samples.length} exact comparable(s); median ${marketEvidence.medianCents} cents ex VAT.`,
    );
  }

  const currentSellExVatCents =
    input.currentSellExVatCents != null && Number.isFinite(input.currentSellExVatCents)
      ? input.currentSellExVatCents
      : null;

  let estimatedGrossProfitCents: number | null = null;
  let estimatedGrossMarginBps: number | null = null;
  let markupBps: number | null = null;
  let multiplier: number | null = null;

  if (
    currentSellExVatCents != null &&
    knownCostFloorCents != null &&
    costFloorStatus === 'COMPLETE'
  ) {
    estimatedGrossProfitCents = currentSellExVatCents - knownCostFloorCents;
    if (currentSellExVatCents > 0) {
      estimatedGrossMarginBps = Math.round(
        (estimatedGrossProfitCents / currentSellExVatCents) * 10_000,
      );
    }
    if (knownCostFloorCents > 0) {
      markupBps = Math.round(
        (estimatedGrossProfitCents / knownCostFloorCents) * 10_000,
      );
      multiplier = currentSellExVatCents / knownCostFloorCents;
    }
  } else if (input.costSummary && !costIncomplete) {
    estimatedGrossProfitCents = input.costSummary.estimatedGrossProfitCents;
    estimatedGrossMarginBps = input.costSummary.grossMarginBps;
    markupBps = input.costSummary.markupBps;
    multiplier = input.costSummary.multiplier;
  }

  // Sell vs floors
  let sellVsFloorStatus: SellVsFloorStatus = 'UNAVAILABLE';
  if (currentSellExVatCents == null) {
    sellVsFloorStatus = 'UNAVAILABLE';
    missingInputs.push('current_sell_ex_vat');
  } else if (costFloorStatus === 'COST_FLOOR_INCOMPLETE') {
    sellVsFloorStatus = 'COST_FLOOR_INCOMPLETE';
  } else if (
    knownCostFloorCents != null &&
    currentSellExVatCents < knownCostFloorCents
  ) {
    sellVsFloorStatus = 'BELOW_KNOWN_COST';
    warnings.push('PRICE_BELOW_KNOWN_COST');
    auraNarrativeFacts.push(
      'Current sell is below the known cost floor — AURA must not recommend undercutting cost to win the job.',
    );
  } else if (
    approvedProfitFloorCents != null &&
    currentSellExVatCents < approvedProfitFloorCents
  ) {
    sellVsFloorStatus = 'BELOW_APPROVED_FLOOR';
    warnings.push('PRICE_BELOW_APPROVED_PROFIT_FLOOR');
    auraNarrativeFacts.push(
      'Current sell is below the approved profit floor — do not recommend undercutting the floor.',
    );
  } else if (targetProfitablePriceCents != null) {
    const band = Math.max(100, Math.round(targetProfitablePriceCents * 0.02)); // 2% or 100c
    if (currentSellExVatCents < targetProfitablePriceCents - band) {
      sellVsFloorStatus = 'BELOW_TARGET';
    } else if (currentSellExVatCents > targetProfitablePriceCents + band) {
      sellVsFloorStatus = 'ABOVE_TARGET';
    } else {
      sellVsFloorStatus = 'ON_TARGET';
    }
  } else if (marketEvidence.status === 'MARKET_EVIDENCE_INSUFFICIENT') {
    sellVsFloorStatus = 'MARKET_EVIDENCE_UNAVAILABLE';
    // Do not label "too high" merely because market evidence is missing.
  }

  if (input.hasRow93Override) {
    const o = input.row93OverrideSellExVatCents;
    if (o != null && knownCostFloorCents != null && o < knownCostFloorCents) {
      warnings.push('ROW93_OVERRIDE_BELOW_COST');
      auraNarrativeFacts.push(
        'An Owner-approved Row 93 override exists below known cost — surface warning; do not rewrite override history.',
      );
    } else if (
      o != null &&
      approvedProfitFloorCents != null &&
      o < approvedProfitFloorCents
    ) {
      warnings.push('ROW93_OVERRIDE_BELOW_FLOOR');
      auraNarrativeFacts.push(
        'An Owner-approved Row 93 override exists below the approved profit floor — surface warning; do not rewrite override history.',
      );
    } else {
      auraNarrativeFacts.push(
        'Row 93 Owner-approved one-off override is preserved separately; Row 97 does not execute overrides.',
      );
    }
  }

  // Recommendation status
  let recommendationStatus: QuotePriceIntelligenceResult['recommendationStatus'] =
    'INSUFFICIENT_EVIDENCE';
  let recommendationExplanation =
    'Insufficient deterministic evidence for a safe profitable-price recommendation.';

  const unsafe =
    warnings.includes('PRICE_BELOW_KNOWN_COST') ||
    warnings.includes('PRICE_BELOW_APPROVED_PROFIT_FLOOR') ||
    warnings.includes('TARGET_BELOW_APPROVED_FLOOR');

  if (unsafe) {
    recommendationStatus = 'UNSAFE';
    recommendationExplanation =
      'Current or proposed pricing violates a known/approved floor. AURA must not recommend undercutting the floor merely to win the job.';
  } else if (
    costFloorStatus === 'COMPLETE' &&
    (targetProfitablePriceCents != null || approvedProfitFloorCents != null)
  ) {
    recommendationStatus = 'SAFE_TO_CONSIDER';
    recommendationExplanation =
      targetProfitablePriceCents != null
        ? `Evidence-backed target profitable price is ${targetProfitablePriceCents} cents ex VAT (source: ${targetSource}). Do not go below known cost ${knownCostFloorCents} or approved floor ${approvedProfitFloorCents}.`
        : `Known cost floor ${knownCostFloorCents} cents and approved profit floor ${approvedProfitFloorCents} cents are available. Target price remains unavailable.`;
  } else if (costFloorStatus === 'COST_FLOOR_INCOMPLETE') {
    recommendationStatus = 'INSUFFICIENT_EVIDENCE';
    recommendationExplanation =
      'Cost floor incomplete — disclose missing inputs; do not invent a complete floor or target.';
  }

  let confidence: QuotePriceIntelligenceResult['confidence'] = 'INSUFFICIENT_INFORMATION';
  if (recommendationStatus === 'SAFE_TO_CONSIDER' && marketEvidence.status === 'AVAILABLE') {
    confidence = 'COMPLETE';
  } else if (recommendationStatus === 'SAFE_TO_CONSIDER') {
    confidence = 'PARTIAL';
  } else if (unsafe) {
    confidence = 'REVIEW_REQUIRED';
  } else if (costFloorStatus === 'COST_FLOOR_INCOMPLETE') {
    confidence = 'INSUFFICIENT_INFORMATION';
  } else {
    confidence = 'PARTIAL';
  }

  return {
    currentSellExVatCents,
    knownCostFloorCents,
    costFloorStatus,
    costCompleteness,
    profitFloorConfigStatus,
    profitFloorMarginBps,
    approvedProfitFloorCents,
    targetProfitablePriceCents,
    targetStatus,
    targetSource,
    marketEvidence,
    estimatedGrossProfitCents,
    estimatedGrossMarginBps,
    markupBps,
    multiplier,
    sellVsFloorStatus,
    warnings: [...new Set(warnings)],
    missingInputs: [...new Set(missingInputs)],
    confidence,
    recommendationStatus,
    recommendationExplanation,
    row92Preview,
    evidence: {
      costSource:
        costFloorStatus === 'COMPLETE'
          ? 'ROW96_CANONICAL_TOTAL_ESTIMATED_COST'
          : 'NONE',
      profitFloorSource: hasProfitFloorConfig
        ? 'COMPANY_FINANCE_SETTINGS_PROFIT_FLOOR_MARGIN_BPS'
        : 'NONE',
      targetSource,
      marketSource:
        marketEvidence.status === 'AVAILABLE' ? marketEvidence.evidenceSource : null,
    },
    auraNarrativeFacts,
  };
}

/** Fields that must never appear in Client / customer PDF projections. */
export const QUOTE_PRICE_INTELLIGENCE_INTERNAL_FIELDS = [
  'knownCostFloorCents',
  'approvedProfitFloorCents',
  'targetProfitablePriceCents',
  'profitFloorMarginBps',
  'estimatedGrossProfitCents',
  'estimatedGrossMarginBps',
  'markupBps',
  'multiplier',
  'marketEvidence',
  'recommendationExplanation',
  'auraNarrativeFacts',
  'row92Preview',
  'priceIntelligence',
] as const;

export function assertNoPriceIntelligenceLeak(
  payload: Record<string, unknown>,
): { ok: boolean; leaked: string[] } {
  const leaked: string[] = [];
  for (const key of QUOTE_PRICE_INTELLIGENCE_INTERNAL_FIELDS) {
    if (key in payload && payload[key] != null) leaked.push(key);
  }
  return { ok: leaked.length === 0, leaked };
}

export function assertRow97SafetyGates(input?: {
  row92AutomationEnabled?: boolean;
}): {
  row92AutomationOff: true;
  row98NotStarted: true;
  row99NotStarted: true;
} {
  assertRow92GlobalAutomationDisabled(Boolean(input?.row92AutomationEnabled));
  return {
    row92AutomationOff: true,
    row98NotStarted: true,
    row99NotStarted: true,
  };
}

/** Display helper — never show R0 for missing/not configured. */
export function formatIntelligenceMoneyLabel(
  cents: number | null | undefined,
  unavailableLabel: string,
): { kind: 'MONEY' | 'UNAVAILABLE'; cents: number | null; label: string } {
  if (cents == null) {
    return { kind: 'UNAVAILABLE', cents: null, label: unavailableLabel };
  }
  return { kind: 'MONEY', cents, label: String(cents) };
}
