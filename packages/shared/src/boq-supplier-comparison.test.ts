import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOQ_SUPPLIER_COMPARISON_ROYAL_CAPE,
  assertNoBoqSupplierComparisonClientLeak,
  assertRow101SafetyGates,
  assertRow102NotStarted,
  assertRoyalCapeUnchangedForRow101,
  buildSplitPurchaseProposal,
  canManageBoqSupplierComparison,
  resolveBoqSupplierComparison,
  splitPurchaseIdempotencyKey,
  suggestEligibleCheapestSelection,
  type BoqComparisonBoqRow,
  type BoqSupplierOfferInput,
} from './boq-supplier-comparison.js';

const asOf = '2026-08-08T00:00:00.000Z';

function boq(
  partial: Partial<BoqComparisonBoqRow> & Pick<BoqComparisonBoqRow, 'boqImportRowId'>,
): BoqComparisonBoqRow {
  return {
    boqImportId: 'boq-1',
    sheetName: 'Water',
    originalRowNumber: 3,
    itemCode: 'W1',
    description: 'Cold water point',
    unit: 'each',
    quantity: 4,
    rowKind: 'ITEM',
    expectedVatBasis: 'EXCLUSIVE',
    ...partial,
  };
}

function offer(
  partial: Partial<BoqSupplierOfferInput> & Pick<BoqSupplierOfferInput, 'offerKey' | 'supplierName'>,
): BoqSupplierOfferInput {
  return {
    supplierId: 'sup-a',
    supplierDocumentId: 'doc-a',
    supplierDocumentRef: 'SQ-A',
    fileHashSha256: 'a'.repeat(64),
    sourceLineOrder: 1,
    supplierSku: 'W1',
    description: 'Cold water point',
    unit: 'each',
    quantity: 4,
    packSize: null,
    unitPriceCents: 1000,
    vatBasis: 'EXCLUSIVE',
    currency: 'ZAR',
    deliveryCents: 0,
    deliveryKnown: true,
    validTo: '2026-12-31',
    exclusions: null,
    isSubstitute: false,
    matchState: 'EXACT',
    matchConfidenceScore: 80,
    row100ProposalKey: 'p1',
    ...partial,
  };
}

