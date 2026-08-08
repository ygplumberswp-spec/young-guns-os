import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVED_CATALOGUE_PRODUCT_CATEGORIES,
  QUOTE_LINE_CATEGORY_OTHER_ROOT_CAUSE,
  YGP_CATALOGUE_ROYAL_CAPE,
  assertCataloguePriceUnchanged,
  assertNoInternalCatalogueLeak,
  assertRow90PricingPreserved,
  assertRow91NoCustomerSends,
  assertRow91NoProductionWrites,
  assertRow91NoXeroWrites,
  assertRoyalCapeCatalogueUnchanged,
  assertYgpCodeNotRecycled,
  buildCatalogueAuditEvent,
  canAdministerCatalogue,
  canSearchCatalogue,
  catalogueMatchesFilters,
  detectCatalogueDuplicate,
  extractImportedCatalogueCategoryFromDescription,
  isStockableForItemType,
  isValidYgpCodeFormat,
  mapItemTypeToQuoteLineCategory,
  planDeterministicClassificationApply,
  projectCustomerSafeCatalogueFields,
  resolveCatalogueItemType,
  resolveClassificationStatus,
  resolveYgpCodeAssignment,
  suggestCategoryFromDescriptionOnly,
} from './ygp-catalogue-classification.js';
import {
  assertRow92NotStarted,
  calculateCustomerFacingQuoteAmounts,
  projectPortalSafePricingLines,
} from './fixed-price-quoting.js';

test('1-3 stable YGP code uniqueness / format', () => {
  assert.equal(isValidYgpCodeFormat('YGP-GEY-150-001'), true);
  assert.equal(isValidYgpCodeFormat('LAB-HOURLY'), true);
  assert.equal(isValidYgpCodeFormat('random'), false);
  const a = resolveYgpCodeAssignment({ sku: 'YGP-PIP-110' });
  assert.equal(a.status, 'FOUND');
  if (a.status === 'FOUND') assert.equal(a.ygpCode, 'YGP-PIP-110');
});

test('4-6 source / Xero / supplier identity fields remain distinct in duplicate checks', () => {
  const candidates = [
    {
      id: '1',
      sku: 'SKU-1',
      ygpCode: 'YGP-A',
      sourceExternalId: 'ext-1',
      xeroItemId: 'xero-guid-1',
      xeroItemCode: 'XERO-A',
      supplierSku: 'SUP-1',
    },
  ];
  assert.equal(
    detectCatalogueDuplicate({ candidates, sourceExternalId: 'ext-1' }).kind,
    'MATCH',
  );
  assert.equal(detectCatalogueDuplicate({ candidates, xeroItemId: 'xero-guid-1' }).kind, 'MATCH');
  assert.equal(detectCatalogueDuplicate({ candidates, supplierSku: 'SUP-1' }).kind, 'MATCH');
  assert.equal(detectCatalogueDuplicate({ candidates, ygpCode: 'YGP-A' }).kind, 'MATCH');
});

test('7-10 physical / service / labour / call-out types', () => {
  assert.equal(resolveCatalogueItemType({ sku: 'PVC-110', isStockable: true }).itemType, 'PHYSICAL_ITEM');
  assert.equal(resolveCatalogueItemType({ sku: 'SRV-GEYSER-INSTALL' }).itemType, 'SERVICE');
  assert.equal(resolveCatalogueItemType({ sku: 'LAB-HOURLY' }).itemType, 'LABOUR');
  assert.equal(resolveCatalogueItemType({ sku: 'LAB-CALLOUT' }).itemType, 'CALL_OUT');
  assert.equal(isStockableForItemType('LABOUR'), false);
  assert.equal(isStockableForItemType('PHYSICAL_ITEM'), true);
  assert.equal(mapItemTypeToQuoteLineCategory('CALL_OUT'), 'travel');
  assert.equal(mapItemTypeToQuoteLineCategory('SERVICE'), 'scope');
});

