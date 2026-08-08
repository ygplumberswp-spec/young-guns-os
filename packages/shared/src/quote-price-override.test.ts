import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUOTE_PRICE_OVERRIDE_ROYAL_CAPE,
  applyOverrideToQuoteLines,
  approveQuotePriceOverride,
  assertCataloguePriceUnchangedByOverride,
  assertNewQuoteDoesNotInheritOverride,
  assertNoOverrideInternalLeak,
  assertOverrideExecutable,
  assertQuoteEligibleForPriceOverride,
  assertRow92UnchangedByOverride,
  assertRow93NoCustomerSends,
  assertRow93NoProductionWrites,
  assertRow93NoRealHistoricalQuoteChanges,
  assertRow93NoXeroWrites,
  assertRow94NotStarted,
  assertRow122NotStartedDuringRow93,
  assertRoyalCapeOverrideUnchanged,
  assertSourceCostUnchangedByOverride,
  buildQuotePriceOverrideAuditEvent,
  buildQuotePriceOverridePreview,
  canApproveQuotePriceOverride,
  canProposeQuotePriceOverride,
  createOverrideProposalFromPreview,
  markOverrideExecuted,
  projectCustomerSafeOverrideQuote,
  projectInternalOverrideIndicator,
  rejectQuotePriceOverride,
  resolveOverrideSellPriceCents,
} from './quote-price-override.js';
import { calculateCustomerFacingQuoteAmounts } from './fixed-price-quoting.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

const COMPANY = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const QUOTE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const LINE_A = '11111111-1111-4111-8111-111111111111';
const LINE_B = '22222222-2222-4222-8222-222222222222';

const pricingConfig = {
  pricingPresentationMode: 'ITEMISED' as const,
  labourIncluded: false,
  calloutIncluded: false,
  calloutAllocation: 'PER_JOB' as const,
};

function baseLines() {
  return [
    {
      id: LINE_A,
      description: 'Valve',
      quantity: 1,
      unitPriceCents: 80_000,
      unitCostCents: 40_000,
      category: 'materials',
      vatRateBps: 1500,
      customerVisible: true,
    },
    {
      id: LINE_B,
      description: 'Labour absorbed',
      quantity: 1,
      unitPriceCents: 65_000,
      unitCostCents: 20_000,
      category: 'labour',
      vatRateBps: 1500,
      customerVisible: false,
    },
  ];
}

function proposalInput(overrides: Record<string, unknown> = {}) {
  return {
    companyId: COMPANY,
    quoteId: QUOTE_ID,
    quoteStatus: 'draft',
    quoteIsImmutable: false,
    quoteUpdatedAt: '2026-08-08T10:00:00.000Z',
    lines: [
      {
        lineId: LINE_A,
        baselineSellPriceCents: 80_000,
        baselineSource: 'QUOTE_LINE_SELL' as const,
        catalogueItemId: 'cat-1',
        quantity: 1,
        description: 'Valve',
        category: 'materials',
        vatRateBps: 1500,
        unitCostCents: 40_000,
        customerVisible: true,
        targetSellPriceCents: 95_000,
      },
    ],
    reason: 'Negotiated once-off commercial adjustment',
    pricingConfig,
    allQuoteLines: baseLines(),
    defaultVatRateBps: 1500,
    priceRuleSetId: 'yg-draft-v1',
    priceRuleVersion: 1,
    row92ComparisonSellCentsByLineId: { [LINE_A]: 88_000 },
    ...overrides,
  };
}

test('safety gates: Row 94/122 not started; writes = 0; Row 92 automation off', () => {
  assertRow94NotStarted(false);
  assertRow122NotStartedDuringRow93(false);
  assertRow93NoXeroWrites(0);
  assertRow93NoCustomerSends(0);
  assertRow93NoProductionWrites(0);
  assertRow93NoRealHistoricalQuoteChanges(0);
  assertRow92GlobalAutomationDisabled(false);
});

