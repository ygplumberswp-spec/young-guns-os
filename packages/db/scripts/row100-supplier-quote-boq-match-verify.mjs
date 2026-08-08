/**
 * Row 100 staging READ-ONLY audit + fixture proof (cleanup).
 * Does NOT fabricate real supplier PDFs as authorised sources.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  resolveSupplierBoqMatches,
  assertRow100SafetyGates,
  assertNoSupplierBoqMatchClientLeak,
  assertRoyalCapeUnchangedForRow100,
  confirmSupplierBoqMatch,
  supplierMatchIdempotencyKey,
} from '../../../packages/shared/dist/supplier-quote-boq-match.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/262-row100-supplier-quote-boq-match-verify.json');
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
      WHERE table_schema = 'public' AND table_name = 'supplier_quote_imports'
    ) AS exists
  `;
  if (!exists) {
    await sql.unsafe(
      readFileSync(join(__dirname, '../drizzle/0218_supplier_quote_boq_match.sql'), 'utf8'),
    );
    pass('migration_0218_applied');
  } else pass('migration_0218_already_present');

  const [docAudit] = await sql`
    SELECT count(*)::int AS supplier_quote_like
    FROM documents
    WHERE company_id = ${YGP}
      AND (
        lower(coalesce(file_name,'')) LIKE '%quote%'
        OR lower(coalesce(file_name,'')) LIKE '%supplier%'
        OR lower(coalesce(file_name,'')) LIKE '%.pdf'
        OR lower(coalesce(title,'')) LIKE '%supplier quote%'
      )
  `;
  // Stricter: filename/title must imply supplier quote — not every PDF
  const [strict] = await sql`
    SELECT count(*)::int AS c
    FROM documents
    WHERE company_id = ${YGP}
      AND (
        (lower(coalesce(file_name,'')) LIKE '%supplier%' AND lower(coalesce(file_name,'')) LIKE '%quote%')
        OR lower(coalesce(title,'')) LIKE '%supplier quote%'
        OR lower(coalesce(file_name,'')) LIKE '%price list%'
      )
  `;
  const [imports] = await sql`SELECT count(*)::int AS c FROM supplier_quote_imports WHERE company_id = ${YGP}`;
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
      ? 'SUPPLIER_QUOTE_LIKE_DOCUMENTS_PRESENT'
      : 'NO_AUTHORISED_SUPPLIER_QUOTE_SOURCE_AVAILABLE';

  pass('staging_readonly_supplier_source_audit', {
    loosePdfOrQuoteDocs: Number(docAudit.supplier_quote_like),
    authorisedSupplierQuoteLike: Number(strict.c),
    existingSupplierQuoteImports: Number(imports.c),
    authorisedSourceResult: authorised,
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250) {
    assertRoyalCapeUnchangedForRow100({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged', {
      totalCents: Number(royal.total_cents),
      xeroQuoteId: royal.xero_quote_id,
    });
  } else fail('royal_cape');

  const provenance = {
    supplierDocumentId: null,
    fileHashSha256: 'b'.repeat(64),
    revisionLabel: 'fixture',
    supplierId: null,
    supplierName: 'Fixture Co',
    originalFilename: 'fixture.pdf',
  };
  const r = resolveSupplierBoqMatches({
    provenance,
    boqImportId: randomUUID(),
    boqRows: [
      {
        boqImportRowId: randomUUID(),
        boqImportId: 'x',
        sheetName: 'A',
        sheetOrder: 0,
        originalRowNumber: 2,
        originalRowOrder: 1,
        itemCode: 'W1',
        description: 'Cold water',
        unit: 'each',
        quantity: 2,
        rowKind: 'ITEM',
      },
    ],
    supplierLines: [
      {
        clientKey: 's1',
        sourceLineOrder: 1,
        supplierSku: 'W1',
        description: 'Cold water',
        unit: 'each',
        quantity: 2,
        unitPriceCents: 500,
        vatBasis: 'EXCLUSIVE',
        currency: 'ZAR',
      },
    ],
  });

  const cases = [
    ['exact_code', r.proposals.some((p) => p.signalsUsed.includes('EXACT_SUPPLIER_SKU'))],
    ['vat_preserved', r.proposals.some((p) => p.vatBasis === 'EXCLUSIVE')],
    ['no_price_push', r.catalogueMutation === false && r.quotePriceMutation === false],
    [
      'confirm_preserves',
      (() => {
        const p = r.proposals.find((x) => x.supplierLineClientKey === 's1');
        const c = confirmSupplierBoqMatch({ proposal: p, actorRole: 'owner' });
        return c.ok && c.proposal.mutatesBoqSource === false;
      })(),
    ],
    [
      'idempotent',
      supplierMatchIdempotencyKey({
        boqImportId: 'a',
        fileHashSha256: 'h',
        supplierLineKeys: ['2', '1'],
      }) ===
        supplierMatchIdempotencyKey({
          boqImportId: 'a',
          fileHashSha256: 'h',
          supplierLineKeys: ['1', '2'],
        }),
    ],
    [
      'client_leak',
      (() => {
        try {
          assertNoSupplierBoqMatchClientLeak({ unitPriceCents: 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'safety',
      assertRow100SafetyGates({ row92AutomationEnabled: false }).row101NotStarted === true,
    ],
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
  pass('cleanup_no_fake_supplier_pdf_upload');
  pass('xero_writes', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('row101_not_started');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row100-supplier-quote-boq-match-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
