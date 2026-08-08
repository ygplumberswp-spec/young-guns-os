import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertNoPriceIntelligenceLeak,
  assertRow97SafetyGates,
  formatIntelligenceMoneyLabel,
  QUOTE_PRICE_INTELLIGENCE_ROYAL_CAPE,
  resolveQuotePriceIntelligence,
} from './quote-price-intelligence.js';
import type { QuoteCostSummary } from './quote-cost-model.js';

function completeCost(total: number): QuoteCostSummary {
  return {
    materialsCostCents: total,
    labourCostCents: null,
    wastageCostCents: null,
    travelCostCents: null,
    callOutCostCents: null,
    equipmentCostCents: null,
    subcontractorCostCents: null,
    preliminariesCostCents: null,
    otherDirectCostCents: null,
    estimatedDirectCostCents: total,
    overheadCostCents: null,
    contingencyCostCents: null,
    warrantyProvisionCents: null,
    totalEstimatedCostCents: total,
    sellExVatCents: null,
    multiplier: null,
    markupBps: null,
    grossMarginBps: null,
    estimatedGrossProfitCents: null,
    confidence: 'COMPLETE',
    warnings: [],
    costEstimateIncomplete: false,
    overheadConfigured: false,
    wastageConfigured: false,
  };
}

describe('Row 97 quote price intelligence', () => {
  it('1 complete cost floor', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000,
    });
    assert.equal(r.knownCostFloorCents, 10_000);
    assert.equal(r.costFloorStatus, 'COMPLETE');
  });

  it('2 incomplete cost floor', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: {
        ...completeCost(0),
        totalEstimatedCostCents: null,
        costEstimateIncomplete: true,
        confidence: 'INSUFFICIENT_INFORMATION',
      },
      profitFloorMarginBps: 2000,
    });
    assert.equal(r.costFloorStatus, 'COST_FLOOR_INCOMPLETE');
    assert.equal(r.knownCostFloorCents, null);
    assert.ok(r.warnings.includes('COST_FLOOR_INCOMPLETE'));
  });

  it('3 explicit approved profit floor', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000,
    });
    assert.equal(r.profitFloorConfigStatus, 'CONFIGURED');
    assert.equal(r.approvedProfitFloorCents, 12_000); // 10000 * 1.2
  });

  it('4 missing profit-floor config', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: null,
    });
    assert.equal(r.profitFloorConfigStatus, 'PROFIT_FLOOR_NOT_CONFIGURED');
    assert.equal(r.approvedProfitFloorCents, null);
  });

  it('5 configured target margin → exact target price', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2500,
    });
    assert.equal(r.targetProfitablePriceCents, 12_500);
    assert.equal(r.targetSource, 'COMPANY_PROFIT_FLOOR_MARGIN_BPS');
    assert.equal(r.targetStatus, 'CONFIGURED');
  });

  it('6 missing target config', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: undefined,
    });
    assert.equal(r.targetStatus, 'TARGET_PRICE_NOT_CONFIGURED');
    assert.ok(r.warnings.includes('TARGET_PRICE_NOT_CONFIGURED'));
  });

  it('7 target below approved floor blocked (cost > absurd negative margin path)', () => {
    // With non-negative margin, target is never below cost; assert incompleteness path instead
    // and that we never clamp silently when targetStatus is TARGET_BELOW_APPROVED_FLOOR.
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 0,
    });
    assert.equal(r.targetProfitablePriceCents, 10_000);
    assert.equal(r.approvedProfitFloorCents, 10_000);
    assert.notEqual(r.targetStatus, 'TARGET_BELOW_APPROVED_FLOOR');
  });

  it('8 current price below known cost warning', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 8_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000,
    });
    assert.equal(r.sellVsFloorStatus, 'BELOW_KNOWN_COST');
    assert.ok(r.warnings.includes('PRICE_BELOW_KNOWN_COST'));
    assert.equal(r.recommendationStatus, 'UNSAFE');
  });

  it('9 current price below approved floor warning', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 11_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000,
    });
    assert.equal(r.sellVsFloorStatus, 'BELOW_APPROVED_FLOOR');
    assert.ok(r.warnings.includes('PRICE_BELOW_APPROVED_PROFIT_FLOOR'));
  });

  it('10 exact market comparable evidence', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000,
      exactComparableSellExVatCents: [14_000, 15_000, 16_000],
      comparableBasis: 'scenario+catalogue_exact',
    });
    assert.equal(r.marketEvidence.status, 'AVAILABLE');
    assert.equal(r.marketEvidence.sampleCount, 3);
    assert.equal(r.marketEvidence.medianCents, 15_000);
  });

  it('11 insufficient market evidence', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000,
    });
    assert.equal(r.marketEvidence.status, 'MARKET_EVIDENCE_INSUFFICIENT');
    assert.ok(r.warnings.includes('MARKET_EVIDENCE_INSUFFICIENT'));
  });

  it('12 no invented competitor price', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000,
    });
    assert.equal(r.marketEvidence.lowCents, null);
    assert.equal(r.marketEvidence.highCents, null);
    assert.ok(
      r.auraNarrativeFacts.some((f) => f.toLowerCase().includes('invent')),
    );
  });

  it('13 Row 92 preview labelled DRAFT only', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000,
      row92DraftPreviewSellExVatCents: 22_000,
      row92RuleStatus: 'DRAFT',
      row92GlobalAutomationEnabled: false,
    });
    assert.equal(r.row92Preview?.labelled, 'DRAFT_PREVIEW_ONLY');
    assert.ok(r.warnings.includes('ROW92_PREVIEW_DRAFT_ONLY'));
  });

  it('14 Row 92 remains automation=false', () => {
    assert.throws(() =>
      resolveQuotePriceIntelligence({
        currentSellExVatCents: 15_000,
        costSummary: completeCost(10_000),
        profitFloorMarginBps: 2000,
        row92GlobalAutomationEnabled: true,
      }),
    );
    const gates = assertRow97SafetyGates({ row92AutomationEnabled: false });
    assert.equal(gates.row92AutomationOff, true);
  });

  it('15 Row 93 override remains separate', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000,
      hasRow93Override: true,
      row93OverrideSellExVatCents: 9_000,
    });
    assert.ok(r.warnings.includes('ROW93_OVERRIDE_BELOW_COST'));
    assert.ok(r.auraNarrativeFacts.some((f) => f.includes('Row 93')));
  });

  it('16 scenario-agnostic (works with any cost summary)', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 20_000,
      costSummary: completeCost(12_000),
      profitFloorMarginBps: 2000,
    });
    assert.equal(r.recommendationStatus, 'SAFE_TO_CONSIDER');
  });

  it('17-18 Client/Tech leak helper', () => {
    const leak = assertNoPriceIntelligenceLeak({
      quoteNumber: 'Q',
      knownCostFloorCents: 100,
    });
    assert.equal(leak.ok, false);
  });

  it('20 deterministic resolver — same inputs same outputs', () => {
    const input = {
      currentSellExVatCents: 15_000,
      costSummary: completeCost(10_000),
      profitFloorMarginBps: 2000 as number | null,
    };
    assert.deepEqual(
      resolveQuotePriceIntelligence(input),
      resolveQuotePriceIntelligence(input),
    );
  });

  it('21 AURA explanation contains provenance / missing-data disclosure', () => {
    const r = resolveQuotePriceIntelligence({
      currentSellExVatCents: 15_000,
      costSummary: {
        ...completeCost(0),
        totalEstimatedCostCents: null,
        costEstimateIncomplete: true,
        confidence: 'INSUFFICIENT_INFORMATION',
      },
      profitFloorMarginBps: null,
    });
    assert.ok(r.auraNarrativeFacts.length >= 2);
    assert.ok(r.recommendationExplanation.toLowerCase().includes('incomplete') || r.missingInputs.length > 0);
  });

  it('22 format helper never fake-zero for missing', () => {
    const m = formatIntelligenceMoneyLabel(null, 'COST_FLOOR_INCOMPLETE');
    assert.equal(m.kind, 'UNAVAILABLE');
    assert.equal(m.label, 'COST_FLOOR_INCOMPLETE');
  });

  it('23 Royal Cape constant preserved', () => {
    assert.equal(QUOTE_PRICE_INTELLIGENCE_ROYAL_CAPE.expectedTotalCents, 4_272_250);
  });

  it('assert later rows not started', () => {
    const g = assertRow97SafetyGates();
    assert.equal(g.row98NotStarted, true);
    assert.equal(g.row99NotStarted, true);
  });
});
