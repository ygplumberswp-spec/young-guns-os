import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRow123SafetyGates,
  provePlanEstimateToActualProfitHandoff,
} from './plan-estimate-actual-profit-row123.js';

describe('Row 123 plan estimate → actual profit', () => {
  it('marks missing evidence incomplete; never invents values', () => {
    const incomplete = provePlanEstimateToActualProfitHandoff({
      hasPlanTakeoff: true,
      hasWaterWasteGeyserQuantities: true,
      hasMaterials: true,
      hasLabour: false,
      hasSiteDirectCost: true,
      estimatedGpCents: null,
      hasQuoteLink: true,
      hasJobLink: true,
      actualProfitAfterCloseCents: null,
      jobClosed: false,
    });
    assert.equal(incomplete.completeness, 'INCOMPLETE');
    assert.equal(incomplete.inventedValues, false);
    assert.ok(
      incomplete.steps.find((s) => s.step === 'estimated_gp')?.status === 'INCOMPLETE',
    );

    const complete = provePlanEstimateToActualProfitHandoff({
      hasPlanTakeoff: true,
      hasWaterWasteGeyserQuantities: true,
      hasMaterials: true,
      hasLabour: true,
      hasSiteDirectCost: true,
      estimatedGpCents: 50000,
      hasQuoteLink: true,
      hasJobLink: true,
      actualProfitAfterCloseCents: 42000,
      jobClosed: true,
    });
    assert.equal(complete.completeness, 'COMPLETE');
    assert.equal(assertRow123SafetyGates({ row92AutomationEnabled: false }).inventedValues, false);
  });
});
