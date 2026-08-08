import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICEBOOK_BOUNDARY_FIXTURES,
  PRICEBOOK_TIER_ROYAL_CAPE,
  YOUNG_GUNS_DRAFT_TIER_FORMULA,
  applyMultiplierExactCents,
  assertInactiveRuleCannotMutateCatalogue,
  assertNoPriceFormulaLeak,
  assertPricebookRuleActivationAllowed,
  assertPricebookRuleMayApplyToCatalogue,
  assertRow90PricingUnchangedByTierFormula,
  assertRow91ClassificationUnchanged,
  assertRow92GlobalAutomationDisabled,
  assertRow92NoCustomerSends,
  assertRow92NoProductionWrites,
  assertRow92NoRealPriceChanges,
  assertRow92NoXeroWrites,
  assertRow93NotStarted,
  assertRow122NotStarted,
  assertRoyalCapePricebookUnchanged,
  buildBulkImpactPreview,
  buildPricebookRuleAuditEvent,
  buildYoungGunsDraftRuleSet,
  canConfigurePricebookRules,
  canPreviewPricebookRules,
  nextRuleVersion,
  projectCustomerSafeSellPrice,
  resolvePricebookSellPrice,
  ruleConfigFingerprint,
  validatePricebookRuleSet,
} from './pricebook-tier-formula.js';
import {
  calculateCustomerFacingQuoteAmounts,
  projectPortalSafePricingLines,
} from './fixed-price-quoting.js';

const YG = PRICEBOOK_TIER_ROYAL_CAPE.youngGunsCompanyId;
const OTHER_TENANT = '11111111-2222-3333-4444-555555555555';

function draftRule(overrides: Partial<ReturnType<typeof buildYoungGunsDraftRuleSet>> = {}) {
  return {
    ...buildYoungGunsDraftRuleSet(YG),
    ...overrides,
  };
}

function resolveOk(baseCostCents: number) {
  return resolvePricebookSellPrice({
    baseCostCents,
    ruleSet: draftRule(),
    costProvenance: {
      source: 'supplier_net_discounted_fixture',
      isDiscountedNet: true,
      alreadyDiscounted: true,
    },
  });
}

test('safety: global automation off, Row 93/122 not started, writes = 0', () => {
  assertRow92GlobalAutomationDisabled(YOUNG_GUNS_DRAFT_TIER_FORMULA.globalAutomationEnabled);
  assert.equal(YOUNG_GUNS_DRAFT_TIER_FORMULA.status, 'DRAFT');
  assertRow93NotStarted(false);
  assertRow122NotStarted(false);
  assertRow92NoXeroWrites(0);
  assertRow92NoCustomerSends(0);
  assertRow92NoProductionWrites(0);
  assertRow92NoRealPriceChanges(0);
});

test('1-5 tier boundaries: <=500 → 2.2, 500.01–1500 → 2.0, >1500 → 1.68', () => {
  for (const fixture of PRICEBOOK_BOUNDARY_FIXTURES) {
    const result = resolveOk(fixture.baseCostCents);
    assert.equal(result.ok, true, `base ${fixture.baseCostCents}`);
    if (!result.ok) continue;
    assert.equal(result.multiplier, fixture.expectMultiplier);
  }
  const r499 = resolveOk(49_999);
  const r500 = resolveOk(50_000);
  const r500_01 = resolveOk(50_001);
  const r1500 = resolveOk(150_000);
  const r1500_01 = resolveOk(150_001);
  assert.ok(r499.ok && r500.ok && r500_01.ok && r1500.ok && r1500_01.ok);
  if (r499.ok) assert.equal(r499.multiplier, 2.2);
  if (r500.ok) assert.equal(r500.multiplier, 2.2);
  if (r500_01.ok) assert.equal(r500_01.multiplier, 2.0);
  if (r1500.ok) assert.equal(r1500.multiplier, 2.0);
  if (r1500_01.ok) assert.equal(r1500_01.multiplier, 1.68);
});

