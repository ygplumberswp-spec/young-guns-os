import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import {
  BOQ_WORKBOOK_IMPORT_ROYAL_CAPE,
  assertNoBoqImportClientLeak,
  assertRow100NotStarted,
  assertRow99SafetyGates,
  assertRoyalCapeUnchangedForRow99,
  buildBoqFixtureWorkbookBytes,
  canonicalizeBoqWorkbookImport,
  canManageBoqWorkbookImport,
  hashBoqWorkbookBytes,
  linkBoqImportToBoqTenderScenario,
  parseBoqXlsxWorkbook,
  resolveBoqImportRevision,
} from './boq-workbook-import.js';

describe('Row 99 BOQ workbook import', () => {
  const bytes = buildBoqFixtureWorkbookBytes();
  const parsed = parseBoqXlsxWorkbook(bytes);
  const canonical = canonicalizeBoqWorkbookImport(parsed);

  it('1 multi-sheet workbook', () => {
    assert.equal(parsed.sheetOrder.length, 2);
    assert.deepEqual(parsed.sheetOrder, ['Water', 'Waste']);
  });

  it('2 sheet order preserved', () => {
    assert.deepEqual(canonical.sheetOrder, ['Water', 'Waste']);
    assert.ok(canonical.rows.every((r, i, arr) => i === 0 || r.sheetOrder >= arr[i - 1]!.sheetOrder));
  });

  it('3 original row numbers/order preserved', () => {
    const water = canonical.rows.filter((r) => r.sheetName === 'Water');
    for (let i = 1; i < water.length; i += 1) {
      assert.ok(water[i]!.originalRowOrder > water[i - 1]!.originalRowOrder);
    }
    assert.ok(water.some((r) => r.originalRowNumber === 3));
  });

  it('4 section heading preserved when explicit', () => {
    const section = canonical.rows.find((r) => r.rowKind === 'SECTION' && r.sheetName === 'Water');
    assert.ok(section);
    assert.match(section!.description ?? '', /WATER/i);
    assert.equal(section!.sectionKnown, true);
  });

  it('5-8 item/code/description/unit/quantity', () => {
    const item = canonical.rows.find((r) => r.itemCode === 'W1');
    assert.ok(item);
    assert.equal(item!.description, 'Cold water point');
    assert.equal(item!.unit, 'each');
    assert.equal(item!.quantity, 4);
  });

  it('9-10 raw/display + exact formula text preserved', () => {
    const formulaRow = canonical.rows.find((r) => r.formulaText);
    assert.ok(formulaRow);
    assert.equal(formulaRow!.formulaText, 'D3+D5');
    assert.equal(formulaRow!.displayValue, '6');
  });

  it('11 formula not executed/recalculated', () => {
    // Plant a deliberately wrong cached value — parser must keep it, not recompute 4+2=6
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Item', 'Description', 'Unit', 'Qty'],
      ['A1', 'One', 'each', 4],
      ['A2', 'Two', 'each', 2],
      ['A3', 'Sum', '', null],
    ]);
    ws['D4'] = { t: 'n', f: 'D2+D3', v: 99, w: '99' };
    ws['!ref'] = 'A1:D4';
    XLSX.utils.book_append_sheet(wb, ws, 'Calc');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const p = parseBoqXlsxWorkbook(buf);
    const c = canonicalizeBoqWorkbookImport(p);
    const sum = c.rows.find((r) => r.formulaText === 'D2+D3');
    assert.ok(sum);
    assert.equal(sum!.displayValue, '99');
    assert.equal(p.formulasExecuted, false);
    assert.equal(c.formulasRecalculated, false);
  });

  it('12 missing quantity remains missing', () => {
    const missing = canonical.rows.find((r) => r.itemCode === 'W5');
    assert.ok(missing);
    assert.equal(missing!.quantity, null);
    assert.ok(missing!.warnings.includes('QUANTITY_MISSING'));
  });

  it('13 missing unit remains missing', () => {
    const missing = canonical.rows.find((r) => r.itemCode === 'W5');
    assert.ok(missing);
    assert.equal(missing!.unit == null || missing!.unit === '', true);
    assert.ok(missing!.warnings.includes('UNIT_MISSING'));
  });

  it('14 blank/spacer row handled without collapsing sequence', () => {
    const water = canonical.rows.filter((r) => r.sheetName === 'Water');
    assert.ok(water.some((r) => r.rowKind === 'SPACER'));
    const orders = water.map((r) => r.originalRowOrder);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });

  it('15 duplicate-looking rows remain distinct', () => {
    const dups = canonical.rows.filter((r) => r.itemCode === 'S1');
    assert.equal(dups.length, 2);
    assert.notEqual(dups[0]!.originalRowNumber, dups[1]!.originalRowNumber);
  });

  it('16 changed workbook => new revision', () => {
    const h1 = hashBoqWorkbookBytes(bytes);
    const other = buildBoqFixtureWorkbookBytes();
    // mutate by rebuilding with extra sheet
    const wb = XLSX.read(other, { type: 'buffer' });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Extra');
    const changed = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const h2 = hashBoqWorkbookBytes(changed);
    assert.notEqual(h1, h2);
    const rev = resolveBoqImportRevision({
      previousFileHash: h1,
      nextFileHash: h2,
      previousImportVersion: 1,
    });
    assert.equal(rev.action, 'NEW_REVISION');
    assert.equal(rev.importVersion, 2);
  });

  it('17 exact retry idempotent', () => {
    const h = hashBoqWorkbookBytes(bytes);
    const rev = resolveBoqImportRevision({
      previousFileHash: h,
      nextFileHash: h,
      previousImportVersion: 3,
    });
    assert.equal(rev.action, 'IDEMPOTENT_REPLAY');
    assert.equal(rev.importVersion, 3);
  });

  it('18 source hash/provenance', () => {
    const h = hashBoqWorkbookBytes(bytes);
    assert.equal(h.length, 64);
    assert.match(h, /^[a-f0-9]+$/);
  });

  it('19-20 tenant isolation helper + RBAC', () => {
    assert.equal(canManageBoqWorkbookImport({ roleName: 'owner', permissions: ['finance:write'] }), true);
    assert.equal(canManageBoqWorkbookImport({ roleName: 'client' }), false);
    assert.equal(canManageBoqWorkbookImport({ roleName: 'technician' }), false);
  });

  it('21 audit facts present', () => {
    assert.ok(canonical.auraNarrativeFacts.some((f) => f.includes('Formulas preserved')));
  });

  it('22 Row95 BOQ_TENDER link', () => {
    const link = linkBoqImportToBoqTenderScenario({
      boqImportId: 'imp-1',
      tenderReference: 'T-100',
    });
    assert.equal(link.scenario, 'BOQ_TENDER');
    assert.equal(link.metadata.row99ImportId, 'imp-1');
    assert.equal(link.automaticPricing, false);
  });

  it('23-24 no automatic pricing / supplier matching', () => {
    assert.equal(canonical.automaticPricing, false);
    assert.equal(canonical.supplierMatching, false);
    assert.ok(canonical.warnings.includes('NO_AUTOMATIC_PRICING'));
    assert.ok(canonical.warnings.includes('NO_SUPPLIER_MATCHING'));
  });

  it('25 cleanup / safety / client leak / Royal Cape', () => {
    const g = assertRow99SafetyGates({ row92AutomationEnabled: false });
    assert.equal(g.row100NotStarted, true);
    assert.throws(() => assertRow100NotStarted(true));
    assert.throws(() => assertNoBoqImportClientLeak({ formulaText: '=A1' }));
    assertRoyalCapeUnchangedForRow99({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
    assert.equal(BOQ_WORKBOOK_IMPORT_ROYAL_CAPE.expectedTotalCents, 4_272_250);
  });
});
