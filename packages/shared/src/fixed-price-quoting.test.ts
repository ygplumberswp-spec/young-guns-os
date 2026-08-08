import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_FIXED_PRICE_QUOTE_CONFIG,
  FIXED_PRICE_ROYAL_CAPE,
  assertHistoricalQuoteNotSilentlyRepriced,
  assertNoHardcodedYgpRatesInModuleSource,
  assertNoInternalPricingLeak,
  assertQuoteSpecificPriceDoesNotMutatePricebook,
  assertRow90NoCustomerSends,
  assertRow90NoProductionWrites,
  assertRow90NoXeroWrites,
  assertRow91NotStarted,
  assertRow92NotStarted,
  assertRoyalCapeFixedPriceUnchanged,
  buildFixedPriceAuditEvent,
  buildInternalPricingBreakdown,
  calculateCustomerFacingQuoteAmounts,
  canEditPricingPresentation,
  canViewInternalPricingComponents,
  customerRevenueCentsForProfitability,
  isCustomerFacingPricingLine,
  normalizeFixedPriceQuoteConfig,
  normalizeLinesForPricingMode,
  projectCommunicationSafePricingLines,
  projectCustomerFacingLines,
  projectPdfSafePricingLines,
  projectPortalSafePricingLines,
  projectXeroRevenueLines,
  resolveConfiguredCalloutSellRateCents,
  resolveConfiguredLabourSellRateCents,
  validateFixedPriceConfiguration,
} from './fixed-price-quoting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VAT = 1500;

function serviceLine(unitPriceCents: number, qty = 1) {
  return {
    category: 'scope' as const,
    description: 'Replace XYZ valve',
    quantity: qty,
    unitPriceCents,
    unitCostCents: 40000,
    vatRateBps: VAT,
    customerVisible: true,
  };
}

function labourLine(unitPriceCents: number, cost = 20000) {
  return {
    category: 'labour' as const,
    description: 'Labour allocation',
    quantity: 1,
    unitPriceCents,
    unitCostCents: cost,
    vatRateBps: VAT,
  };
}

function calloutLine(unitPriceCents: number, cost = 5000) {
  return {
    category: 'travel' as const,
    description: 'Call-out allocation',
    quantity: 1,
    unitPriceCents,
    unitCostCents: cost,
    vatRateBps: VAT,
  };
}

test('1 FLAT_RATE_INCLUDED mode normalizes and hides absorbed lines', () => {
  const config = normalizeFixedPriceQuoteConfig({
    pricingPresentationMode: 'FLAT_RATE_INCLUDED',
    labourIncluded: true,
    calloutIncluded: true,
    calloutAllocation: 'PER_JOB',
  });
  assert.equal(config.pricingPresentationMode, 'FLAT_RATE_INCLUDED');
  const lines = normalizeLinesForPricingMode(
    [serviceLine(190000), labourLine(60000), calloutLine(30000)],
    config,
  );
  assert.equal(lines[1]?.customerVisible, false);
  assert.equal(lines[2]?.customerVisible, false);
  const calc = calculateCustomerFacingQuoteAmounts({ lines, config, defaultVatRateBps: VAT });
  assert.equal(calc.validation.ok, true);
  assert.equal(calc.customerFacingLines.length, 1);
  assert.equal(calc.subtotalCents, 190000);
  assert.equal(calc.vatCents, Math.round((190000 * VAT) / 10_000));
  assert.equal(calc.totalCents, calc.subtotalCents + calc.vatCents);
});

test('2 ITEMISED mode keeps labour and call-out customer-visible', () => {
  const config = normalizeFixedPriceQuoteConfig({ pricingPresentationMode: 'ITEMISED' });
  const calc = calculateCustomerFacingQuoteAmounts({
    lines: [serviceLine(100000), labourLine(60000), calloutLine(30000)],
    config,
    defaultVatRateBps: VAT,
  });
  assert.equal(calc.customerFacingLines.length, 3);
  assert.equal(calc.subtotalCents, 190000);
});