describe('Row 101 BOQ supplier comparison', () => {
  it('1-2 two valid suppliers; cheapest valid identifiable', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1' })],
      offersByBoqRowId: {
        r1: [
          offer({ offerKey: 'a', supplierName: 'A', unitPriceCents: 1200, supplierId: 'sup-a' }),
          offer({ offerKey: 'b', supplierName: 'B', unitPriceCents: 900, supplierId: 'sup-b' }),
        ],
      },
    });
    const row = comparison.rows[0]!;
    assert.equal(row.offers.length, 2);
    assert.equal(row.cheapestEligibleOfferKey, 'b');
    assert.equal(row.cheapestEligibleCostCents, 3600);
  });

  it('3 cheaper substitute NOT silently selected', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1' })],
      offersByBoqRowId: {
        r1: [
          offer({ offerKey: 'exact', supplierName: 'A', unitPriceCents: 1200 }),
          offer({
            offerKey: 'sub',
            supplierName: 'B',
            unitPriceCents: 500,
            isSubstitute: true,
            supplierSku: 'W1-ALT',
            matchState: 'POSSIBLE',
          }),
        ],
      },
    });
    const row = comparison.rows[0]!;
    assert.equal(row.cheapestEligibleOfferKey, 'exact');
    assert.ok(row.offers.find((o) => o.offerKey === 'sub')!.mismatchFlags.includes('SUBSTITUTE'));
    const suggestion = suggestEligibleCheapestSelection(row);
    assert.equal(suggestion?.offerKey, 'exact');
  });

  it('4 missing supplier line', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1' })],
      offersByBoqRowId: {},
    });
    assert.equal(comparison.rows[0]!.missingSupplierOffer, true);
    assert.ok(comparison.rows[0]!.mismatchFlags.includes('MISSING'));
  });

  it('5 duplicate candidate', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1' })],
      offersByBoqRowId: {
        r1: [
          offer({ offerKey: 'a1', supplierName: 'A', supplierSku: 'W1', sourceLineOrder: 1 }),
          offer({ offerKey: 'a2', supplierName: 'A', supplierSku: 'W1', sourceLineOrder: 2, unitPriceCents: 1100 }),
        ],
      },
    });
    assert.ok(comparison.rows[0]!.offers.some((o) => o.mismatchFlags.includes('DUPLICATE')));
  });

  it('6 expired quote', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1' })],
      offersByBoqRowId: {
        r1: [offer({ offerKey: 'e', supplierName: 'A', validTo: '2020-01-01' })],
      },
    });
    assert.ok(comparison.rows[0]!.offers[0]!.mismatchFlags.includes('EXPIRED'));
    assert.equal(comparison.rows[0]!.cheapestEligibleOfferKey, null);
  });

  it('7 VAT mismatch', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1', expectedVatBasis: 'EXCLUSIVE' })],
      offersByBoqRowId: {
        r1: [offer({ offerKey: 'v', supplierName: 'A', vatBasis: 'INCLUSIVE' })],
      },
    });
    assert.ok(comparison.rows[0]!.offers[0]!.mismatchFlags.includes('VAT_MISMATCH'));
  });

  it('8-10 unit/quantity/pack mismatch', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1', unit: 'm', quantity: 10 })],
      offersByBoqRowId: {
        r1: [
          offer({
            offerKey: 'm',
            supplierName: 'A',
            unit: 'each',
            quantity: 4,
            packSize: 3,
          }),
        ],
      },
    });
    const flags = comparison.rows[0]!.offers[0]!.mismatchFlags;
    assert.ok(flags.includes('UNIT_MISMATCH'));
    assert.ok(flags.includes('QUANTITY_MISMATCH'));
    assert.ok(flags.includes('PACK_MISMATCH'));
  });

  it('11-12 delivery difference + exclusion warning', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1' })],
      offersByBoqRowId: {
        r1: [
          offer({
            offerKey: 'd',
            supplierName: 'A',
            deliveryCents: 500,
            deliveryKnown: true,
            exclusions: 'Excludes excavation',
          }),
        ],
      },
    });
    assert.ok(comparison.rows[0]!.offers[0]!.mismatchFlags.includes('EXCLUSION_PRESENT'));
    assert.equal(comparison.rows[0]!.offers[0]!.deliveryCents, 500);
  });

  it('13-16 split proposal totals exact; missing VAT/delivery unknown; edit/review', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [
        boq({ boqImportRowId: 'r1', itemCode: 'W1', quantity: 2 }),
        boq({ boqImportRowId: 'r2', itemCode: 'S1', quantity: 3, description: 'Waste' }),
      ],
      offersByBoqRowId: {
        r1: [
          offer({
            offerKey: 'a',
            supplierName: 'A',
            supplierId: 'sup-a',
            unitPriceCents: 1000,
            quantity: 2,
            deliveryCents: 100,
            deliveryKnown: true,
            vatBasis: 'EXCLUSIVE',
          }),
        ],
        r2: [
          offer({
            offerKey: 'b',
            supplierName: 'B',
            supplierId: 'sup-b',
            supplierSku: 'S1',
            unitPriceCents: 2000,
            quantity: 3,
            deliveryCents: 0,
            deliveryKnown: true,
            vatBasis: 'EXCLUSIVE',
          }),
        ],
      },
    });

    const proposal = buildSplitPurchaseProposal({
      boqImportId: 'boq-1',
      comparison,
      selections: [
        { boqImportRowId: 'r1', offerKey: 'a', quantityProposed: 2 },
        { boqImportRowId: 'r2', offerKey: 'b', quantityProposed: 3 },
      ],
    });

    assert.equal(proposal.lines.length, 2);
    assert.equal(proposal.createsPurchaseOrder, false);
    // r1: 2*1000=2000 ex + VAT 300 + delivery 100 = 2400
    // r2: 3*2000=6000 ex + VAT 900 + delivery 0 = 6900
    assert.equal(proposal.totals.supplierSubtotalCents, 8000);
    assert.equal(proposal.totals.vatCents, 1200);
    assert.equal(proposal.totals.deliveryCents, 100);
    assert.equal(proposal.totals.totalProposedPurchasingCostCents, 9300);
    assert.equal(proposal.totals.incomplete, false);

    const incomplete = buildSplitPurchaseProposal({
      boqImportId: 'boq-1',
      comparison: resolveBoqSupplierComparison({
        boqImportId: 'boq-1',
        asOfIso: asOf,
        boqRows: [boq({ boqImportRowId: 'r1' })],
        offersByBoqRowId: {
          r1: [
            offer({
              offerKey: 'x',
              supplierName: 'A',
              vatBasis: 'UNKNOWN',
              deliveryKnown: false,
              deliveryCents: null,
              unitPriceCents: 1000,
            }),
          ],
        },
      }),
      selections: [{ boqImportRowId: 'r1', offerKey: 'x', quantityProposed: 4 }],
    });
    assert.equal(incomplete.totals.incomplete, true);
    assert.equal(incomplete.totals.totalProposedPurchasingCostCents, null);
    assert.ok(incomplete.totals.missingFields.some((f) => f.startsWith('vat:')));
    assert.ok(incomplete.status === 'DRAFT' || incomplete.status === 'REVIEW_REQUIRED');
  });

  it('17-19 no PO/bill; no quote/catalogue mutation', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1' })],
      offersByBoqRowId: { r1: [offer({ offerKey: 'a', supplierName: 'A' })] },
    });
    const proposal = buildSplitPurchaseProposal({
      boqImportId: 'boq-1',
      comparison,
      selections: [{ boqImportRowId: 'r1', offerKey: 'a', quantityProposed: 4 }],
    });
    assert.equal(proposal.createsPurchaseOrder, false);
    assert.equal(proposal.createsSupplierInvoice, false);
    assert.equal(proposal.createsXeroBill, false);
    assert.equal(proposal.mutatesCatalogueOrQuotePrice, false);
    assert.equal(proposal.mutatesBoqSource, false);
  });

  it('20-21 Row99 immutable + Row100 evidence preserved', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1' })],
      offersByBoqRowId: {
        r1: [offer({ offerKey: 'a', supplierName: 'A', row100ProposalKey: 'row100-p1' })],
      },
    });
    assert.equal(comparison.row99Immutable, true);
    assert.equal(comparison.row100EvidencePreserved, true);
    assert.equal(comparison.rows[0]!.offers[0]!.row100ProposalKey, 'row100-p1');
  });

  it('22-23 tenant/RBAC Client/Tech denied', () => {
    assert.equal(canManageBoqSupplierComparison({ roleName: 'owner' }), true);
    assert.equal(canManageBoqSupplierComparison({ roleName: 'client' }), false);
    assert.equal(canManageBoqSupplierComparison({ roleName: 'technician' }), false);
    assert.throws(() => assertNoBoqSupplierComparisonClientLeak({ unitPriceCents: 1 }));
  });

  it('24-26 audit / idempotency / cleanup safety', () => {
    const comparison = resolveBoqSupplierComparison({
      boqImportId: 'boq-1',
      asOfIso: asOf,
      boqRows: [boq({ boqImportRowId: 'r1' })],
      offersByBoqRowId: { r1: [offer({ offerKey: 'a', supplierName: 'A' })] },
    });
    assert.ok(comparison.auraNarrativeFacts.some((f) => f.includes('DRAFT')));
    const k1 = splitPurchaseIdempotencyKey({
      boqImportId: 'boq-1',
      selectionKeys: ['r2:b', 'r1:a'],
    });
    const k2 = splitPurchaseIdempotencyKey({
      boqImportId: 'boq-1',
      selectionKeys: ['r1:a', 'r2:b'],
    });
    assert.equal(k1, k2);
    const g = assertRow101SafetyGates({ row92AutomationEnabled: false });
    assert.equal(g.purchaseOrdersCreated, 0);
    assert.throws(() => assertRow102NotStarted(true));
    assertRoyalCapeUnchangedForRow101({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
    assert.equal(BOQ_SUPPLIER_COMPARISON_ROYAL_CAPE.expectedTotalCents, 4_272_250);
  });
});
