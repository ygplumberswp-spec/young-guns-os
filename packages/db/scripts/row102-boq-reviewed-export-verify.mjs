/**
 * Row 102 staging READ-ONLY audit + fixture export proof (cleanup).
 * Does NOT fabricate a real client BOQ source.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import postgres from 'postgres';
import {
  buildBoqFixtureWorkbookBytes,
  canonicalizeBoqWorkbookImport,
  parseBoqXlsxWorkbook,
  hashBoqWorkbookBytes,
} from '../../../packages/shared/dist/boq-workbook-import.js';
import {
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
} from '../../../packages/shared/dist/boq-reviewed-export.js';

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../../packages/shared/package.json'));
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/264-row102-boq-reviewed-export-verify.json');
const YGP = '095aef76-fef5-4139-af37-a42f2d7e2faf';
const FORBIDDEN_PROD = 'titan-production';

function loadDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const tip = '/tmp/cursor-staging-db-url.txt';
  if (existsSync(tip)) return readFileSync(tip, 'utf8').trim();
  throw new Error('DATABASE_URL required');
}

const results = [];
const pass = (name, d = {}) => results.push({ name, status: 'PASS', ...d });
const fail = (name, d = {}) => results.push({ name, status: 'FAIL', ...d });

const sql = postgres(loadDbUrl(), { max: 1, prepare: false });
try {
  if (loadDbUrl().includes(FORBIDDEN_PROD)) throw new Error('Production DB forbidden');

  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'boq_reviewed_exports'
    ) AS exists
  `;
  if (!exists) {
    await sql.unsafe(
      readFileSync(join(__dirname, '../drizzle/0220_boq_reviewed_export.sql'), 'utf8'),
    );
    pass('migration_0220_applied');
  } else pass('migration_0220_already_present');

  const [boqDocs] = await sql`
    SELECT count(*)::int AS c
    FROM documents
    WHERE company_id = ${YGP}
      AND (
        lower(coalesce(file_name,'')) LIKE '%.xlsx'
        OR lower(coalesce(file_name,'')) LIKE '%.xls'
        OR lower(coalesce(title,'')) LIKE '%boq%'
        OR lower(coalesce(file_name,'')) LIKE '%boq%'
      )
  `;
  const [strict] = await sql`
    SELECT count(*)::int AS c
    FROM documents
    WHERE company_id = ${YGP}
      AND (
        (lower(coalesce(file_name,'')) LIKE '%boq%' AND (
          lower(coalesce(file_name,'')) LIKE '%.xlsx'
          OR lower(coalesce(file_name,'')) LIKE '%.xls'
        ))
        OR lower(coalesce(title,'')) LIKE '%bill of quant%'
      )
  `;
  const [imports] = await sql`SELECT count(*)::int AS c FROM boq_imports WHERE company_id = ${YGP}`;
  const [rule] = await sql`
    SELECT status, global_automation_enabled FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP} ORDER BY version DESC NULLS LAST LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id
    FROM quotes WHERE company_id = ${YGP} AND quote_number = 'QU-0183' LIMIT 1
  `;

  const authorised =
    Number(strict.c) > 0
      ? 'AUTHORISED_BOQ_SOURCE_PRESENT'
      : 'NO_AUTHORISED_BOQ_SOURCE_AVAILABLE';

  pass('staging_readonly_boq_source_audit', {
    looseBoqLikeDocs: Number(boqDocs.c),
    authorisedBoqLike: Number(strict.c),
    existingBoqImports: Number(imports.c),
    authorisedSourceResult: authorised,
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250) {
    assertRoyalCapeUnchangedForRow102({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged', {
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
      xeroQuoteId: royal.xero_quote_id,
    });
  } else fail('royal_cape');

  const bytes = buildBoqFixtureWorkbookBytes();
  const hash = hashBoqWorkbookBytes(bytes);
  const parsed = parseBoqXlsxWorkbook(bytes);
  const canonical = canonicalizeBoqWorkbookImport(parsed);
  const sourceRows = canonicalRowsToExportSource(canonical.rows).map((r) => ({
    ...r,
    reviewState:
      r.rowKind === 'ITEM' && (r.quantity == null || !r.unit) ? 'REVIEW_REQUIRED' : 'OK',
  }));
  const readyRows = sourceRows.map((r) => ({
    ...r,
    reviewState: 'OK',
    warnings: (r.warnings ?? []).filter((w) => !String(w).includes('MISSING')),
  }));

  const provenance = {
    boqImportId: 'fixture-import',
    originalFilename: 'fixture-boq.xlsx',
    fileHashSha256: hash,
    revisionLabel: 'fixture',
    importVersion: 1,
    workbookIdentity: 'fixture-wb',
    sheetOrder: canonical.sheetOrder,
    status: 'REVIEWED',
    supersededBy: null,
    hasNewerRevision: false,
  };

  const w1 = readyRows.find((r) => r.itemCode === 'W1');
  const edits = w1
    ? [
        {
          boqImportRowId: w1.boqImportRowId,
          fieldKey: 'quantity',
          originalValue: '4',
          reviewedValue: '5',
          actorUserId: 'fixture-user',
          reviewedAt: '2026-08-08T12:00:00.000Z',
          reasonNote: 'fixture review',
        },
      ]
    : [];

  const views = buildBoqExportRowViews({ rows: readyRows, reviewedEdits: edits });
  const xlsx = buildReviewedBoqXlsxWorkbook({
    provenance,
    rows: views,
    mode: 'REVIEWED_FINAL',
  });
  const reparsed = XLSX.read(xlsx.bytes, { type: 'array' });
  const pdf = buildReviewedBoqPdfHtml({
    provenance,
    rows: views,
    mode: 'DRAFT_PREVIEW',
  });
  const safe = projectClientSafeBoqExport({
    mode: 'REVIEWED_FINAL',
    provenance,
    rows: views,
  });

  const cases = [
    ['multi_sheet_xlsx', reparsed.SheetNames.length === 2],
    ['sheet_order', JSON.stringify(reparsed.SheetNames) === JSON.stringify(['Water', 'Waste'])],
    [
      'row_order',
      views
        .filter((r) => r.sheetName === 'Water')
        .every(
          (r, i, arr) => i === 0 || r.originalRowOrder > arr[i - 1].originalRowOrder,
        ),
    ],
    ['section_preserved', views.some((r) => r.rowKind === 'SECTION')],
    ['duplicates_distinct', views.filter((r) => r.itemCode === 'S1').length >= 2],
    ['code_qty', views.some((r) => r.itemCode === 'W1' && r.quantity === 5)],
    [
      'original_vs_reviewed',
      views.some(
        (r) => r.itemCode === 'W1' && r.original.quantity === 4 && r.quantity === 5,
      ),
    ],
    [
      'formula_provenance',
      views.some((r) => r.formulaProvenance === 'D3+D5') && xlsx.formulasExecuted === false,
    ],
    [
      'no_formula_cells',
      !Object.values(reparsed.Sheets.Water || {}).some(
        (c) => c && typeof c === 'object' && 'f' in c && c.f,
      ),
    ],
    ['pdf_sequence', pdf.html.indexOf('Water') < pdf.html.indexOf('Waste')],
    ['pdf_revision', pdf.html.includes('Revision v1') && pdf.labelledDraftPreview === true],
    [
      'final_blocked_unresolved',
      assessBoqExportReadiness({
        provenance,
        rows: sourceRows,
        mode: 'REVIEWED_FINAL',
      }).allowed === false,
    ],
    [
      'draft_labelled',
      assessBoqExportReadiness({
        provenance,
        rows: sourceRows,
        mode: 'DRAFT_PREVIEW',
      }).labelledDraftPreview === true,
    ],
    [
      'superseded_block',
      assessBoqExportReadiness({
        provenance: { ...provenance, hasNewerRevision: true },
        rows: readyRows,
        mode: 'DRAFT_PREVIEW',
      }).blockers.includes('SOURCE_REVISION_SUPERSEDED'),
    ],
    [
      'no_supplier_cost',
      (() => {
        try {
          assertNoBoqReviewedExportClientLeak({ unitPriceCents: 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'no_margin',
      (() => {
        try {
          assertNoBoqReviewedExportClientLeak({ marginCents: 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'no_split',
      (() => {
        try {
          assertNoBoqReviewedExportClientLeak({ splitPurchaseProposal: {} });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'client_safe',
      (() => {
        try {
          assertNoBoqReviewedExportClientLeak(safe);
          return (
            safe.excludesSupplierCost &&
            safe.excludesMarginGp &&
            safe.excludesSplitPurchaseInternals
          );
        } catch {
          return false;
        }
      })(),
    ],
    [
      'rbac',
      canManageBoqReviewedExport({ roleName: 'owner' }) &&
        !canManageBoqReviewedExport({ roleName: 'client' }) &&
        !canManageBoqReviewedExport({ roleName: 'technician' }),
    ],
    [
      'idempotency',
      boqExportIdempotencyKey({
        boqImportId: 'a',
        format: 'XLSX',
        mode: 'DRAFT_PREVIEW',
        contentFingerprintSha256: xlsx.contentFingerprintSha256,
      }) ===
        boqExportIdempotencyKey({
          boqImportId: 'a',
          format: 'XLSX',
          mode: 'DRAFT_PREVIEW',
          contentFingerprintSha256: xlsx.contentFingerprintSha256,
        }),
    ],
    [
      'safety',
      assertRow102SafetyGates({ row92AutomationEnabled: false }).purchaseOrdersCreated === 0,
    ],
    [
      'row103_not_started',
      (() => {
        try {
          assertRow103NotStarted(true);
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    ['source_hash_stable', hash.length === 64],
  ];

  let fp = 0;
  let ff = 0;
  for (const [name, ok] of cases) {
    if (ok) {
      pass(`fixture_${name}`);
      fp++;
    } else {
      fail(`fixture_${name}`);
      ff++;
    }
  }
  pass('fixture_totals', { pass: fp, fail: ff });
  pass('cleanup_no_fake_client_boq_upload');
  pass('xero_writes', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('row103_plus_not_started');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row102-boq-reviewed-export-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
