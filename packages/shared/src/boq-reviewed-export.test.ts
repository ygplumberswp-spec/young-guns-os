import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import {
  buildBoqFixtureWorkbookBytes,
  canonicalizeBoqWorkbookImport,
  parseBoqXlsxWorkbook,
} from './boq-workbook-import.js';
import {
  BOQ_REVIEWED_EXPORT_ROYAL_CAPE,
  assessBoqExportReadiness,
  assertNoBoqReviewedExportClientLeak,
  assertRow102SafetyGates,
  assertRow103NotStarted,
  assertRoyalCapeUnchangedForRow102,
  boqExportIdempotencyKey,
  buildBoqExportRowViews,
  buildReviewedBoqPdfHtml,
  buildReviewedBoqXlsxWorkbook,
  canManageBoqReviewedExport,
  canonicalRowsToExportSource,
  projectClientSafeBoqExport,
  type BoqExportProvenance,
  type BoqReviewedEditInput,
} from './boq-reviewed-export.js';

describe('Row 102 reviewed BOQ export', () => {
  const bytes = buildBoqFixtureWorkbookBytes();
  const parsed = parseBoqXlsxWorkbook(bytes);
  const canonical = canonicalizeBoqWorkbookImport(parsed);
  const sourceRows = canonicalRowsToExportSource(canonical.rows);
  // Clear review blockers for final-path tests by treating fixture ITEM rows as OK when complete
  const readyRows = sourceRows.map((r) => ({
    ...r,
    reviewState:
      r.rowKind === 'ITEM' &&
      (r.quantity == null || !r.unit) &&
      r.warnings.some((w) => w.includes('MISSING'))
        ? 'REVIEW_REQUIRED'
        : 'OK',
    warnings: r.warnings.filter((w) => !['QUANTITY_MISSING', 'UNIT_MISSING'].includes(w)),
  }));

  const provenance: BoqExportProvenance = {
    boqImportId: 'boq-import-1',
    originalFilename: 'fixture-boq.xlsx',
    fileHashSha256: 'a'.repeat(64),
    revisionLabel: 'Rev A',
    importVersion: 1,
    workbookIdentity: 'wb-1',
    sheetOrder: canonical.sheetOrder,
    status: 'REVIEWED',
    supersededBy: null,
    hasNewerRevision: false,
  };

  it('1-6 multi-sheet XLSX; sheet/row/section/spacer/duplicate order preserved', () => {
    const views = buildBoqExportRowViews({ rows: readyRows });
    const xlsx = buildReviewedBoqXlsxWorkbook({
      provenance,
      rows: views,
      mode: 'REVIEWED_FINAL',
    });
    assert.deepEqual(xlsx.sheetOrder, ['Water', 'Waste']);
    assert.equal(xlsx.formulasExecuted, false);

    const reparsed = XLSX.read(xlsx.bytes, { type: 'array', cellFormula: true });
    assert.deepEqual(reparsed.SheetNames, ['Water', 'Waste']);

    const waterViews = views.filter((r) => r.sheetName === 'Water');
    for (let i = 1; i < waterViews.length; i += 1) {
      assert.ok(waterViews[i]!.originalRowOrder > waterViews[i - 1]!.originalRowOrder);
    }
    assert.ok(views.some((r) => r.rowKind === 'SECTION'));
    assert.ok(views.some((r) => r.rowKind === 'SPACER' || r.description == null));

    const waste = views.filter((r) => r.sheetName === 'Waste' && r.itemCode === 'S1');
    assert.ok(waste.length >= 2);
    assert.notEqual(waste[0]!.boqImportRowId, waste[1]!.boqImportRowId);
  });

  it('7-11 code/qty preserved; original vs reviewed; formula provenance; no recalc; reviewed value exported', () => {
    const w1 = readyRows.find((r) => r.itemCode === 'W1')!;
    const edits: BoqReviewedEditInput[] = [
      {
        boqImportRowId: w1.boqImportRowId,
        fieldKey: 'quantity',
        originalValue: '4',
        reviewedValue: '5',
        actorUserId: 'user-1',
        reviewedAt: '2026-08-08T12:00:00.000Z',
        reasonNote: 'Site measure confirmed',
      },
    ];
    const views = buildBoqExportRowViews({ rows: readyRows, reviewedEdits: edits });
    const edited = views.find((r) => r.boqImportRowId === w1.boqImportRowId)!;
    assert.equal(edited.original.quantity, 4);
    assert.equal(edited.quantity, 5);
    assert.equal(edited.reviewedEdits[0]!.actorUserId, 'user-1');

    const formula = views.find((r) => r.formulaProvenance);
    assert.ok(formula);
    assert.equal(formula!.formulaProvenance, 'D3+D5');
    assert.equal(formula!.formulasExecuted, false);

    const xlsx = buildReviewedBoqXlsxWorkbook({
      provenance,
      rows: views,
      mode: 'REVIEWED_FINAL',
    });
    const reparsed = XLSX.read(xlsx.bytes, { type: 'array' });
    const sheet = reparsed.Sheets.Water!;
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });
    const flat = aoa.flat().map(String);
    assert.ok(flat.some((c) => c.includes('SOURCE_FORMULA:D3+D5')));
    assert.ok(flat.some((c) => c === '5' || c.includes('5')));
    // Must not invent a recalculated formula cell
    const cellWithFormula = Object.values(sheet).some(
      (c) => c && typeof c === 'object' && 'f' in c && (c as { f?: string }).f,
    );
    assert.equal(cellWithFormula, false);
  });

  it('12 Row99 source unchanged by export views', () => {
    const before = JSON.stringify(canonical.rows);
    buildBoqExportRowViews({
      rows: readyRows,
      reviewedEdits: [
        {
          boqImportRowId: readyRows[0]!.boqImportRowId,
          fieldKey: 'description',
          originalValue: readyRows[0]!.description,
          reviewedValue: 'CHANGED',
          actorUserId: 'u',
          reviewedAt: '2026-08-08T00:00:00.000Z',
          reasonNote: null,
        },
      ],
    });
    assert.equal(JSON.stringify(canonical.rows), before);
  });

  it('13-14 PDF HTML follows client sequence + source/revision', () => {
    const views = buildBoqExportRowViews({ rows: readyRows });
    const pdf = buildReviewedBoqPdfHtml({
      provenance,
      rows: views,
      mode: 'REVIEWED_FINAL',
    });
    assert.match(pdf.html, /Water/);
    assert.match(pdf.html, /Waste/);
    assert.match(pdf.html, /fixture-boq\.xlsx/);
    assert.match(pdf.html, /Revision v1/);
    assert.match(pdf.html, /W1/);
    const waterIdx = pdf.html.indexOf('<h2>Water</h2>');
    const wasteIdx = pdf.html.indexOf('<h2>Waste</h2>');
    assert.ok(waterIdx >= 0 && wasteIdx > waterIdx);
  });

  it('15-17 unresolved review blocks final; draft labelled; superseded blocked', () => {
    const unresolved = sourceRows.map((r) =>
      r.itemCode === 'W5' || (r.rowKind === 'ITEM' && r.quantity == null)
        ? { ...r, reviewState: 'REVIEW_REQUIRED' as const }
        : r,
    );
    const finalBlocked = assessBoqExportReadiness({
      provenance,
      rows: unresolved,
      mode: 'REVIEWED_FINAL',
    });
    assert.equal(finalBlocked.allowed, false);
    assert.ok(finalBlocked.blockers.includes('REVIEW_INCOMPLETE'));

    const draft = assessBoqExportReadiness({
      provenance,
      rows: unresolved,
      mode: 'DRAFT_PREVIEW',
    });
    assert.equal(draft.allowed, true);
    assert.equal(draft.labelledDraftPreview, true);
    const draftHtml = buildReviewedBoqPdfHtml({
      provenance,
      rows: buildBoqExportRowViews({ rows: unresolved }),
      mode: 'DRAFT_PREVIEW',
    });
    assert.match(draftHtml.html, /DRAFT PREVIEW/);

    const superseded = assessBoqExportReadiness({
      provenance: { ...provenance, hasNewerRevision: true, status: 'SUPERSEDED' },
      rows: readyRows,
      mode: 'DRAFT_PREVIEW',
    });
    assert.equal(superseded.allowed, false);
    assert.ok(superseded.blockers.includes('SOURCE_REVISION_SUPERSEDED'));
  });

  it('18-21 internal supplier/cost/margin/split excluded; client-safe projection', () => {
    const views = buildBoqExportRowViews({ rows: readyRows });
    const safe = projectClientSafeBoqExport({
      mode: 'REVIEWED_FINAL',
      provenance,
      rows: views,
    });
    assert.equal(safe.excludesSupplierCost, true);
    assert.equal(safe.excludesMarginGp, true);
    assert.equal(safe.excludesSplitPurchaseInternals, true);
    assert.equal(safe.excludesMatchConfidence, true);
    assert.throws(() =>
      assertNoBoqReviewedExportClientLeak({ unitPriceCents: 100, supplierSubtotalCents: 1 }),
    );
    assert.throws(() => assertNoBoqReviewedExportClientLeak({ marginCents: 1 }));
    assert.throws(() => assertNoBoqReviewedExportClientLeak({ splitPurchaseProposal: {} }));
    assertNoBoqReviewedExportClientLeak(safe);
  });

  it('22-23 Tech/Client denied; tenant RBAC helper', () => {
    assert.equal(canManageBoqReviewedExport({ roleName: 'owner' }), true);
    assert.equal(canManageBoqReviewedExport({ roleName: 'client' }), false);
    assert.equal(canManageBoqReviewedExport({ roleName: 'technician' }), false);
  });

  it('24-26 audit facts / idempotency / safety cleanup', () => {
    const views = buildBoqExportRowViews({ rows: readyRows });
    const xlsx = buildReviewedBoqXlsxWorkbook({
      provenance,
      rows: views,
      mode: 'REVIEWED_FINAL',
    });
    const k1 = boqExportIdempotencyKey({
      boqImportId: provenance.boqImportId,
      format: 'XLSX',
      mode: 'REVIEWED_FINAL',
      contentFingerprintSha256: xlsx.contentFingerprintSha256,
    });
    const k2 = boqExportIdempotencyKey({
      boqImportId: provenance.boqImportId,
      format: 'XLSX',
      mode: 'REVIEWED_FINAL',
      contentFingerprintSha256: xlsx.contentFingerprintSha256,
    });
    assert.equal(k1, k2);
    const readiness = assessBoqExportReadiness({
      provenance,
      rows: readyRows,
      mode: 'REVIEWED_FINAL',
    });
    assert.ok(readiness.auraNarrativeFacts.some((f) => f.includes('Row 99')));
    const g = assertRow102SafetyGates({ row92AutomationEnabled: false });
    assert.equal(g.purchaseOrdersCreated, 0);
    assert.throws(() => assertRow103NotStarted(true));
    assertRoyalCapeUnchangedForRow102({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
    assert.equal(BOQ_REVIEWED_EXPORT_ROYAL_CAPE.expectedTotalCents, 4_272_250);
  });
});
