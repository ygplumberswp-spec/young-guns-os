/**
 * Row 99 — Canonical BOQ Workbook Import
 *
 * Preserves original workbook structure, sheet order, row order, formulas (text only).
 * Does NOT recalculate formulas, execute macros, price, or supplier-match.
 * Links to Row 95 BOQ_TENDER as reference only.
 */

import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';

/** Node-only module — import via `@titan/shared/boq-workbook-import`. */

export const BOQ_WORKBOOK_IMPORT_KEY = 'boq-workbook-import' as const;

export const BOQ_WORKBOOK_IMPORT_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type BoqImportReviewState =
  | 'DRAFT'
  | 'REVIEW_REQUIRED'
  | 'REVIEWED'
  | 'SUPERSEDED';

export type BoqImportRowKind =
  | 'HEADER'
  | 'SECTION'
  | 'ITEM'
  | 'SPACER'
  | 'UNKNOWN';

export type BoqImportWarning =
  | 'SECTION_UNKNOWN'
  | 'QUANTITY_MISSING'
  | 'UNIT_MISSING'
  | 'DESCRIPTION_MISSING'
  | 'FORMULA_CACHED_VALUE_MISSING'
  | 'FORMULA_NOT_EXECUTED'
  | 'HEADER_ROW'
  | 'SPACER_ROW'
  | 'NO_AUTOMATIC_PRICING'
  | 'NO_SUPPLIER_MATCHING';

export type BoqSourceCell = {
  address: string;
  rawValue: string | number | boolean | null;
  displayValue: string | null;
  formulaText: string | null;
};

export type BoqParsedSheet = {
  sheetName: string;
  sheetOrder: number;
  /** 1-based original Excel row number → sparse cell map by column letter */
  rows: Array<{
    originalRowNumber: number;
    cells: Record<string, BoqSourceCell>;
  }>;
};

export type BoqCanonicalImportRow = {
  sheetName: string;
  sheetOrder: number;
  originalRowNumber: number;
  originalRowOrder: number;
  sectionLabel: string | null;
  sectionKnown: boolean;
  rowKind: BoqImportRowKind;
  itemCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  rawValue: string | null;
  displayValue: string | null;
  formulaText: string | null;
  cellAddress: string | null;
  warnings: BoqImportWarning[];
  reviewState: 'REVIEW_REQUIRED' | 'OK';
};

export type BoqWorkbookParseResult = {
  workbookIdentity: string;
  sheetOrder: string[];
  sheets: BoqParsedSheet[];
  parser: 'xlsx-sheetjs';
  formulasExecuted: false;
  macrosExecuted: false;
  externalLinksFollowed: false;
};

export type BoqCanonicalImportResult = {
  reviewState: BoqImportReviewState;
  rows: BoqCanonicalImportRow[];
  warnings: BoqImportWarning[];
  sheetOrder: string[];
  automaticPricing: false;
  supplierMatching: false;
  formulasRecalculated: false;
  auraNarrativeFacts: string[];
};

export type BoqImportProvenance = {
  sourceDocumentId: string | null;
  originalFilename: string;
  fileHashSha256: string;
  revisionLabel: string | null;
  importVersion: number;
  importedAt: string;
  companyId: string;
  actorUserId: string | null;
};

function colLetter(index0: number): string {
  let n = index0 + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellDisplay(cell: XLSX.CellObject | undefined): string | null {
  if (!cell) return null;
  if (cell.w != null && String(cell.w).length > 0) return String(cell.w);
  if (cell.v == null) return null;
  return String(cell.v);
}

function cellRaw(cell: XLSX.CellObject | undefined): string | number | boolean | null {
  if (!cell || cell.v == null) return null;
  if (typeof cell.v === 'string' || typeof cell.v === 'number' || typeof cell.v === 'boolean') {
    return cell.v;
  }
  return String(cell.v);
}

/** SHA-256 of workbook bytes — identity for idempotent retry / revision detect. */
export function hashBoqWorkbookBytes(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Parse XLSX buffer without calculating formulas or running macros.
 * Cached/display values preserved separately from formula text.
 */
export function parseBoqXlsxWorkbook(buffer: Uint8Array | Buffer): BoqWorkbookParseResult {
  const wb = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: true,
    cellNF: true,
    cellText: true,
    cellDates: false,
    bookVBA: false,
    bookFiles: false,
    raw: false,
  });

  const sheetOrder = wb.SheetNames.slice();
  const sheets: BoqParsedSheet[] = [];

  sheetOrder.forEach((sheetName, sheetOrderIdx) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      sheets.push({ sheetName, sheetOrder: sheetOrderIdx, rows: [] });
      return;
    }
    const ref = ws['!ref'];
    if (!ref) {
      sheets.push({ sheetName, sheetOrder: sheetOrderIdx, rows: [] });
      return;
    }
    const range = XLSX.utils.decode_range(ref);
    const rows: BoqParsedSheet['rows'] = [];
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const cells: Record<string, BoqSourceCell> = {};
      let any = false;
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = ws[address] as XLSX.CellObject | undefined;
        if (!cell) continue;
        any = true;
        const formulaText = cell.f != null ? String(cell.f) : null;
        cells[colLetter(c)] = {
          address,
          rawValue: cellRaw(cell),
          displayValue: cellDisplay(cell),
          formulaText,
        };
      }
      // Preserve blank/spacer rows inside used range (do not collapse sequence)
      if (any || r >= range.s.r) {
        rows.push({ originalRowNumber: r + 1, cells });
      }
    }
    sheets.push({ sheetName, sheetOrder: sheetOrderIdx, rows });
  });

  const workbookIdentity = `sheets:${sheetOrder.join('|')}`;
  return {
    workbookIdentity,
    sheetOrder,
    sheets,
    parser: 'xlsx-sheetjs',
    formulasExecuted: false,
    macrosExecuted: false,
    externalLinksFollowed: false,
  };
}

