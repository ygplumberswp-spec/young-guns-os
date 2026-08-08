import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUPPLIER_QUOTE_BOQ_MATCH_ROYAL_CAPE,
  assertNoSupplierBoqMatchClientLeak,
  assertRow100SafetyGates,
  assertRow101NotStarted,
  assertRoyalCapeUnchangedForRow100,
  canManageSupplierBoqMatching,
  confirmSupplierBoqMatch,
  rejectSupplierBoqMatch,
  resolveSupplierBoqMatches,
  supplierMatchIdempotencyKey,
  type BoqMatchTargetRow,
  type SupplierQuoteLineInput,
} from './supplier-quote-boq-match.js';

const provenance = {
  supplierDocumentId: 'doc-1',
  fileHashSha256: 'a'.repeat(64),
  revisionLabel: 'Rev A',
  supplierId: 'sup-1',
  supplierName: 'Fixture Supplies',
  originalFilename: 'fixture-quote.pdf',
};

function boq(partial: Partial<BoqMatchTargetRow> & Pick<BoqMatchTargetRow, 'boqImportRowId' | 'itemCode'>): BoqMatchTargetRow {
  return {
    boqImportId: 'boq-imp-1',
    sheetName: 'Water',
    sheetOrder: 0,
    originalRowNumber: 3,
    originalRowOrder: 2,
    description: 'Cold water point',
    unit: 'each',
    quantity: 4,
    rowKind: 'ITEM',
    ...partial,
  };
}

function line(
  partial: Partial<SupplierQuoteLineInput> & Pick<SupplierQuoteLineInput, 'clientKey' | 'sourceLineOrder'>,
): SupplierQuoteLineInput {
  return {
    supplierSku: 'W1',
    description: 'Cold water point',
    unit: 'each',
    quantity: 4,
    vatBasis: 'EXCLUSIVE',
    currency: 'ZAR',
    unitPriceCents: 12500,
    ...partial,
  };
}

