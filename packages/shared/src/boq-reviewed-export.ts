/**
 * Row 102 — Reviewed BOQ Export (XLSX + PDF)
 *
 * Reconstructs client commercial sequence from Row 99 canonical evidence.
 * Reviewed edits overlay originals without mutating Row99 source rows.
 * Never leaks Row100/101 supplier cost / comparison / split-purchase internals.
 * Row 103+ not started. No PO / Xero / customer production writes.
 */

import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { XERO_OFFICIAL_NUMBER_ROYAL_CAPE } from './xero-official-number-authority.js';
import { assertRow92GlobalAutomationDisabled } from './pricebook-tier-formula.js';
import type { BoqCanonicalImportRow, BoqImportRowKind } from './boq-workbook-import.js';

/** Node-only module — import via `@titan/shared/boq-reviewed-export`. */

export const BOQ_REVIEWED_EXPORT_KEY = 'boq-reviewed-export' as const;

export const BOQ_REVIEWED_EXPORT_ROYAL_CAPE = {
  ...XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  expectedTotalCents: 4_272_250,
  expectedPricingMode: 'ITEMISED' as const,
} as const;

export type BoqExportMode = 'DRAFT_PREVIEW' | 'REVIEWED_FINAL';
export type BoqExportFormat = 'XLSX' | 'PDF';

export type BoqExportReadinessBlocker =
  | 'REVIEW_INCOMPLETE'
  | 'SOURCE_REVISION_SUPERSEDED'
  | 'AMBIGUITY_UNRESOLVED'
  | 'MISSING_REQUIRED_REVIEW_VALUE';

export type BoqReviewedFieldKey =
  | 'itemCode'
  | 'description'
  | 'unit'
  | 'quantity'
  | 'displayValue';

export type BoqReviewedEditInput = {
  boqImportRowId: string;
  fieldKey: BoqReviewedFieldKey;
  originalValue: string | null;
  reviewedValue: string | null;
  actorUserId: string | null;
  reviewedAt: string;
  reasonNote: string | null;
};

export type BoqExportSourceRow = {
  boqImportRowId: string;
  sheetName: string;
  sheetOrder: number;
  originalRowNumber: number;
  originalRowOrder: number;
  sectionLabel: string | null;
  rowKind: BoqImportRowKind | string;
  itemCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  rawValue: string | null;
  displayValue: string | null;
  formulaText: string | null;
  cellAddress: string | null;
  reviewState: 'OK' | 'REVIEW_REQUIRED' | string;
  warnings: string[];
};

export type BoqExportProvenance = {
  boqImportId: string;
  originalFilename: string;
  fileHashSha256: string;
  revisionLabel: string | null;
  importVersion: number;
  workbookIdentity: string | null;
  sheetOrder: string[];
  status: string;
  supersededBy: string | null;
  hasNewerRevision: boolean;
};

export type BoqExportRowView = {
  boqImportRowId: string;
  sheetName: string;
  sheetOrder: number;
  originalRowNumber: number;
  originalRowOrder: number;
  sectionLabel: string | null;
  rowKind: string;
  itemCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  /** Client-facing commercial display — reviewed where authorised, else source. */
  exportDisplayValue: string | null;
  original: {
    itemCode: string | null;
    description: string | null;
    unit: string | null;
    quantity: number | null;
    rawValue: string | null;
    displayValue: string | null;
    formulaText: string | null;
    cellAddress: string | null;
  };
  reviewedEdits: Array<{
    fieldKey: BoqReviewedFieldKey;
    originalValue: string | null;
    reviewedValue: string | null;
    actorUserId: string | null;
    reviewedAt: string;
    reasonNote: string | null;
  }>;
  formulaProvenance: string | null;
  formulasExecuted: false;
};

export type BoqClientSafeExportProjection = {
  mode: BoqExportMode;
  labelledDraftPreview: boolean;
  provenance: {
    boqImportId: string;
    originalFilename: string;
    revisionLabel: string | null;
    importVersion: number;
    fileHashSha256Prefix: string;
  };
  sheetOrder: string[];
  rows: Array<{
    sheetName: string;
    originalRowNumber: number;
    rowKind: string;
    sectionLabel: string | null;
    itemCode: string | null;
    description: string | null;
    unit: string | null;
    quantity: number | null;
    exportDisplayValue: string | null;
    hasReviewedEdit: boolean;
    formulaProvenancePresent: boolean;
  }>;
  excludesSupplierCost: true;
  excludesMarginGp: true;
  excludesSplitPurchaseInternals: true;
  excludesMatchConfidence: true;
};