test('11-13 category assignment / uncategorised / review', () => {
  assert.ok(APPROVED_CATALOGUE_PRODUCT_CATEGORIES.includes('Geysers'));
  assert.equal(
    extractImportedCatalogueCategoryFromDescription('Pipe | Category: Pipes | HISTORICAL_PRICE_BOOK'),
    'Pipes',
  );
  assert.equal(
    resolveClassificationStatus({ catalogueCategory: null, itemType: 'OTHER' }),
    'UNCATEGORISED',
  );
  assert.equal(
    resolveClassificationStatus({ catalogueCategory: 'Geysers', itemType: 'PHYSICAL_ITEM' }),
    'CLASSIFIED',
  );
  const fuzzy = suggestCategoryFromDescriptionOnly('valve for geyser');
  assert.equal(fuzzy.status, 'REVIEW_REQUIRED');
  assert.equal(fuzzy.suggestion, null);
});

test('14 no description-only auto classification', () => {
  const plan = planDeterministicClassificationApply({
    id: '1',
    sku: 'MISC-99',
    description: 'some valve and pipe work',
    sellPriceCents: 1000,
  });
  assert.equal(plan.patch.catalogueCategory, undefined);
});

test('15 duplicate catalogue prevention', () => {
  const dup = detectCatalogueDuplicate({
    candidates: [
      { id: 'a', sku: 'X', ygpCode: 'YGP-1' },
      { id: 'b', sku: 'Y', ygpCode: 'YGP-1' },
    ],
    ygpCode: 'YGP-1',
  });
  assert.equal(dup.kind, 'AMBIGUOUS');
});

test('16-19 code / description / category / type filter', () => {
  const item = {
    ygpCode: 'YGP-GEY-150',
    sku: 'YGP-GEY-150',
    name: '150L geyser',
    description: 'Supply geyser',
    catalogueCategory: 'Geysers',
    itemType: 'PHYSICAL_ITEM',
  };
  assert.equal(catalogueMatchesFilters(item, { query: 'ygp-gey' }), true);
  assert.equal(catalogueMatchesFilters(item, { query: '150L' }), true);
  assert.equal(catalogueMatchesFilters(item, { category: 'Geysers' }), true);
  assert.equal(catalogueMatchesFilters(item, { itemType: 'SERVICE' }), false);
});

test('20-22 quote selection / snapshot / issued quote semantics', () => {
  // Classification must not rewrite issued commercial lines — identity is additive snapshot only.
  const safe = projectCustomerSafeCatalogueFields({
    description: 'Supply and install 150L geyser',
    ygpCode: 'YGP-GEY-150-001',
    showCodeOnDocument: false,
  });
  assert.equal(safe.description, 'Supply and install 150L geyser');
  assert.equal(safe.itemCode, null);
  assertYgpCodeNotRecycled({ code: 'YGP-1', previouslyUsedOnDifferentItem: false });
  assert.throws(() =>
    assertYgpCodeNotRecycled({ code: 'YGP-1', previouslyUsedOnDifferentItem: true }),
  );
});

test('23-28 invoice / Row87-90 / absorbed labour / PDF portal', () => {
  assertRow90PricingPreserved({
    before: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
    after: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
  });
  const calc = calculateCustomerFacingQuoteAmounts({
    lines: [
      {
        category: 'scope',
        description: 'Service',
        quantity: 1,
        unitPriceCents: 190000,
        vatRateBps: 1500,
      },
      {
        category: 'labour',
        description: 'Labour',
        quantity: 1,
        unitPriceCents: 60000,
        vatRateBps: 1500,
      },
    ],
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: false,
      calloutAllocation: 'PER_JOB',
    },
  });
  assert.equal(calc.subtotalCents, 190000);
  const portal = projectPortalSafePricingLines(calc.lines, calc.config);
  assert.equal(portal.length, 1);
  assertNoInternalCatalogueLeak({
    lines: portal.map((l) => ({ description: l.description, unitPriceCents: l.unitPriceCents })),
  });
});

