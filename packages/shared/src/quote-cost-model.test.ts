import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertNoCostLeakInCustomerProjection,
  assertRow96SafetyGates,
  computeComponentTotalCents,
  detectDuplicatePlanImport,
  mapPlanEstimateComponentType,
  normalizeCostToExVatCents,
  QUOTE_COST_COMPONENT_TYPES,
  QUOTE_COST_ROYAL_CAPE,
  summarizeQuoteCost,
  validateQuoteCostComponent,
} from './quote-cost-model.js';

describe('Row 96 quote cost model', () => {
  it('registers all required component types', () => {
    assert.equal(QUOTE_COST_COMPONENT_TYPES.length, 12);
    assert.ok(QUOTE_COST_COMPONENT_TYPES.includes('MATERIAL'));
    assert.ok(QUOTE_COST_COMPONENT_TYPES.includes('WARRANTY'));
  });

  it('computes component totals with optional wastage percent', () => {
    assert.equal(computeComponentTotalCents({ quantity: 2, unitCostCents: 1000 }), 2000);
    assert.equal(
      computeComponentTotalCents({ quantity: 2, unitCostCents: 1000, wastagePercentBps: 1000 }),
      2200,
    );
    assert.equal(computeComponentTotalCents({ quantity: 1, unitCostCents: null }), null);
  });

  it('normalizes VAT-inclusive cost without inventing rate', () => {
    const ex = normalizeCostToExVatCents({
      amountCents: 1150,
      vatBasis: 'VAT_INCLUSIVE',
      vatRateBps: 1500,
    });
    assert.equal(ex.exVatCents, 1000);
    const unknown = normalizeCostToExVatCents({
      amountCents: 1150,
      vatBasis: 'UNKNOWN',
      vatRateBps: 1500,
    });
    assert.equal(unknown.exVatCents, null);
    assert.equal(unknown.warning, 'VAT_BASIS_REVIEW_REQUIRED');
  });

  it('rejects customer-visible cost components', () => {
    const v = validateQuoteCostComponent({
      componentType: 'MATERIAL',
      description: 'Pipe',
      quantity: 1,
      unit: 'each',
      unitCostCents: 500,
      vatBasis: 'VAT_EXCLUSIVE',
      provenance: 'APPROVED_MANUAL_COST',
      customerVisible: true,
    });
    assert.equal(v.ok, false);
  });

  it('flags missing material / labour costs', () => {
    const v = validateQuoteCostComponent({
      componentType: 'MATERIAL',
      description: 'Unknown material',
      quantity: 1,
      unit: 'each',
      unitCostCents: null,
      vatBasis: 'VAT_EXCLUSIVE',
      provenance: 'COST_SOURCE_MISSING',
    });
    assert.ok(v.warnings.includes('MATERIAL_COST_MISSING'));
    assert.ok(v.warnings.includes('COST_SOURCE_MISSING'));
  });

  it('summarizes direct + total cost without double-counting overhead', () => {
    const summary = summarizeQuoteCost({
      sellExVatCents: 20_000,
      components: [
        {
          componentType: 'MATERIAL',
          totalCostCents: 5_000,
          provenance: 'APPROVED_MANUAL_COST',
          vatBasis: 'VAT_EXCLUSIVE',
        },
        {
          componentType: 'LABOUR',
          totalCostCents: 3_000,
          provenance: 'LABOUR_RATE_CONFIG',
          vatBasis: 'VAT_EXCLUSIVE',
        },
        {
          componentType: 'OVERHEAD',
          totalCostCents: 1_000,
          provenance: 'APPROVED_MANUAL_COST',
          vatBasis: 'VAT_EXCLUSIVE',
        },
        {
          componentType: 'CONTINGENCY',
          totalCostCents: 500,
          provenance: 'APPROVED_MANUAL_COST',
          vatBasis: 'VAT_EXCLUSIVE',
        },
      ],
      overheadConfigured: true,
    });
    assert.equal(summary.estimatedDirectCostCents, 8_000);
    assert.equal(summary.totalEstimatedCostCents, 9_500);
    assert.equal(summary.estimatedGrossProfitCents, 10_500);
    // Markup = (20000-9500)/9500
    assert.equal(summary.markupBps, Math.round((10_500 / 9_500) * 10_000));
    // Margin = GP/Sell
    assert.equal(summary.grossMarginBps, Math.round((10_500 / 20_000) * 10_000));
    assert.ok(summary.multiplier != null && Math.abs(summary.multiplier - 20_000 / 9_500) < 1e-9);
    assert.equal(summary.confidence, 'COMPLETE');
  });

  it('does not invent markup when cost is missing', () => {
    const summary = summarizeQuoteCost({
      sellExVatCents: 10_000,
      components: [
        {
          componentType: 'MATERIAL',
          totalCostCents: null,
          provenance: 'COST_SOURCE_MISSING',
          vatBasis: 'VAT_EXCLUSIVE',
        },
      ],
    });
    assert.equal(summary.markupBps, null);
    assert.equal(summary.multiplier, null);
    assert.equal(summary.costEstimateIncomplete, true);
  });

  it('maps plan estimate types and detects duplicate import', () => {
    assert.equal(mapPlanEstimateComponentType('SITE'), 'PRELIMINARY');
    const dup = detectDuplicatePlanImport(
      [{ planEstimateCostComponentId: 'pe-1' }],
      ['pe-1', 'pe-2'],
    );
    assert.deepEqual(dup.duplicateIds, ['pe-1']);
  });

  it('blocks cost fields from customer projection', () => {
    const leak = assertNoCostLeakInCustomerProjection({
      quoteNumber: 'QU-1',
      estimatedCostCents: 100,
    });
    assert.equal(leak.ok, false);
    assert.ok(leak.leaked.includes('estimatedCostCents'));
  });

  it('keeps Row 92 automation OFF and later rows not started', () => {
    const gates = assertRow96SafetyGates();
    assert.equal(gates.row92AutomationOff, true);
    assert.equal(gates.row97NotStarted, true);
    assert.equal(gates.row98NotStarted, true);
    assert.equal(gates.row99NotStarted, true);
  });

  it('preserves Royal Cape expected total constant', () => {
    assert.equal(QUOTE_COST_ROYAL_CAPE.expectedTotalCents, 4_272_250);
    assert.equal(QUOTE_COST_ROYAL_CAPE.expectedPricingMode, 'ITEMISED');
  });
});