function stringifyQty(q: number | null): string | null {
  if (q == null || !Number.isFinite(q)) return null;
  return String(q);
}

function applyEdits(
  row: BoqExportSourceRow,
  edits: BoqReviewedEditInput[],
): BoqExportRowView {
  const rowEdits = edits.filter((e) => e.boqImportRowId === row.boqImportRowId);
  let itemCode = row.itemCode;
  let description = row.description;
  let unit = row.unit;
  let quantity = row.quantity;
  let displayValue = row.displayValue;

  for (const e of rowEdits) {
    if (e.fieldKey === 'itemCode') itemCode = e.reviewedValue;
    if (e.fieldKey === 'description') description = e.reviewedValue;
    if (e.fieldKey === 'unit') unit = e.reviewedValue;
    if (e.fieldKey === 'quantity') {
      if (e.reviewedValue == null || e.reviewedValue.trim() === '') quantity = null;
      else {
        const n = Number(e.reviewedValue);
        quantity = Number.isFinite(n) ? n : quantity;
      }
    }
    if (e.fieldKey === 'displayValue') displayValue = e.reviewedValue;
  }

  const exportDisplayValue =
    displayValue ??
    (quantity != null ? stringifyQty(quantity) : null) ??
    description ??
    itemCode;

  return {
    boqImportRowId: row.boqImportRowId,
    sheetName: row.sheetName,
    sheetOrder: row.sheetOrder,
    originalRowNumber: row.originalRowNumber,
    originalRowOrder: row.originalRowOrder,
    sectionLabel: row.sectionLabel,
    rowKind: row.rowKind,
    itemCode,
    description,
    unit,
    quantity,
    exportDisplayValue,
    original: {
      itemCode: row.itemCode,
      description: row.description,
      unit: row.unit,
      quantity: row.quantity,
      rawValue: row.rawValue,
      displayValue: row.displayValue,
      formulaText: row.formulaText,
      cellAddress: row.cellAddress,
    },
    reviewedEdits: rowEdits.map((e) => ({
      fieldKey: e.fieldKey,
      originalValue: e.originalValue,
      reviewedValue: e.reviewedValue,
      actorUserId: e.actorUserId,
      reviewedAt: e.reviewedAt,
      reasonNote: e.reasonNote,
    })),
    formulaProvenance: row.formulaText,
    formulasExecuted: false,
  };
}

export function buildBoqExportRowViews(input: {
  rows: BoqExportSourceRow[];
  reviewedEdits?: BoqReviewedEditInput[];
}): BoqExportRowView[] {
  const edits = input.reviewedEdits ?? [];
  return [...input.rows]
    .sort((a, b) =>
      a.sheetOrder !== b.sheetOrder
        ? a.sheetOrder - b.sheetOrder
        : a.originalRowOrder - b.originalRowOrder,
    )
    .map((r) => applyEdits(r, edits));
}

export function assessBoqExportReadiness(input: {
  provenance: BoqExportProvenance;
  rows: BoqExportSourceRow[];
  reviewedEdits?: BoqReviewedEditInput[];
  mode: BoqExportMode;
}): {
  allowed: boolean;
  blockers: BoqExportReadinessBlocker[];
  labelledDraftPreview: boolean;
  auraNarrativeFacts: string[];
} {
  const blockers: BoqExportReadinessBlocker[] = [];
  const views = buildBoqExportRowViews({
    rows: input.rows,
    reviewedEdits: input.reviewedEdits,
  });

  if (input.provenance.status === 'SUPERSEDED' || input.provenance.supersededBy) {
    blockers.push('SOURCE_REVISION_SUPERSEDED');
  }
  if (input.provenance.hasNewerRevision) {
    blockers.push('SOURCE_REVISION_SUPERSEDED');
  }

  const unresolved = views.filter(
    (v) =>
      v.rowKind === 'ITEM' &&
      input.rows.find((r) => r.boqImportRowId === v.boqImportRowId)?.reviewState ===
        'REVIEW_REQUIRED' &&
      v.reviewedEdits.length === 0,
  );
  if (unresolved.length > 0) {
    blockers.push('REVIEW_INCOMPLETE');
    blockers.push('AMBIGUITY_UNRESOLVED');
  }

  const missingRequired = views.filter(
    (v) =>
      v.rowKind === 'ITEM' &&
      (v.quantity == null || !v.unit || !String(v.unit).trim()) &&
      v.reviewedEdits.length === 0 &&
      input.rows.find((r) => r.boqImportRowId === v.boqImportRowId)?.warnings.some((w) =>
        ['QUANTITY_MISSING', 'UNIT_MISSING'].includes(w),
      ),
  );
  if (missingRequired.length > 0 && input.mode === 'REVIEWED_FINAL') {
    blockers.push('MISSING_REQUIRED_REVIEW_VALUE');
  }

  const uniqueBlockers = [...new Set(blockers)];
  const draft = input.mode === 'DRAFT_PREVIEW';
  const allowed = draft ? !uniqueBlockers.includes('SOURCE_REVISION_SUPERSEDED') : uniqueBlockers.length === 0;

  // Draft may preview even with review incomplete — but never silently export superseded as current.
  const draftAllowed =
    draft && !uniqueBlockers.includes('SOURCE_REVISION_SUPERSEDED');

  return {
    allowed: input.mode === 'DRAFT_PREVIEW' ? draftAllowed : allowed,
    blockers: uniqueBlockers,
    labelledDraftPreview: draft,
    auraNarrativeFacts: [
      `BOQ export readiness mode=${input.mode}`,
      `Blockers: ${uniqueBlockers.join(', ') || 'none'}`,
      'Client sequence preserved from Row 99; Row100/101 internals excluded.',
      'Formulas retained as provenance text only — not recalculated.',
    ],
  };
}