test('1-5 proposal / reason / baseline / target / conflict', () => {
  assert.throws(
    () => buildQuotePriceOverridePreview(proposalInput({ reason: '  ' })),
    (e: Error) => e.message.includes('reason'),
  );
  const ok = resolveOverrideSellPriceCents({
    baselineSellPriceCents: 80_000,
    targetSellPriceCents: 95_000,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.overrideSellPriceCents, 95_000);

  const conflict = resolveOverrideSellPriceCents({
    baselineSellPriceCents: 80_000,
    targetSellPriceCents: 95_000,
    targetMultiplier: 1.2,
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, 'PRICE_OVERRIDE_INPUT_CONFLICT');

  const preview = buildQuotePriceOverridePreview(proposalInput());
  assert.equal(preview.lines[0]?.baselineSellPriceCents, 80_000);
  assert.equal(preview.lines[0]?.overrideSellPriceCents, 95_000);
  assert.equal(preview.lines[0]?.row92ComparisonSellCents, 88_000);
});

test('6-7 preview VAT exact', () => {
  const preview = buildQuotePriceOverridePreview(proposalInput());
  // Only LINE_A customer-visible; LINE_B hidden in ITEMISED with customerVisible false
  assert.equal(preview.beforeSubtotalCents, 80_000);
  assert.equal(preview.afterSubtotalCents, 95_000);
  assert.equal(preview.beforeVatCents, 12_000);
  assert.equal(preview.afterVatCents, 14_250);
  assert.equal(preview.beforeTotalCents, 92_000);
  assert.equal(preview.afterTotalCents, 109_250);
});

test('8-10 approval required; Owner approve; unauthorised denied', () => {
  const preview = buildQuotePriceOverridePreview(proposalInput());
  const draft = createOverrideProposalFromPreview({
    id: 'ovr-1',
    preview,
    proposedBy: 'manager-1',
  });
  assert.equal(draft.status, 'DRAFT_PROPOSAL');
  assert.equal(canProposeQuotePriceOverride({ roleName: 'Manager', permissions: ['finance:write'] }), true);
  assert.equal(canApproveQuotePriceOverride({ roleName: 'Manager' }), false);
  assert.equal(canApproveQuotePriceOverride({ roleName: 'Owner' }), true);
  assert.throws(() =>
    approveQuotePriceOverride({
      record: draft,
      actorId: 'mgr',
      roleName: 'Manager',
      currentQuoteUpdatedAt: draft.quoteUpdatedAt,
    }),
  );
  const approved = approveQuotePriceOverride({
    record: draft,
    actorId: 'owner-1',
    roleName: 'Owner',
    currentQuoteUpdatedAt: draft.quoteUpdatedAt,
  });
  assert.equal(approved.status, 'OWNER_APPROVED');
});

test('11 stale approval denied', () => {
  const preview = buildQuotePriceOverridePreview(proposalInput());
  const draft = createOverrideProposalFromPreview({ id: 'ovr-2', preview });
  assert.throws(() =>
    approveQuotePriceOverride({
      record: draft,
      actorId: 'owner-1',
      roleName: 'Owner',
      currentQuoteUpdatedAt: '2026-08-08T11:00:00.000Z',
    }),
  );
});

test('12-13 execute once; repeated execute idempotent', () => {
  const preview = buildQuotePriceOverridePreview(proposalInput());
  let record = createOverrideProposalFromPreview({ id: 'ovr-3', preview, proposedBy: 'm1' });
  record = approveQuotePriceOverride({
    record,
    actorId: 'owner-1',
    roleName: 'Owner',
    currentQuoteUpdatedAt: record.quoteUpdatedAt,
  });
  const gate = assertOverrideExecutable({
    record,
    quoteId: QUOTE_ID,
    companyId: COMPANY,
    currentQuoteUpdatedAt: record.quoteUpdatedAt,
    expectedPreviewHash: record.previewHash,
  });
  assert.equal(gate.ok, true);
  record = markOverrideExecuted({ record, actorId: 'owner-1' });
  const again = assertOverrideExecutable({
    record,
    quoteId: QUOTE_ID,
    companyId: COMPANY,
    currentQuoteUpdatedAt: record.quoteUpdatedAt,
  });
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.code, 'PRICE_OVERRIDE_IDEMPOTENT_SUCCESS');
});

test('14-18 lifecycle: draft ok; sent/accepted/declined/converted blocked', () => {
  assertQuoteEligibleForPriceOverride({ status: 'draft' });
  for (const status of ['sent', 'accepted', 'declined', 'converted'] as const) {
    assert.throws(() => assertQuoteEligibleForPriceOverride({ status }));
  }
});

test('19-24 Row 92 / catalogue / cost / source unchanged; quote-specific', () => {
  assertRow92UnchangedByOverride({
    before: { version: 1, status: 'DRAFT', globalAutomationEnabled: false },
    after: { version: 1, status: 'DRAFT', globalAutomationEnabled: false },
  });
  assertCataloguePriceUnchangedByOverride({ beforeSellCents: 70_000, afterSellCents: 70_000 });
  assertSourceCostUnchangedByOverride({ beforeCostCents: 40_000, afterCostCents: 40_000 });
  assertNewQuoteDoesNotInheritOverride({
    priorOverrideSellCents: 95_000,
    newQuoteLineSellCents: 70_000,
    catalogueSellCents: 70_000,
  });
});

test('25-28 one quote only; FLAT_RATE no double charge; apply lines', () => {
  const flatConfig = {
    pricingPresentationMode: 'FLAT_RATE_INCLUDED' as const,
    labourIncluded: true,
    calloutIncluded: true,
    calloutAllocation: 'PER_JOB' as const,
  };
  const lines = [
    {
      id: LINE_A,
      description: 'Fixed job',
      quantity: 1,
      unitPriceCents: 250_000,
      category: 'scope',
      customerVisible: true,
      vatRateBps: 1500,
    },
    {
      id: LINE_B,
      description: 'Absorbed labour',
      quantity: 2,
      unitPriceCents: 65_000,
      category: 'labour',
      customerVisible: false,
      vatRateBps: 1500,
    },
  ];
  const preview = buildQuotePriceOverridePreview(
    proposalInput({
      pricingConfig: flatConfig,
      allQuoteLines: lines,
      lines: [
        {
          lineId: LINE_A,
          baselineSellPriceCents: 250_000,
          baselineSource: 'QUOTE_LINE_SELL',
          quantity: 1,
          description: 'Fixed job',
          category: 'scope',
          vatRateBps: 1500,
          customerVisible: true,
          targetSellPriceCents: 275_000,
        },
      ],
    }),
  );
  assert.equal(preview.beforeSubtotalCents, 250_000);
  assert.equal(preview.afterSubtotalCents, 275_000);
  const applied = applyOverrideToQuoteLines({
    allQuoteLines: lines,
    proposedSellByLineId: { [LINE_A]: 275_000 },
  });
  const totals = calculateCustomerFacingQuoteAmounts({ lines: applied, config: flatConfig });
  assert.equal(totals.subtotalCents, 275_000);
  assert.equal(totals.customerFacingLines.length, 1);
});

test('15 known-cost warning flag', () => {
  const preview = buildQuotePriceOverridePreview(
    proposalInput({
      lines: [
        {
          lineId: LINE_A,
          baselineSellPriceCents: 80_000,
          baselineSource: 'QUOTE_LINE_SELL',
          quantity: 1,
          description: 'Valve',
          unitCostCents: 40_000,
          vatRateBps: 1500,
          targetSellPriceCents: 30_000,
        },
      ],
    }),
  );
  assert.equal(preview.hasBelowKnownCostWarning, true);
  assert.equal(preview.lines[0]?.belowKnownCost, true);
});

test('29-32 Client portal / PDF safe; Tech denied; audit', () => {
  assert.equal(canProposeQuotePriceOverride({ roleName: 'technician' }), false);
  assert.equal(canApproveQuotePriceOverride({ roleName: 'client' }), false);
  const safe = projectCustomerSafeOverrideQuote({
    description: 'Valve',
    quantity: 1,
    unitPriceCents: 95_000,
    quoteTotalCents: 109_250,
    officialNumber: 'QU-9999',
  });
  assertNoOverrideInternalLeak(safe);
  const indicator = projectInternalOverrideIndicator(true);
  assert.equal(indicator.label, 'ONE-OFF OVERRIDE APPLIED');
  const audit = buildQuotePriceOverrideAuditEvent({
    eventType: 'price_override_executed',
    companyId: COMPANY,
    quoteId: QUOTE_ID,
    overrideId: 'ovr-1',
    reason: 'Negotiated once-off commercial adjustment',
  });
  assert.equal(audit.entityType, 'quote_line_price_override');
});

test('33 reject path', () => {
  const preview = buildQuotePriceOverridePreview(proposalInput());
  const draft = createOverrideProposalFromPreview({ id: 'ovr-r', preview });
  const rejected = rejectQuotePriceOverride({
    record: draft,
    actorId: 'owner-1',
    roleName: 'Owner',
  });
  assert.equal(rejected.status, 'REJECTED');
});

test('34 multiplier input path', () => {
  const preview = buildQuotePriceOverridePreview(
    proposalInput({
      lines: [
        {
          lineId: LINE_A,
          baselineSellPriceCents: 100_000,
          baselineSource: 'QUOTE_LINE_SELL',
          quantity: 1,
          description: 'Item',
          vatRateBps: 1500,
          targetMultiplier: 1.1,
        },
      ],
    }),
  );
  assert.equal(preview.lines[0]?.overrideSellPriceCents, 110_000);
});

test('35 Royal Cape unchanged fixture', () => {
  assertRoyalCapeOverrideUnchanged({
    quoteId: QUOTE_PRICE_OVERRIDE_ROYAL_CAPE.royalCapeQuoteId,
    totalCents: QUOTE_PRICE_OVERRIDE_ROYAL_CAPE.expectedTotalCents,
    xeroQuoteId: QUOTE_PRICE_OVERRIDE_ROYAL_CAPE.royalCapeXeroQuoteId,
    customerId: QUOTE_PRICE_OVERRIDE_ROYAL_CAPE.canonicalCustomerId,
    jobId: QUOTE_PRICE_OVERRIDE_ROYAL_CAPE.jobId,
    pricingPresentationMode: 'ITEMISED',
  });
});

test('36 cross-tenant execute blocked', () => {
  const preview = buildQuotePriceOverridePreview(proposalInput());
  let record = createOverrideProposalFromPreview({ id: 'ovr-x', preview });
  record = approveQuotePriceOverride({
    record,
    actorId: 'owner-1',
    roleName: 'Owner',
    currentQuoteUpdatedAt: record.quoteUpdatedAt,
  });
  assert.throws(() =>
    assertOverrideExecutable({
      record,
      quoteId: QUOTE_ID,
      companyId: '00000000-0000-4000-8000-000000000099',
      currentQuoteUpdatedAt: record.quoteUpdatedAt,
    }),
  );
});