describe('Row 100 supplier PDF → BOQ matching', () => {
  it('1 exact code match', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1' })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1, supplierSku: 'W1' })],
    });
    const p = r.proposals.find((x) => x.matchState !== 'UNMATCHED');
    assert.ok(p);
    assert.ok(p!.signalsUsed.includes('EXACT_SUPPLIER_SKU'));
    assert.ok(p!.matchState === 'EXACT' || p!.matchState === 'HIGH_CONFIDENCE');
  });

  it('2 code + description + unit match', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1', description: 'Cold water point', unit: 'each' })],
      supplierLines: [
        line({
          clientKey: 's1',
          sourceLineOrder: 1,
          supplierSku: 'W1',
          description: 'Cold water point',
          unit: 'ea',
        }),
      ],
    });
    const p = r.proposals.find((x) => x.boqImportRowId === 'r1' && x.matchState !== 'UNMATCHED');
    assert.ok(p!.signalsUsed.includes('EXACT_SUPPLIER_SKU'));
    assert.ok(p!.signalsUsed.includes('NORMALIZED_DESCRIPTION'));
    assert.ok(p!.signalsUsed.includes('COMPATIBLE_UNIT'));
  });

  it('3 description-only ambiguous', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'ZZ', description: 'Special valve assembly' })],
      supplierLines: [
        line({
          clientKey: 's1',
          sourceLineOrder: 1,
          supplierSku: null,
          description: 'Special valve assembly',
          unit: null,
          quantity: null,
        }),
      ],
    });
    const p = r.proposals.find((x) => x.supplierLineClientKey === 's1');
    assert.ok(p);
    assert.ok(p!.matchState === 'AMBIGUOUS' || p!.matchState === 'REVIEW_REQUIRED');
    assert.ok(p!.signalsUsed.includes('DESCRIPTION_ONLY_WEAK') || p!.warnings.includes('DESCRIPTION_ONLY_AMBIGUOUS'));
  });

  it('4 unit conflict', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1', unit: 'm' })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1, supplierSku: 'W1', unit: 'each' })],
    });
    const p = r.proposals.find((x) => x.supplierLineClientKey === 's1');
    assert.ok(p!.signalsUsed.includes('UNIT_CONFLICT'));
    assert.ok(p!.matchState === 'REVIEW_REQUIRED' || p!.warnings.includes('UNIT_CONFLICT'));
  });

  it('5 quantity conflict', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1', quantity: 4 })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1, supplierSku: 'W1', quantity: 10 })],
    });
    const p = r.proposals.find((x) => x.supplierLineClientKey === 's1');
    assert.ok(p!.signalsUsed.includes('QUANTITY_CONFLICT'));
  });

  it('6 pack-size conflict', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1', quantity: 4 })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1, supplierSku: 'W1', packSize: 3, quantity: 4 })],
    });
    const p = r.proposals.find((x) => x.supplierLineClientKey === 's1');
    assert.ok(p!.signalsUsed.includes('PACK_SIZE_CONFLICT'));
  });

  it('7 VAT basis preserved', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1' })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1, vatBasis: 'INCLUSIVE' })],
    });
    const p = r.proposals.find((x) => x.supplierLineClientKey === 's1');
    assert.equal(p!.vatBasis, 'INCLUSIVE');
    assert.ok(p!.signalsUsed.includes('VAT_BASIS_PRESENT'));
  });

  it('8 supplier identity preserved', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1' })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1 })],
    });
    assert.equal(r.provenance.supplierName, 'Fixture Supplies');
    const p = r.proposals.find((x) => x.supplierLineClientKey === 's1');
    assert.ok(p!.signalsUsed.includes('SUPPLIER_IDENTITY'));
  });

  it('9 duplicate BOQ rows remain distinct', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [
        boq({ boqImportRowId: 'r1', itemCode: 'S1', originalRowNumber: 3 }),
        boq({ boqImportRowId: 'r2', itemCode: 'S1', originalRowNumber: 4 }),
      ],
      supplierLines: [
        line({ clientKey: 's1', sourceLineOrder: 1, supplierSku: 'S1' }),
        line({ clientKey: 's2', sourceLineOrder: 2, supplierSku: 'S1' }),
      ],
    });
    const forR1 = r.proposals.filter((p) => p.boqImportRowId === 'r1' && p.matchState !== 'UNMATCHED');
    const forR2 = r.proposals.filter((p) => p.boqImportRowId === 'r2' && p.matchState !== 'UNMATCHED');
    assert.ok(forR1.length >= 1);
    assert.ok(forR2.length >= 1);
  });

  it('10 duplicate supplier candidates require review', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1' })],
      supplierLines: [
        line({ clientKey: 's1', sourceLineOrder: 1, supplierSku: 'W1', description: 'Cold water point' }),
        line({ clientKey: 's2', sourceLineOrder: 2, supplierSku: 'W1', description: 'Cold water point' }),
      ],
    });
    const amb = r.proposals.filter((p) => p.boqImportRowId === 'r1' && p.matchState === 'AMBIGUOUS');
    assert.ok(amb.length >= 2);
    assert.ok(amb.some((p) => p.warnings.includes('MULTIPLE_SUPPLIER_CANDIDATES')));
  });

  it('11 sequence-only match rejected', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      allowSequenceOnlyAttempt: true,
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'AA', description: 'Alpha' })],
      supplierLines: [
        line({
          clientKey: 's1',
          sourceLineOrder: 1,
          supplierSku: 'ZZ',
          description: 'Totally different',
          unit: 'kg',
          quantity: 99,
        }),
      ],
    });
    assert.ok(r.warnings.includes('SEQUENCE_ONLY_ATTEMPT_REJECTED'));
    assert.ok(
      r.proposals.some((p) => p.signalsUsed.includes('SEQUENCE_ONLY_REJECTED')),
    );
    const denied = confirmSupplierBoqMatch({
      proposal: r.proposals.find((p) => p.signalsUsed.includes('SEQUENCE_ONLY_REJECTED'))!,
      actorRole: 'owner',
    });
    assert.equal(denied.ok, false);
  });

  it('12 unmatched stays unmatched', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'UNIQUE999', description: 'Obscure widget' })],
      supplierLines: [
        line({
          clientKey: 's1',
          sourceLineOrder: 1,
          supplierSku: 'OTHER',
          description: 'Unrelated pipe',
          unit: 'm',
          quantity: 1,
        }),
      ],
    });
    assert.ok(r.unmatchedBoqRowIds.includes('r1'));
    assert.ok(r.proposals.some((p) => p.matchState === 'UNMATCHED'));
  });

  it('13 confirmed match preserves both source identities', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1' })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1 })],
    });
    const p = r.proposals.find((x) => x.supplierLineClientKey === 's1')!;
    const confirmed = confirmSupplierBoqMatch({ proposal: p, actorRole: 'owner' });
    assert.equal(confirmed.ok, true);
    if (confirmed.ok) {
      assert.equal(confirmed.proposal.matchState, 'CONFIRMED');
      assert.equal(confirmed.proposal.boqImportRowId, 'r1');
      assert.equal(confirmed.proposal.supplierLineClientKey, 's1');
      assert.equal(confirmed.proposal.mutatesBoqSource, false);
    }
  });

  it('14 rejected candidate does not mutate BOQ', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1' })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1 })],
    });
    const rejected = rejectSupplierBoqMatch(r.proposals.find((x) => x.supplierLineClientKey === 's1')!);
    assert.equal(rejected.matchState, 'REJECTED');
    assert.equal(rejected.mutatesBoqSource, false);
  });

  it('15 no catalogue/quote price mutation', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1' })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1, unitPriceCents: 999 })],
    });
    assert.equal(r.catalogueMutation, false);
    assert.equal(r.quotePriceMutation, false);
    assert.equal(r.automaticPricing, false);
    assert.ok(r.proposals.every((p) => p.mutatesCatalogueOrQuotePrice === false));
  });

  it('16-17 tenant isolation helper + Client/Tech denied', () => {
    assert.equal(canManageSupplierBoqMatching({ roleName: 'owner' }), true);
    assert.equal(canManageSupplierBoqMatching({ roleName: 'client' }), false);
    assert.equal(canManageSupplierBoqMatching({ roleName: 'technician' }), false);
    assert.throws(() => assertNoSupplierBoqMatchClientLeak({ unitPriceCents: 1 }));
    const denied = confirmSupplierBoqMatch({
      proposal: resolveSupplierBoqMatches({
        provenance,
        boqImportId: 'boq-imp-1',
        boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1' })],
        supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1 })],
      }).proposals.find((p) => p.supplierLineClientKey === 's1')!,
      actorRole: 'client',
    });
    assert.equal(denied.ok, false);
  });

  it('18 audit facts present', () => {
    const r = resolveSupplierBoqMatches({
      provenance,
      boqImportId: 'boq-imp-1',
      boqRows: [boq({ boqImportRowId: 'r1', itemCode: 'W1' })],
      supplierLines: [line({ clientKey: 's1', sourceLineOrder: 1 })],
    });
    assert.ok(r.auraNarrativeFacts.some((f) => f.includes('Multi-signal')));
  });

  it('19 idempotent retry', () => {
    const a = supplierMatchIdempotencyKey({
      boqImportId: 'b1',
      fileHashSha256: 'h1',
      supplierLineKeys: ['b', 'a'],
    });
    const b = supplierMatchIdempotencyKey({
      boqImportId: 'b1',
      fileHashSha256: 'h1',
      supplierLineKeys: ['a', 'b'],
    });
    assert.equal(a, b);
  });

  it('20 cleanup / safety / Royal Cape', () => {
    const g = assertRow100SafetyGates({ row92AutomationEnabled: false });
    assert.equal(g.row101NotStarted, true);
    assert.throws(() => assertRow101NotStarted(true));
    assertRoyalCapeUnchangedForRow100({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
    assert.equal(SUPPLIER_QUOTE_BOQ_MATCH_ROYAL_CAPE.expectedTotalCents, 4_272_250);
  });
});