/**
 * Rebuild XLSX from canonical Row99 sequence + reviewed overlays.
 * Formula text is stored as provenance evidence text, not executed.
 */
export function buildReviewedBoqXlsxWorkbook(input: {
  provenance: BoqExportProvenance;
  rows: BoqExportRowView[];
  mode: BoqExportMode;
}): {
  bytes: Uint8Array;
  sheetOrder: string[];
  formulasExecuted: false;
  macrosExecuted: false;
  contentFingerprintSha256: string;
} {
  const wb = XLSX.utils.book_new();
  const sheetOrder =
    input.provenance.sheetOrder.length > 0
      ? input.provenance.sheetOrder
      : [...new Set(input.rows.map((r) => r.sheetName))];

  for (const sheetName of sheetOrder) {
    const sheetRows = input.rows
      .filter((r) => r.sheetName === sheetName)
      .sort((a, b) => a.originalRowOrder - b.originalRowOrder);

    const aoa: Array<Array<string | number | null>> = [
      ['Item', 'Description', 'Unit', 'Qty', 'Export value', 'Source formula (provenance)'],
    ];
    if (input.mode === 'DRAFT_PREVIEW') {
      aoa.unshift([`DRAFT PREVIEW — not a final reviewed BOQ`, '', '', '', '', '']);
    }
    aoa.push([
      `Source: ${input.provenance.originalFilename}`,
      `Rev ${input.provenance.importVersion}`,
      input.provenance.revisionLabel ?? '',
      `hash:${input.provenance.fileHashSha256.slice(0, 12)}`,
      '',
      '',
    ]);

    // Reconstruct sparse commercial sequence by original row number gaps as spacers.
    let lastRowNum = 0;
    for (const r of sheetRows) {
      while (lastRowNum > 0 && r.originalRowNumber > lastRowNum + 1) {
        aoa.push(['', '', '', '', '', '']);
        lastRowNum += 1;
      }
      if (r.rowKind === 'SPACER') {
        aoa.push(['', '', '', '', '', '']);
      } else if (r.rowKind === 'SECTION' || r.rowKind === 'HEADER') {
        aoa.push([
          r.itemCode ?? '',
          r.description ?? r.sectionLabel ?? '',
          '',
          '',
          r.exportDisplayValue ?? '',
          r.formulaProvenance ? `'${r.formulaProvenance}` : '',
        ]);
      } else {
        aoa.push([
          r.itemCode ?? '',
          r.description ?? '',
          r.unit ?? '',
          r.quantity,
          r.exportDisplayValue ?? '',
          // Leading apostrophe-style text marker via string — SheetJS stores as string, not formula.
          r.formulaProvenance ? `SOURCE_FORMULA:${r.formulaProvenance}` : '',
        ]);
      }
      lastRowNum = r.originalRowNumber;
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Sheet');
  }

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const bytes = new Uint8Array(out);
  const contentFingerprintSha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    bytes,
    sheetOrder,
    formulasExecuted: false,
    macrosExecuted: false,
    contentFingerprintSha256,
  };
}