test('29-32 Client portal scope + technician restriction + owner permissions', () => {
  assert.equal(canAdministerCatalogue({ roleName: 'Owner', permissions: ['*'] }), true);
  assert.equal(canAdministerCatalogue({ roleName: 'Office', permissions: ['finance:write'] }), true);
  assert.equal(canAdministerCatalogue({ roleName: 'Technician' }), false);
  assert.equal(canSearchCatalogue({ roleName: 'Client' }), false);
  assert.equal(canSearchCatalogue({ roleName: 'Technician', permissions: ['inventory:read'] }), true);
});

test('33 audit', () => {
  const event = buildCatalogueAuditEvent({
    eventType: 'catalogue_category_changed',
    companyId: 'c1',
    catalogueItemId: 'i1',
    actorId: 'u1',
    before: 'UNCATEGORISED',
    after: 'Geysers',
  });
  assert.equal(event.action, 'catalogue_category_changed');
});

test('34 idempotency of deterministic plan', () => {
  const row = {
    id: '1',
    sku: 'LAB-HOURLY',
    description: 'Labour | Category: Labour | HISTORICAL_PRICE_BOOK — catalogue only',
    sellPriceCents: 65000,
  };
  const first = planDeterministicClassificationApply(row);
  assert.equal(first.action, 'update');
  const second = planDeterministicClassificationApply({
    ...row,
    ygpCode: first.patch.ygpCode ?? 'LAB-HOURLY',
    catalogueCategory: first.patch.catalogueCategory ?? 'Labour',
    itemType: first.patch.itemType ?? 'LABOUR',
    classificationStatus: first.patch.classificationStatus ?? 'CLASSIFIED',
    isStockable: false,
  });
  assert.equal(second.action, 'unchanged');
  assertCataloguePriceUnchanged({
    beforeSellPriceCents: 65000,
    afterSellPriceCents: first.sellPriceCents,
  });
});

test('35 Royal Cape unchanged constants', () => {
  assertRoyalCapeCatalogueUnchanged({
    quoteId: YGP_CATALOGUE_ROYAL_CAPE.royalCapeQuoteId,
    xeroQuoteId: YGP_CATALOGUE_ROYAL_CAPE.royalCapeXeroQuoteId,
    xeroQuoteNumber: YGP_CATALOGUE_ROYAL_CAPE.royalCapeQuoteNumber,
    totalCents: YGP_CATALOGUE_ROYAL_CAPE.expectedTotalCents,
    customerId: YGP_CATALOGUE_ROYAL_CAPE.canonicalCustomerId,
    jobId: YGP_CATALOGUE_ROYAL_CAPE.jobId,
    pricingPresentationMode: 'ITEMISED',
  });
});

test('36-40 prices unchanged / Row 92 not started / safety gates', () => {
  assert.throws(() =>
    assertCataloguePriceUnchanged({ beforeSellPriceCents: 100, afterSellPriceCents: 200 }),
  );
  assertRow92NotStarted(false);
  assert.throws(() => assertRow92NotStarted(true));
  assertRow91NoXeroWrites(0);
  assertRow91NoCustomerSends(0);
  assertRow91NoProductionWrites(0);
  assert.ok(QUOTE_LINE_CATEGORY_OTHER_ROOT_CAUSE.summary.includes('quote_line_items.category'));
});

test('cross-tenant isolation: same code allowed in separate candidate sets', () => {
  const tenantA = detectCatalogueDuplicate({
    candidates: [{ id: 'a1', sku: 'YGP-1', ygpCode: 'YGP-1' }],
    ygpCode: 'YGP-1',
  });
  const tenantBEmpty = detectCatalogueDuplicate({
    candidates: [],
    ygpCode: 'YGP-1',
  });
  assert.equal(tenantA.kind, 'MATCH');
  assert.equal(tenantBEmpty.kind, 'NONE');
});

test('CODE_REVIEW_REQUIRED when sku is not a YGP-style code', () => {
  const result = resolveYgpCodeAssignment({ sku: 'random-pipe-99' });
  assert.equal(result.status, 'CODE_REVIEW_REQUIRED');
});