function looksLikeHeader(values: string[]): boolean {
  const joined = values.map((v) => v.toLowerCase());
  const hits = ['item', 'code', 'description', 'unit', 'qty', 'quantity', 'uom'].filter((h) =>
    joined.some((v) => v.includes(h)),
  );
  return hits.length >= 2;
}

function looksLikeSection(values: string[], nonEmptyCount: number): boolean {
  if (nonEmptyCount !== 1) return false;
  const only = values.find((v) => v.trim()) ?? '';
  if (!only) return false;
  if (only.length > 80) return false;
  // Explicit section-ish: ALL CAPS short, or ends with colon, or starts with "Section"
  if (/^section\b/i.test(only)) return true;
  if (only.endsWith(':')) return true;
  if (only === only.toUpperCase() && /[A-Z]/.test(only) && only.length <= 40) return true;
  return false;
}

function parseQuantity(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number.parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Canonicalize parsed sheets into reviewable BOQ rows.
 * Never invents units/quantities/codes; never recalculates formulas.
 */
export function canonicalizeBoqWorkbookImport(
  parsed: BoqWorkbookParseResult,
): BoqCanonicalImportResult {
  const rows: BoqCanonicalImportRow[] = [];
  const globalWarnings = new Set<BoqImportWarning>([
    'NO_AUTOMATIC_PRICING',
    'NO_SUPPLIER_MATCHING',
  ]);
  let currentSection: string | null = null;
  let sectionKnown = false;

  for (const sheet of parsed.sheets) {
    currentSection = null;
    sectionKnown = false;
    let headerMap: { code?: string; desc?: string; unit?: string; qty?: string } | null = null;
    let order = 0;

    for (const row of sheet.rows) {
      const entries = Object.entries(row.cells).sort(([a], [b]) => a.localeCompare(b));
      const values = entries.map(([, cell]) => cell.displayValue ?? (cell.rawValue != null ? String(cell.rawValue) : ''));
      const nonEmpty = values.filter((v) => v.trim().length > 0);
      const formulaCell = entries.find(([, c]) => c.formulaText);
      const warnings: BoqImportWarning[] = [];

      if (nonEmpty.length === 0) {
        rows.push({
          sheetName: sheet.sheetName,
          sheetOrder: sheet.sheetOrder,
          originalRowNumber: row.originalRowNumber,
          originalRowOrder: order++,
          sectionLabel: currentSection,
          sectionKnown,
          rowKind: 'SPACER',
          itemCode: null,
          description: null,
          unit: null,
          quantity: null,
          rawValue: null,
          displayValue: null,
          formulaText: null,
          cellAddress: null,
          warnings: ['SPACER_ROW'],
          reviewState: 'OK',
        });
        continue;
      }

      if (!headerMap && looksLikeHeader(nonEmpty)) {
        headerMap = {};
        for (const [col, cell] of entries) {
          const t = (cell.displayValue ?? '').toLowerCase();
          if (t.includes('item') || t.includes('code') || t === '#') headerMap.code = col;
          else if (t.includes('desc')) headerMap.desc = col;
          else if (t.includes('unit') || t === 'uom') headerMap.unit = col;
          else if (t.includes('qty') || t.includes('quantity')) headerMap.qty = col;
        }
        rows.push({
          sheetName: sheet.sheetName,
          sheetOrder: sheet.sheetOrder,
          originalRowNumber: row.originalRowNumber,
          originalRowOrder: order++,
          sectionLabel: currentSection,
          sectionKnown,
          rowKind: 'HEADER',
          itemCode: null,
          description: nonEmpty.join(' | '),
          unit: null,
          quantity: null,
          rawValue: nonEmpty.join('|'),
          displayValue: nonEmpty.join(' | '),
          formulaText: null,
          cellAddress: entries[0]?.[1].address ?? null,
          warnings: ['HEADER_ROW'],
          reviewState: 'OK',
        });
        continue;
      }

      if (looksLikeSection(nonEmpty, nonEmpty.length)) {
        currentSection = nonEmpty[0]!.replace(/:$/, '').trim();
        sectionKnown = true;
        rows.push({
          sheetName: sheet.sheetName,
          sheetOrder: sheet.sheetOrder,
          originalRowNumber: row.originalRowNumber,
          originalRowOrder: order++,
          sectionLabel: currentSection,
          sectionKnown: true,
          rowKind: 'SECTION',
          itemCode: null,
          description: currentSection,
          unit: null,
          quantity: null,
          rawValue: currentSection,
          displayValue: currentSection,
          formulaText: null,
          cellAddress: entries[0]?.[1].address ?? null,
          warnings: [],
          reviewState: 'OK',
        });
        continue;
      }

      const get = (col: string | undefined) => {
        if (!col) return null;
        const cell = row.cells[col];
        if (!cell) return null;
        return cell.displayValue ?? (cell.rawValue != null ? String(cell.rawValue) : null);
      };

      let itemCode: string | null = null;
      let description: string | null = null;
      let unit: string | null = null;
      let quantity: number | null = null;
      let primaryAddress: string | null = entries[0]?.[1].address ?? null;
      let rawValue: string | null = null;
      let displayValue: string | null = null;

      if (headerMap) {
        itemCode = get(headerMap.code);
        description = get(headerMap.desc);
        unit = get(headerMap.unit);
        const qtyRaw = get(headerMap.qty);
        quantity = parseQuantity(qtyRaw);
        const qtyCol = headerMap.qty ? row.cells[headerMap.qty] : null;
        if (qtyCol) {
          primaryAddress = qtyCol.address;
          rawValue = qtyCol.rawValue != null ? String(qtyCol.rawValue) : null;
          displayValue = qtyCol.displayValue;
        }
      } else {
        // Positional fallback without inventing: A=code, B=desc, C=unit, D=qty when present
        const cols = entries.map(([k]) => k);
        itemCode = get(cols[0]) || null;
        description = get(cols[1]) || get(cols[0]);
        unit = cols[2] ? get(cols[2]) : null;
        quantity = cols[3] ? parseQuantity(get(cols[3])) : null;
        rawValue = nonEmpty.join('|');
        displayValue = nonEmpty.join(' | ');
      }

      if (!sectionKnown) {
        warnings.push('SECTION_UNKNOWN');
        globalWarnings.add('SECTION_UNKNOWN');
      }
      if (quantity == null) warnings.push('QUANTITY_MISSING');
      if (!unit) warnings.push('UNIT_MISSING');
      if (!description) warnings.push('DESCRIPTION_MISSING');

      if (formulaCell) {
        warnings.push('FORMULA_NOT_EXECUTED');
        globalWarnings.add('FORMULA_NOT_EXECUTED');
        const fc = formulaCell[1];
        if (fc.rawValue == null && fc.displayValue == null) {
          warnings.push('FORMULA_CACHED_VALUE_MISSING');
        }
        // Preserve formula exactly; do not substitute calculated value into quantity unless cached exists
        if (!rawValue && fc.rawValue != null) rawValue = String(fc.rawValue);
        if (!displayValue) displayValue = fc.displayValue;
        primaryAddress = fc.address;
      }

      const reviewState =
        warnings.includes('SECTION_UNKNOWN') ||
        warnings.includes('DESCRIPTION_MISSING') ||
        warnings.includes('FORMULA_NOT_EXECUTED')
          ? 'REVIEW_REQUIRED'
          : 'OK';

      rows.push({
        sheetName: sheet.sheetName,
        sheetOrder: sheet.sheetOrder,
        originalRowNumber: row.originalRowNumber,
        originalRowOrder: order++,
        sectionLabel: currentSection,
        sectionKnown,
        rowKind: 'ITEM',
        itemCode,
        description,
        unit,
        quantity,
        rawValue,
        displayValue,
        formulaText: formulaCell ? formulaCell[1].formulaText : null,
        cellAddress: primaryAddress,
        warnings,
        reviewState,
      });
    }
  }

  const needsReview = rows.some((r) => r.reviewState === 'REVIEW_REQUIRED');
  return {
    reviewState: needsReview ? 'REVIEW_REQUIRED' : 'DRAFT',
    rows,
    warnings: [...globalWarnings],
    sheetOrder: parsed.sheetOrder.slice(),
    automaticPricing: false,
    supplierMatching: false,
    formulasRecalculated: false,
    auraNarrativeFacts: [
      `Workbook sheets in order: ${parsed.sheetOrder.join(' → ') || '(none)'}.`,
      `Canonical rows: ${rows.length} (order preserved; spacers retained).`,
      'Formulas preserved as text only — not executed or recalculated.',
      'No automatic pricing. No supplier matching.',
      'Import is DRAFT/REVIEW_REQUIRED until authorised human review.',
    ],
  };
}

export function resolveBoqImportRevision(input: {
  previousFileHash: string | null;
  nextFileHash: string;
  previousImportVersion: number;
}): { action: 'IDEMPOTENT_REPLAY' | 'NEW_REVISION'; importVersion: number } {
  if (input.previousFileHash && input.previousFileHash === input.nextFileHash) {
    return { action: 'IDEMPOTENT_REPLAY', importVersion: input.previousImportVersion };
  }
  return {
    action: 'NEW_REVISION',
    importVersion: (input.previousImportVersion || 0) + 1,
  };
}

export function canManageBoqWorkbookImport(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertNoBoqImportClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoBoqImportClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'boqImport',
    'boqImportRows',
    'boqWorkbookInternal',
    'formulaText',
    'fileChecksumSha256',
    'rawValue',
    'sheetRaw',
    'unitCostCents',
    'supplierMatch',
    'automaticPricing',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`BOQ import internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') assertNoBoqImportClientLeak(value, `${path}.${key}`);
  }
}

export function assertRow100NotStarted(started: boolean): void {
  if (started) throw new Error('Row 100+ must not start during Row 99');
}

export function assertRow99SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row100Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
}): {
  row92Off: true;
  row100NotStarted: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow100NotStarted(input.row100Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 99 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 99 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 99 requires production writes = 0');
  return {
    row92Off: true,
    row100NotStarted: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
  };
}

export function assertRoyalCapeUnchangedForRow99(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== BOQ_WORKBOOK_IMPORT_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== BOQ_WORKBOOK_IMPORT_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

/** Build a minimal multi-sheet fixture workbook (tests / staging proof). */
export function buildBoqFixtureWorkbookBytes(): Uint8Array {
  const wb = XLSX.utils.book_new();

  const sheetA = XLSX.utils.aoa_to_sheet([
    ['Item', 'Description', 'Unit', 'Qty'],
    ['SECTION WATER:'],
    ['W1', 'Cold water point', 'each', 4],
    [],
    ['W2', 'Hot water point', 'each', 2],
    ['W3', 'Pipe length', 'm', 12],
    ['W4', 'Subtotal qty', '', null],
  ]);
  // Exact formula text + cached display value (parser must not recalculate)
  sheetA['D7'] = { t: 'n', f: 'D3+D5', v: 6, w: '6' };
  // Missing quantity row
  sheetA['A8'] = { t: 's', v: 'W5', w: 'W5' };
  sheetA['B8'] = { t: 's', v: 'Unspecified accessory', w: 'Unspecified accessory' };
  sheetA['C8'] = { t: 's', v: '', w: '' };
  sheetA['!ref'] = 'A1:D8';

  const sheetB = XLSX.utils.aoa_to_sheet([
    ['Item', 'Description', 'Unit', 'Qty'],
    ['SECTION WASTE'],
    ['S1', 'Waste point', 'each', 3],
    ['S1', 'Waste point duplicate-looking', 'each', 3],
  ]);

  XLSX.utils.book_append_sheet(wb, sheetA, 'Water');
  XLSX.utils.book_append_sheet(wb, sheetB, 'Waste');
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Uint8Array(out);
}

export function linkBoqImportToBoqTenderScenario(input: {
  boqImportId: string;
  tenderReference?: string | null;
}): {
  scenario: 'BOQ_TENDER';
  metadata: { boqAttachmentRef: string; tenderReference: string | null; row99ImportId: string };
  automaticPricing: false;
} {
  return {
    scenario: 'BOQ_TENDER',
    metadata: {
      boqAttachmentRef: `boq-import:${input.boqImportId}`,
      tenderReference: input.tenderReference ?? null,
      row99ImportId: input.boqImportId,
    },
    automaticPricing: false,
  };
}