/** Customer-safe HTML for Chromium PDF — no supplier/cost/margin internals. */
export function buildReviewedBoqPdfHtml(input: {
  provenance: BoqExportProvenance;
  rows: BoqExportRowView[];
  mode: BoqExportMode;
}): { html: string; labelledDraftPreview: boolean } {
  const draft = input.mode === 'DRAFT_PREVIEW';
  const sheetOrder =
    input.provenance.sheetOrder.length > 0
      ? input.provenance.sheetOrder
      : [...new Set(input.rows.map((r) => r.sheetName))];

  const sections = sheetOrder
    .map((sheetName) => {
      const sheetRows = input.rows
        .filter((r) => r.sheetName === sheetName)
        .sort((a, b) => a.originalRowOrder - b.originalRowOrder);
      const body = sheetRows
        .map((r) => {
          const reviewed = r.reviewedEdits.length
            ? `<span class="reviewed">reviewed</span>`
            : '';
          return `<tr>
            <td>${r.originalRowNumber}</td>
            <td>${escapeHtml(r.rowKind)}</td>
            <td>${escapeHtml(r.itemCode ?? '')}</td>
            <td>${escapeHtml(r.description ?? r.sectionLabel ?? '')}</td>
            <td>${escapeHtml(r.unit ?? '')}</td>
            <td>${r.quantity ?? ''}</td>
            <td>${escapeHtml(r.exportDisplayValue ?? '')} ${reviewed}</td>
            <td>${escapeHtml(r.formulaProvenance ? `SOURCE_FORMULA:${r.formulaProvenance}` : '')}</td>
          </tr>`;
        })
        .join('');
      return `<h2>${escapeHtml(sheetName)}</h2>
        <table>
          <thead><tr>
            <th>Row</th><th>Kind</th><th>Code</th><th>Description</th>
            <th>Unit</th><th>Qty</th><th>Export value</th><th>Formula provenance</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>`;
    })
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>Reviewed BOQ Export</title>
    <style>
      body{font-family:Georgia,serif;color:#111;margin:24px}
      h1{font-size:20px;margin:0 0 8px}
      .meta{font-size:12px;color:#333;margin-bottom:16px}
      .banner{background:#fff3cd;border:1px solid #c9a227;padding:8px 12px;margin-bottom:16px;font-weight:600}
      h2{font-size:16px;margin:20px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#f5f5f5}
      .reviewed{color:#0b5;font-size:10px;margin-left:4px}
    </style></head><body>
    ${draft ? `<div class="banner">DRAFT PREVIEW — not a final reviewed BOQ</div>` : ''}
    <h1>Reviewed Bill of Quantities</h1>
    <div class="meta">
      Source: ${escapeHtml(input.provenance.originalFilename)} ·
      Revision v${input.provenance.importVersion}
      ${input.provenance.revisionLabel ? ` (${escapeHtml(input.provenance.revisionLabel)})` : ''} ·
      Import ${escapeHtml(input.provenance.boqImportId)} ·
      Hash ${escapeHtml(input.provenance.fileHashSha256.slice(0, 16))}…
    </div>
    ${sections}
    <p class="meta">Client commercial sequence preserved. Formulas shown as source provenance only (not recalculated). Internal supplier costs / margins excluded.</p>
    </body></html>`;

  return { html, labelledDraftPreview: draft };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function projectClientSafeBoqExport(input: {
  mode: BoqExportMode;
  provenance: BoqExportProvenance;
  rows: BoqExportRowView[];
}): BoqClientSafeExportProjection {
  return {
    mode: input.mode,
    labelledDraftPreview: input.mode === 'DRAFT_PREVIEW',
    provenance: {
      boqImportId: input.provenance.boqImportId,
      originalFilename: input.provenance.originalFilename,
      revisionLabel: input.provenance.revisionLabel,
      importVersion: input.provenance.importVersion,
      fileHashSha256Prefix: input.provenance.fileHashSha256.slice(0, 16),
    },
    sheetOrder: input.provenance.sheetOrder,
    rows: input.rows.map((r) => ({
      sheetName: r.sheetName,
      originalRowNumber: r.originalRowNumber,
      rowKind: r.rowKind,
      sectionLabel: r.sectionLabel,
      itemCode: r.itemCode,
      description: r.description,
      unit: r.unit,
      quantity: r.quantity,
      exportDisplayValue: r.exportDisplayValue,
      hasReviewedEdit: r.reviewedEdits.length > 0,
      formulaProvenancePresent: Boolean(r.formulaProvenance),
    })),
    excludesSupplierCost: true,
    excludesMarginGp: true,
    excludesSplitPurchaseInternals: true,
    excludesMatchConfidence: true,
  };
}

export function assertNoBoqReviewedExportClientLeak(payload: unknown, path = 'root'): void {
  if (payload == null || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertNoBoqReviewedExportClientLeak(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  const forbidden = [
    'boqReviewedExportInternal',
    'unitPriceCents',
    'supplierSubtotalCents',
    'expectedSupplierCostCents',
    'cheapestEligibleCostCents',
    'splitPurchaseProposal',
    'boqSupplierComparison',
    'matchConfidenceScore',
    'marginCents',
    'grossProfitCents',
    'markupPercent',
    'row96CostModel',
    'row97Intelligence',
  ];
  for (const key of forbidden) {
    if (key in obj && obj[key] != null) {
      throw new Error(`BOQ reviewed export internal field leaked at ${path}.${key}`);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      assertNoBoqReviewedExportClientLeak(value, `${path}.${key}`);
    }
  }
}

export function canManageBoqReviewedExport(input: {
  roleName?: string | null;
  permissions?: string[] | null;
}): boolean {
  const role = (input.roleName ?? '').toLowerCase();
  if (role === 'technician' || role === 'client' || role.includes('tech')) return false;
  const perms = input.permissions ?? [];
  if (perms.includes('*') || perms.includes('finance:write')) return true;
  return ['owner', 'company owner', 'admin', 'manager', 'office'].includes(role);
}

export function assertRow103NotStarted(started: boolean): void {
  if (started) throw new Error('Row 103+ must not start during Row 102');
}

export function assertRow102SafetyGates(input: {
  row92AutomationEnabled: boolean;
  row103Started?: boolean;
  xeroWrites?: number;
  customerSends?: number;
  productionWrites?: number;
  purchaseOrdersCreated?: number;
}): {
  row92Off: true;
  row103NotStarted: true;
  xeroWrites: 0;
  customerSends: 0;
  productionWrites: 0;
  purchaseOrdersCreated: 0;
} {
  assertRow92GlobalAutomationDisabled(input.row92AutomationEnabled);
  assertRow103NotStarted(input.row103Started === true);
  if ((input.xeroWrites ?? 0) !== 0) throw new Error('Row 102 requires Xero writes = 0');
  if ((input.customerSends ?? 0) !== 0) throw new Error('Row 102 requires customer sends = 0');
  if ((input.productionWrites ?? 0) !== 0) throw new Error('Row 102 requires production writes = 0');
  if ((input.purchaseOrdersCreated ?? 0) !== 0) {
    throw new Error('Row 102 must not create purchase orders');
  }
  return {
    row92Off: true,
    row103NotStarted: true,
    xeroWrites: 0,
    customerSends: 0,
    productionWrites: 0,
    purchaseOrdersCreated: 0,
  };
}

export function assertRoyalCapeUnchangedForRow102(input: {
  totalCents: number;
  pricingPresentationMode?: string | null;
}): void {
  if (input.totalCents !== BOQ_REVIEWED_EXPORT_ROYAL_CAPE.expectedTotalCents) {
    throw new Error(`Royal Cape total changed: ${input.totalCents}`);
  }
  if (
    input.pricingPresentationMode != null &&
    input.pricingPresentationMode !== BOQ_REVIEWED_EXPORT_ROYAL_CAPE.expectedPricingMode
  ) {
    throw new Error('Royal Cape pricing mode changed');
  }
}

export function boqExportIdempotencyKey(input: {
  boqImportId: string;
  format: BoqExportFormat;
  mode: BoqExportMode;
  contentFingerprintSha256: string;
}): string {
  return `${input.boqImportId}:${input.format}:${input.mode}:${input.contentFingerprintSha256}`;
}

/** Map Row99 canonical rows into export source rows (fixture helper). */
export function canonicalRowsToExportSource(
  rows: BoqCanonicalImportRow[],
  idPrefix = 'row',
): BoqExportSourceRow[] {
  return rows.map((r, i) => ({
    boqImportRowId: `${idPrefix}-${i}`,
    sheetName: r.sheetName,
    sheetOrder: r.sheetOrder,
    originalRowNumber: r.originalRowNumber,
    originalRowOrder: r.originalRowOrder,
    sectionLabel: r.sectionLabel,
    rowKind: r.rowKind,
    itemCode: r.itemCode,
    description: r.description,
    unit: r.unit,
    quantity: r.quantity,
    rawValue: r.rawValue,
    displayValue: r.displayValue,
    formulaText: r.formulaText,
    cellAddress: r.cellAddress,
    reviewState: r.reviewState,
    warnings: r.warnings,
  }));
}