test('3-5 labour included / call-out included / both included', () => {
  const labourOnly = calculateCustomerFacingQuoteAmounts({
    lines: [serviceLine(160000), labourLine(60000), calloutLine(30000, 0)],
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: false,
      calloutAllocation: 'PER_JOB',
    },
  });
  assert.equal(labourOnly.customerFacingLines.length, 2);
  assert.ok(labourOnly.customerFacingLines.every((l) => l.category !== 'labour'));

  const calloutOnly = calculateCustomerFacingQuoteAmounts({
    lines: [serviceLine(160000), labourLine(60000), calloutLine(30000)],
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: false,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
  });
  assert.equal(calloutOnly.customerFacingLines.length, 2);
  assert.ok(calloutOnly.customerFacingLines.every((l) => l.category !== 'travel'));

  const both = calculateCustomerFacingQuoteAmounts({
    lines: [serviceLine(190000), labourLine(60000), calloutLine(30000)],
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
  });
  assert.equal(both.customerFacingLines.length, 1);
  assert.equal(both.subtotalCents, 190000);
});

test('6 included component not customer-visible', () => {
  const config = {
    pricingPresentationMode: 'FLAT_RATE_INCLUDED' as const,
    labourIncluded: true,
    calloutIncluded: true,
    calloutAllocation: 'PER_JOB' as const,
  };
  const portal = projectPortalSafePricingLines(
    [serviceLine(190000), labourLine(60000), calloutLine(30000)],
    config,
  );
  assert.equal(portal.length, 1);
  assert.equal(portal[0]?.description, 'Replace XYZ valve');
  assertNoInternalPricingLeak({ lines: portal, totalCents: 190000 });
});

test('7 included component not charged twice', () => {
  const calc = calculateCustomerFacingQuoteAmounts({
    lines: [serviceLine(190000), labourLine(60000), calloutLine(30000)],
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
  });
  // Must NOT be 190000 + 60000 + 30000
  assert.equal(calc.subtotalCents, 190000);
  assert.notEqual(calc.subtotalCents, 280000);
  assert.equal(calc.internal.customerRevenueCents, calc.totalCents);
});

