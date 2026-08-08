import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_ESTIMATE_ROYAL_CAPE,
  assertCanApproveForQuote,
  assertCanGenerateDraftQuote,
  assertMeasurementAllowed,
  assertNoPlanEstimateInternalLeak,
  assertPlanQuantityValid,
  assertRow92StillInactiveForPlanEstimate,
  assertRow94NoCustomerSends,
  assertRow94NoProductionWrites,
  assertRow94NoXeroWrites,
  assertRow95NotStarted,
  assertRow96NotStarted,
  assertRow98AiTakeoffNotStarted,
  assertRoyalCapePlanEstimateUnchanged,
  buildPlanEstimateSummary,
  buildPlanVsActualComparison,
  canApprovePlanEstimate,
  canManagePlanEstimates,
  estimateRequiresReview,
  mapEstimateItemsToQuoteLines,
  planRevisionRequiresReview,
  projectCustomerSafePlanQuote,
  resolvePlanEstimateStatus,
} from './plan-estimate.js';
import { calculateCustomerFacingQuoteAmounts } from './fixed-price-quoting.js';

test('safety: Row 95/96/98 not started; writes 0; Row 92 inactive', () => {
  assertRow95NotStarted(false);
  assertRow96NotStarted(false);
  assertRow98AiTakeoffNotStarted(false);
  assertRow94NoXeroWrites(0);
  assertRow94NoCustomerSends(0);
  assertRow94NoProductionWrites(0);
  assertRow92StillInactiveForPlanEstimate({ status: 'DRAFT', globalAutomationEnabled: false });
});

test('1-8 water/waste/geyser + quantity + ambiguity + scale', () => {
  assertPlanQuantityValid({
    quantity: 4,
    quantityOrigin: 'MANUAL_COUNT',
    confidence: 'CONFIRMED',
  });
  assert.equal(
    estimateRequiresReview([{ confidence: 'REVIEW_REQUIRED' }]),
    true,
  );
  assert.equal(
    resolvePlanEstimateStatus({
      items: [
        { confidence: 'CONFIRMED' },
        { confidence: 'REVIEW_REQUIRED' },
      ],
    }),
    'REVIEW_REQUIRED',
  );
  const scaleMissing = assertMeasurementAllowed({
    scaleStatus: 'SCALE_NOT_PROVIDED',
    isLengthMeasurement: true,
  });
  assert.equal(scaleMissing.ok, false);
  const scaleOk = assertMeasurementAllowed({
    scaleStatus: 'SCALE_VERIFIED',
    isLengthMeasurement: true,
  });
  assert.equal(scaleOk.ok, true);
});

test('9-17 materials/labour/site costs + GP incomplete/complete', () => {
  const incomplete = buildPlanEstimateSummary({
    components: [
      {
        componentType: 'MATERIAL',
        quantity: 2,
        unitCostCents: null,
        costProvenance: 'MISSING',
      },
      {
        componentType: 'LABOUR',
        quantity: 3,
        unitCostCents: 8000,
        costProvenance: 'APPROVED_MANUAL_COST',
      },
    ],
    sell: { proposedSellExVatCents: 100_000, sellSource: 'MANUAL_DRAFT' },
  });
  assert.equal(incomplete.costEstimateIncomplete, true);
  assert.equal(incomplete.gpIncomplete, true);
  assert.ok(incomplete.missingCostReasons.includes('COST_ESTIMATE_INCOMPLETE'));

  const complete = buildPlanEstimateSummary({
    components: [
      {
        componentType: 'MATERIAL',
        quantity: 2,
        unitCostCents: 10_000,
        costProvenance: 'SUPPLIER_QUOTE',
      },
      {
        componentType: 'LABOUR',
        quantity: 4,
        unitCostCents: 8_000,
        costProvenance: 'APPROVED_MANUAL_COST',
      },
      {
        componentType: 'SITE',
        quantity: 1,
        unitCostCents: 5_000,
        costProvenance: 'APPROVED_MANUAL_COST',
      },
    ],
    sell: { proposedSellExVatCents: 100_000, sellSource: 'MANUAL_DRAFT' },
  });
  assert.equal(complete.directCostTotalCents, 20_000 + 32_000 + 5_000);
  assert.equal(complete.estimatedGrossProfitCents, 100_000 - 57_000);
  assert.equal(complete.gpIncomplete, false);
  assert.equal(complete.estimatedGrossMarginBps, Math.round((43_000 * 10_000) / 100_000));
});