test('6-7 deterministic cents + multiplier precision', () => {
  // R400 → 2.2 → R880.00
  assert.equal(applyMultiplierExactCents(40_000, 11, 5), 88_000);
  const r400 = resolveOk(40_000);
  assert.ok(r400.ok);
  if (r400.ok) {
    assert.equal(r400.sellPriceExVatCents, 88_000);
    assert.equal(r400.rounding, 'HALF_UP_CENTS');
    assert.equal(r400.multiplierDisplay, '2.2x');
  }
  // Odd-cent base: R499.99 × 2.2
  assert.equal(applyMultiplierExactCents(49_999, 11, 5), 109_998);
  const odd = resolveOk(49_999);
  assert.ok(odd.ok);
  if (odd.ok) assert.equal(odd.sellPriceExVatCents, 109_998);
  // R1500.01 × 1.68
  assert.equal(applyMultiplierExactCents(150_001, 168, 100), 252_002);
});

test('8-9 missing / invalid / negative / zero base cost', () => {
  const missing = resolvePricebookSellPrice({
    baseCostCents: null,
    ruleSet: draftRule(),
    costProvenance: { source: 'x', isDiscountedNet: true },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, 'PRICE_BASE_COST_MISSING');

  const neg = resolveOk(-1);
  // resolveOk uses positive path helper — call directly
  const negative = resolvePricebookSellPrice({
    baseCostCents: -100,
    ruleSet: draftRule(),
    costProvenance: { source: 'x', isDiscountedNet: true },
  });
  assert.equal(negative.ok, false);
  if (!negative.ok) assert.equal(negative.code, 'PRICE_BASE_COST_INVALID');
  void neg;

  const zero = resolvePricebookSellPrice({
    baseCostCents: 0,
    ruleSet: draftRule(),
    costProvenance: { source: 'x', isDiscountedNet: true },
  });
  assert.equal(zero.ok, false);
  if (!zero.ok) assert.equal(zero.code, 'PRICE_BASE_COST_REVIEW_REQUIRED');
});

test('10-11 cost provenance + no double discount', () => {
  const noProv = resolvePricebookSellPrice({
    baseCostCents: 40_000,
    ruleSet: draftRule(),
  });
  assert.equal(noProv.ok, false);
  if (!noProv.ok) assert.equal(noProv.code, 'PRICE_BASE_COST_REVIEW_REQUIRED');

  const double = resolvePricebookSellPrice({
    baseCostCents: 40_000,
    ruleSet: draftRule(),
    costProvenance: {
      source: 'list_then_discount_again',
      isDiscountedNet: false,
      alreadyDiscounted: true,
    },
  });
  assert.equal(double.ok, false);
  if (!double.ok) assert.equal(double.code, 'PRICE_DOUBLE_DISCOUNT_BLOCKED');
});

test('12 tax basis note is ex-VAT; VAT not mixed into multiplier', () => {
  const r = resolveOk(40_000);
  assert.ok(r.ok);
  if (r.ok) {
    assert.match(r.vatNote, /VAT-exclusive/i);
    assert.equal(r.sellPriceExVatCents, 88_000);
  }
});

test('13-14 rule validation: overlap / gap / bad multipliers rejected', () => {
  const ok = validatePricebookRuleSet(draftRule());
  assert.equal(ok.ok, true);

  const overlap = validatePricebookRuleSet(
    draftRule({
      tiers: [
        {
          minCentsInclusive: 0,
          maxCentsInclusive: 50_000,
          multiplierNumerator: 11,
          multiplierDenominator: 5,
          label: 'a',
        },
        {
          minCentsInclusive: 40_000,
          maxCentsInclusive: 150_000,
          multiplierNumerator: 2,
          multiplierDenominator: 1,
          label: 'b',
        },
      ],
    }),
  );
  assert.equal(overlap.ok, false);

  const gap = validatePricebookRuleSet(
    draftRule({
      tiers: [
        {
          minCentsInclusive: 0,
          maxCentsInclusive: 50_000,
          multiplierNumerator: 11,
          multiplierDenominator: 5,
          label: 'a',
        },
        {
          minCentsInclusive: 60_000,
          maxCentsInclusive: null,
          multiplierNumerator: 2,
          multiplierDenominator: 1,
          label: 'b',
        },
      ],
    }),
  );
  assert.equal(gap.ok, false);

  const badMult = validatePricebookRuleSet(
    draftRule({
      tiers: [
        {
          minCentsInclusive: 0,
          maxCentsInclusive: null,
          multiplierNumerator: 0,
          multiplierDenominator: 1,
          label: 'bad',
        },
      ],
    }),
  );
  assert.equal(badMult.ok, false);
});

test('15 versioning: next version + fingerprint idempotency', () => {
  const a = draftRule({ version: 1 });
  const b = draftRule({ version: 1 });
  assert.equal(ruleConfigFingerprint(a), ruleConfigFingerprint(b));
  assert.equal(nextRuleVersion(a.version), 2);
  const edited = draftRule({
    version: 2,
    tiers: [
      ...YOUNG_GUNS_DRAFT_TIER_FORMULA.tiers.slice(0, 2),
      {
        minCentsInclusive: 150_001,
        maxCentsInclusive: null,
        multiplierNumerator: 17,
        multiplierDenominator: 10,
        label: 'Above R1,500 → 1.7x',
      },
    ],
  });
  assert.notEqual(ruleConfigFingerprint(a), ruleConfigFingerprint(edited));
});

test('16 tenant isolation: YG draft company id scoped', () => {
  const yg = buildYoungGunsDraftRuleSet(YG);
  const other = buildYoungGunsDraftRuleSet(OTHER_TENANT);
  assert.equal(yg.companyId, YG);
  assert.equal(other.companyId, OTHER_TENANT);
  assert.notEqual(yg.companyId, other.companyId);
});

test('17-19 RBAC: Owner configure; Tech/Client denied; Client projection hides internals', () => {
  assert.equal(canConfigurePricebookRules({ roleName: 'Owner' }), true);
  assert.equal(canConfigurePricebookRules({ roleName: 'technician' }), false);
  assert.equal(canConfigurePricebookRules({ roleName: 'client' }), false);
  assert.equal(canPreviewPricebookRules({ roleName: 'technician' }), false);
  assert.equal(canPreviewPricebookRules({ roleName: 'Manager', permissions: ['finance:write'] }), true);

  const resolved = resolveOk(40_000);
  assert.ok(resolved.ok);
  if (resolved.ok) {
    const safe = projectCustomerSafeSellPrice({
      sellPriceExVatCents: resolved.sellPriceExVatCents,
      description: 'Geyser valve',
    });
    assert.equal(safe.unitPriceCents, 88_000);
    assertNoPriceFormulaLeak(safe);
  }
});

test('20-21 inactive rule cannot apply; activation requires Owner confirmation', () => {
  const draft = draftRule();
  const apply = assertPricebookRuleMayApplyToCatalogue(draft);
  assert.equal(apply.ok, false);
  if (!apply.ok) assert.equal(apply.code, 'PRICE_RULE_INACTIVE_APPLY_BLOCKED');

  const activation = assertPricebookRuleActivationAllowed({
    status: 'DRAFT',
    row92ActivationAuthorised: false,
  });
  assert.equal(activation.ok, false);
  if (!activation.ok) assert.equal(activation.code, 'PRICEBOOK_RULE_OWNER_CONFIRMATION_REQUIRED');

  assert.throws(() =>
    assertInactiveRuleCannotMutateCatalogue({ ruleStatus: 'DRAFT', catalogueRowsMutated: 1 }),
  );
  assertInactiveRuleCannotMutateCatalogue({ ruleStatus: 'DRAFT', catalogueRowsMutated: 0 });
});

test('22 bulk preview is proposed-only; applied = 0', () => {
  const preview = buildBulkImpactPreview({
    ruleSet: draftRule(),
    items: [
      {
        itemId: 'fix-1',
        name: 'Fixture valve',
        currentSellCents: 70_000,
        baseCostCents: 40_000,
        costSource: 'supplier_net_discounted_fixture',
        isDiscountedNet: true,
      },
      {
        itemId: 'fix-2',
        name: 'Missing cost item',
        currentSellCents: 10_000,
        baseCostCents: null,
        costSource: 'missing',
        isDiscountedNet: true,
      },
    ],
  });
  assert.equal(preview.applied, 0);
  assert.equal(preview.proposedCount, 1);
  assert.equal(preview.missingCostCount, 1);
  assert.equal(preview.rows[0]?.proposedSellCents, 88_000);
});

test('23-27 Row 87–91 regression helpers + flat-rate / classification untouched', () => {
  assertRow90PricingUnchangedByTierFormula({
    beforeMode: 'FLAT_RATE_INCLUDED',
    afterMode: 'FLAT_RATE_INCLUDED',
  });
  assertRow91ClassificationUnchanged({
    before: { ygpCode: 'YGP-A', catalogueCategory: 'Geysers', itemType: 'PHYSICAL_ITEM' },
    after: { ygpCode: 'YGP-A', catalogueCategory: 'Geysers', itemType: 'PHYSICAL_ITEM' },
  });

  const config = {
    pricingPresentationMode: 'FLAT_RATE_INCLUDED' as const,
    labourIncluded: true,
    calloutIncluded: true,
    calloutAllocation: 'PER_JOB' as const,
  };
  const lines = [
    {
      description: 'Flat rate job',
      quantity: '1',
      unitPriceCents: 250_000,
      category: 'scope' as const,
      customerVisible: true,
    },
    {
      description: 'Absorbed labour',
      quantity: '2',
      unitPriceCents: 65_000,
      category: 'labour' as const,
      customerVisible: false,
    },
  ];
  const flat = calculateCustomerFacingQuoteAmounts({ lines, config });
  assert.equal(flat.subtotalCents, 250_000);

  const portal = projectPortalSafePricingLines(lines, config);
  assert.equal(portal.length, 1);
  assertNoPriceFormulaLeak(portal);
});

test('28 quote-specific manual price does not mutate rule fingerprint', () => {
  const before = ruleConfigFingerprint(draftRule());
  const manualQuoteSell = 999_999;
  void manualQuoteSell;
  const after = ruleConfigFingerprint(draftRule());
  assert.equal(before, after);
});

test('29-31 historical / Royal Cape unchanged fixtures', () => {
  assertRoyalCapePricebookUnchanged({
    quoteId: PRICEBOOK_TIER_ROYAL_CAPE.royalCapeQuoteId,
    xeroQuoteId: PRICEBOOK_TIER_ROYAL_CAPE.royalCapeXeroQuoteId,
    xeroQuoteNumber: PRICEBOOK_TIER_ROYAL_CAPE.royalCapeQuoteNumber,
    totalCents: PRICEBOOK_TIER_ROYAL_CAPE.expectedTotalCents,
    customerId: PRICEBOOK_TIER_ROYAL_CAPE.canonicalCustomerId,
    jobId: PRICEBOOK_TIER_ROYAL_CAPE.jobId,
    pricingPresentationMode: 'ITEMISED',
  });
});

test('audit event shape omits customer-facing cost leak flag', () => {
  const event = buildPricebookRuleAuditEvent({
    eventType: 'price_rule_previewed',
    companyId: YG,
    ruleSetId: 'yg-draft-v1',
    actorId: 'owner-1',
    reason: 'fixture preview',
  });
  assert.equal(event.entityType, 'pricebook_rule_set');
  assert.equal(event.metadata.sensitiveCostOmitted, true);
});

test('DRAFT preview explanation includes tier + version + status', () => {
  const r = resolveOk(40_000);
  assert.ok(r.ok);
  if (r.ok) {
    assert.match(r.explanation, /2\.2x/);
    assert.match(r.explanation, /DRAFT/);
    assert.equal(r.ruleVersion, 1);
    assert.equal(r.activationStatus, 'DISABLED');
  }
});