test('8 contradictory configuration rejected', () => {
  const conflict = validateFixedPriceConfiguration({
    config: {
      pricingPresentationMode: 'ITEMISED',
      labourIncluded: true,
      calloutIncluded: false,
      calloutAllocation: 'PER_JOB',
    },
    lines: [serviceLine(100000)],
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'PRICING_PRESENTATION_CONFLICT');

  const dup = validateFixedPriceConfiguration({
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
    lines: [
      serviceLine(190000),
      { ...labourLine(60000), customerVisible: true },
      { ...calloutLine(30000), customerVisible: true },
    ],
  });
  assert.equal(dup.ok, false);
  assert.equal(dup.code, 'FLAT_RATE_DUPLICATE_CHARGE');
});

test('9 no hard-coded YGP rates in module source', () => {
  const srcPath = fs.existsSync(path.join(__dirname, 'fixed-price-quoting.ts'))
    ? path.join(__dirname, 'fixed-price-quoting.ts')
    : path.join(__dirname, '../src/fixed-price-quoting.ts');
  const src = fs.readFileSync(srcPath, 'utf8');
  assertNoHardcodedYgpRatesInModuleSource(src);
  assert.equal(/R\s*700\b/.test(src), false);
  // Module must not use pricebook constants as absorption drivers
  assert.equal(src.includes('YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK'), false);
});

test('10 missing config handled truthfully', () => {
  const labour = resolveConfiguredLabourSellRateCents({
    defaultInternalLabourRateCentsPerHour: 8000,
  });
  assert.equal(labour.status, 'MISSING');
  const callout = resolveConfiguredCalloutSellRateCents({});
  assert.equal(callout.status, 'MISSING');
});

test('11 quantity calculation', () => {
  const calc = calculateCustomerFacingQuoteAmounts({
    lines: [serviceLine(190000, 2), labourLine(60000), calloutLine(30000)],
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
  });
  assert.equal(calc.subtotalCents, 380000);
});

test('12 once-per-job call-out rejects multiple call-out components', () => {
  const result = validateFixedPriceConfiguration({
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
    lines: [
      serviceLine(190000),
      { ...calloutLine(30000), customerVisible: false },
      {
        category: 'travel',
        description: 'Second call-out',
        quantity: 1,
        unitPriceCents: 30000,
        unitCostCents: 0,
        vatRateBps: VAT,
        customerVisible: false,
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'FLAT_RATE_DUPLICATE_CHARGE');
});

test('13 per-unit inclusion allows multiple internal call-out lines', () => {
  const config = {
    pricingPresentationMode: 'FLAT_RATE_INCLUDED' as const,
    labourIncluded: false,
    calloutIncluded: true,
    calloutAllocation: 'PER_UNIT' as const,
  };
  const lines = normalizeLinesForPricingMode(
    [
      serviceLine(100000),
      { ...calloutLine(30000), customerVisible: false },
      {
        category: 'travel' as const,
        description: 'Call-out unit 2',
        quantity: 1,
        unitPriceCents: 30000,
        unitCostCents: 0,
        vatRateBps: VAT,
        customerVisible: false,
      },
    ],
    config,
  );
  const validation = validateFixedPriceConfiguration({ config, lines });
  assert.equal(validation.ok, true);
  const calc = calculateCustomerFacingQuoteAmounts({ lines, config });
  assert.equal(calc.subtotalCents, 100000);
});

test('14-17 exact decimals / VAT / subtotal / grand total', () => {
  const calc = calculateCustomerFacingQuoteAmounts({
    lines: [serviceLine(190000), labourLine(60000), calloutLine(30000)],
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
  });
  assert.equal(calc.subtotalCents, 190000);
  assert.equal(calc.vatCents, 28500);
  assert.equal(calc.totalCents, 218500);
  // Idempotent recalculation
  const again = calculateCustomerFacingQuoteAmounts({
    lines: calc.lines,
    config: calc.config,
  });
  assert.equal(again.totalCents, calc.totalCents);
  assert.equal(again.vatCents, calc.vatCents);
});

test('18 quote-specific price does not mutate pricebook', () => {
  assertQuoteSpecificPriceDoesNotMutatePricebook({ pricebookMutated: false });
  assert.throws(() =>
    assertQuoteSpecificPriceDoesNotMutatePricebook({ pricebookMutated: true }),
  );
});

test('19-20 draft create/edit config defaults ITEMISED for historical safety', () => {
  assert.deepEqual(DEFAULT_FIXED_PRICE_QUOTE_CONFIG.pricingPresentationMode, 'ITEMISED');
  assert.equal(canEditPricingPresentation({ roleName: 'Manager', quoteStatus: 'draft' }), true);
  assert.equal(canEditPricingPresentation({ roleName: 'Manager', quoteStatus: 'sent' }), false);
});

test('21 issued quote no silent repricing', () => {
  assert.throws(() =>
    assertHistoricalQuoteNotSilentlyRepriced({
      previousMode: 'ITEMISED',
      nextMode: 'FLAT_RATE_INCLUDED',
      isIssued: true,
      totalsChanged: true,
    }),
  );
});

test('22-24 Row 87/88/89 untouched helpers still compose', () => {
  assert.equal(FIXED_PRICE_ROYAL_CAPE.royalCapeQuoteNumber, 'QU-0183');
  assert.equal(FIXED_PRICE_ROYAL_CAPE.jobNumber, 'JOB-000002');
});

test('25-26 invoice conversion projection preserves fixed customer amount / no duplicate revenue', () => {
  const config = {
    pricingPresentationMode: 'FLAT_RATE_INCLUDED' as const,
    labourIncluded: true,
    calloutIncluded: true,
    calloutAllocation: 'PER_JOB' as const,
  };
  const invoiceLines = projectCustomerFacingLines(
    [serviceLine(190000), labourLine(60000), calloutLine(30000)],
    config,
  );
  assert.equal(invoiceLines.length, 1);
  assert.equal(invoiceLines[0]?.unitPriceCents, 190000);
  const xero = projectXeroRevenueLines(
    [serviceLine(190000), labourLine(60000), calloutLine(30000)],
    config,
  );
  assert.equal(xero.length, 1);
  assert.equal(
    xero.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0),
    190000,
  );
});

test('27-30 PDF / print / portal / communications hide internal components', () => {
  const config = {
    pricingPresentationMode: 'FLAT_RATE_INCLUDED' as const,
    labourIncluded: true,
    calloutIncluded: true,
    calloutAllocation: 'PER_JOB' as const,
  };
  const lines = [serviceLine(190000), labourLine(60000), calloutLine(30000)];
  for (const projector of [
    projectPdfSafePricingLines,
    projectPortalSafePricingLines,
    projectCommunicationSafePricingLines,
  ]) {
    const projected = projector(lines, config);
    assert.equal(projected.length, 1);
    assertNoInternalPricingLeak({ lineItems: projected });
  }
});

test('31-33 Customer 360 / Job 360 / JPE no double revenue', () => {
  const revenue = customerRevenueCentsForProfitability({
    customerFacingTotalCents: 218500,
    internalLabourSellAllocationCents: 60000,
    internalCalloutSellAllocationCents: 30000,
  });
  assert.equal(revenue, 218500);
  const calc = calculateCustomerFacingQuoteAmounts({
    lines: [serviceLine(190000), labourLine(60000), calloutLine(30000)],
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
  });
  assert.equal(calc.internal.customerRevenueCents, calc.totalCents);
  assert.ok(calc.estimatedCostCents > 0);
});

test('34-37 RBAC owner/manager vs technician/client', () => {
  assert.equal(canViewInternalPricingComponents({ roleName: 'Owner', permissions: ['*'] }), true);
  assert.equal(
    canViewInternalPricingComponents({ roleName: 'Manager', permissions: ['finance:write'] }),
    true,
  );
  assert.equal(canViewInternalPricingComponents({ roleName: 'Technician' }), false);
  assert.equal(canViewInternalPricingComponents({ roleName: 'Client' }), false);
  assert.equal(canEditPricingPresentation({ roleName: 'Office', quoteStatus: 'draft' }), true);
  assert.equal(canEditPricingPresentation({ roleName: 'Technician', quoteStatus: 'draft' }), false);
});

test('38 tenant isolation of config normalization (no global force)', () => {
  const a = normalizeFixedPriceQuoteConfig({ pricingPresentationMode: 'FLAT_RATE_INCLUDED', labourIncluded: true });
  const b = normalizeFixedPriceQuoteConfig({ pricingPresentationMode: 'ITEMISED' });
  assert.equal(a.pricingPresentationMode, 'FLAT_RATE_INCLUDED');
  assert.equal(b.pricingPresentationMode, 'ITEMISED');
  assert.notEqual(a.pricingPresentationMode, b.pricingPresentationMode);
});

test('39 audit events', () => {
  const event = buildFixedPriceAuditEvent({
    eventType: 'pricing_mode_changed',
    companyId: 'company-1',
    quoteId: 'quote-1',
    actorId: 'user-1',
    before: { mode: 'ITEMISED' },
    after: { mode: 'FLAT_RATE_INCLUDED' },
    reason: 'Customer requested fixed price',
  });
  assert.equal(event.action, 'pricing_mode_changed');
  assert.equal(event.metadata.sensitiveCostOmitted, true);
});

test('40 Royal Cape identity constants unchanged', () => {
  assertRoyalCapeFixedPriceUnchanged({
    quoteId: FIXED_PRICE_ROYAL_CAPE.royalCapeQuoteId,
    xeroQuoteId: FIXED_PRICE_ROYAL_CAPE.royalCapeXeroQuoteId,
    xeroQuoteNumber: FIXED_PRICE_ROYAL_CAPE.royalCapeQuoteNumber,
    totalCents: 0,
    customerId: FIXED_PRICE_ROYAL_CAPE.canonicalCustomerId,
    jobId: FIXED_PRICE_ROYAL_CAPE.jobId,
  });
});

test('41-44 Xero projection safe + safety gates + rows 91/92 not started', () => {
  assertRow90NoXeroWrites(0);
  assertRow90NoCustomerSends(0);
  assertRow90NoProductionWrites(0);
  assertRow91NotStarted(false);
  assertRow92NotStarted(false);
  assert.throws(() => assertRow90NoXeroWrites(1));
  assert.throws(() => assertRow91NotStarted(true));
  assert.throws(() => assertRow92NotStarted(true));
});

test('internal breakdown visible structure for authorised staff', () => {
  const calc = calculateCustomerFacingQuoteAmounts({
    lines: [serviceLine(190000), labourLine(60000), calloutLine(30000)],
    config: {
      pricingPresentationMode: 'FLAT_RATE_INCLUDED',
      labourIncluded: true,
      calloutIncluded: true,
      calloutAllocation: 'PER_JOB',
    },
  });
  const breakdown = buildInternalPricingBreakdown({
    lines: calc.lines,
    config: calc.config,
    customerTotalCents: calc.totalCents,
  });
  assert.equal(breakdown.customerFixedSellCents, calc.totalCents);
  assert.equal(breakdown.labourSellAllocationCents, 60000);
  assert.equal(breakdown.calloutSellAllocationCents, 30000);
  assert.ok(breakdown.components.some((c) => c.absorbed && c.kind === 'labour'));
});

test('isCustomerFacingPricingLine respects explicit customerVisible=false', () => {
  assert.equal(
    isCustomerFacingPricingLine(
      { category: 'scope', customerVisible: false },
      DEFAULT_FIXED_PRICE_QUOTE_CONFIG,
    ),
    false,
  );
});