test('18-23 review gate + quote mapping + Row 90 flat-rate', () => {
  assert.throws(() => assertCanApproveForQuote('REVIEW_REQUIRED'));
  assert.throws(() => assertCanGenerateDraftQuote('REVIEWED'));
  assertCanApproveForQuote('REVIEWED');
  assertCanGenerateDraftQuote('APPROVED_FOR_QUOTE');

  const lines = mapEstimateItemsToQuoteLines({
    items: [
      {
        description: 'Cold water point',
        quantity: 3,
        confidence: 'CONFIRMED',
        pointType: 'WATER',
        customerVisibleScopeText: 'Supply cold water points',
      },
      {
        description: 'Ambiguous waste',
        quantity: 1,
        confidence: 'REVIEW_REQUIRED',
        pointType: 'WASTE',
      },
      {
        description: 'Geyser install',
        quantity: 1,
        confidence: 'CONFIRMED',
        pointType: 'GEYSER',
      },
    ],
    unitPriceCentsByIndex: [15_000, null, 250_000],
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.description, 'Supply cold water points');

  const flat = calculateCustomerFacingQuoteAmounts({
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
    lines: [
      {
        description: 'Plan-based fixed price',
        quantity: 1,
        unitPriceCents: 275_000,
        category: 'scope',
        customerVisible: true,
      },
      {
        description: 'Absorbed labour',
        quantity: 2,
        unitPriceCents: 65_000,
        category: 'labour',
        customerVisible: false,
      },
    ],
  });
  assert.equal(flat.subtotalCents, 275_000);
});

test('24-30 plan revision + vs actual provisional/final', () => {
  const rev = planRevisionRequiresReview({
    previousRevisionLabel: 'Rev A',
    nextRevisionLabel: 'Rev B',
  });
  assert.equal(rev.changed, true);
  assert.ok(rev.flags.includes('PLAN_REVISION_CHANGED'));

  const summary = buildPlanEstimateSummary({
    components: [
      {
        componentType: 'MATERIAL',
        quantity: 1,
        unitCostCents: 40_000,
        costProvenance: 'SUPPLIER_QUOTE',
      },
    ],
    sell: { proposedSellExVatCents: 88_000, sellSource: 'MANUAL_DRAFT' },
  });
  const open = buildPlanVsActualComparison({
    estimateSummary: summary,
    jobComplete: false,
    actual: {
      materialsCostCents: 45_000,
      labourCostCents: 0,
      otherDirectCostCents: 0,
      revenueCents: 88_000,
      grossProfitCents: 43_000,
      actualCostComplete: true,
    },
  });
  assert.equal(open.status, 'PROVISIONAL');

  const closed = buildPlanVsActualComparison({
    estimateSummary: summary,
    jobComplete: true,
    actual: {
      materialsCostCents: 45_000,
      labourCostCents: 10_000,
      otherDirectCostCents: 0,
      revenueCents: 88_000,
      grossProfitCents: 33_000,
      actualCostComplete: true,
    },
  });
  assert.equal(closed.status, 'FINAL');
  assert.equal(closed.variance.materialsCostCents, 5_000);
});

test('31-36 RBAC / client safe / Royal Cape', () => {
  assert.equal(canManagePlanEstimates({ roleName: 'technician' }), false);
  assert.equal(canApprovePlanEstimate({ roleName: 'Owner' }), true);
  const safe = projectCustomerSafePlanQuote({
    description: 'Supply cold water points',
    quantity: 3,
    unitPriceCents: 15_000,
    officialNumber: 'QU-9999',
  });
  assertNoPlanEstimateInternalLeak(safe);
  assertRoyalCapePlanEstimateUnchanged({
    quoteId: PLAN_ESTIMATE_ROYAL_CAPE.royalCapeQuoteId,
    totalCents: PLAN_ESTIMATE_ROYAL_CAPE.expectedTotalCents,
    xeroQuoteId: PLAN_ESTIMATE_ROYAL_CAPE.royalCapeXeroQuoteId,
    customerId: PLAN_ESTIMATE_ROYAL_CAPE.canonicalCustomerId,
    jobId: PLAN_ESTIMATE_ROYAL_CAPE.jobId,
    pricingPresentationMode: 'ITEMISED',
  });
});
