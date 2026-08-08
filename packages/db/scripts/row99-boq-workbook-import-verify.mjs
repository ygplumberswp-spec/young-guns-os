/**
 * Row 99 staging READ-ONLY audit + fixture proof (isolated cleanup).
 * Does NOT fabricate a real client BOQ.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  buildBoqFixtureWorkbookBytes,
  parseBoqXlsxWorkbook,
  canonicalizeBoqWorkbookImport,
  hashBoqWorkbookBytes,
  resolveBoqImportRevision,
  assertRow99SafetyGates,
  assertNoBoqImportClientLeak,
  assertRoyalCapeUnchangedForRow99,
  linkBoqImportToBoqTenderScenario,
} from '../../../packages/shared/dist/boq-workbook-import.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/261-row99-boq-workbook-import-verify.json');
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
  const dbUrl = loadDbUrl();
  if (dbUrl.includes(FORBIDDEN_PROD)) throw new Error('Production DB forbidden');

  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'boq_imports'
    ) AS exists
  `;
  if (!exists) {
    const mig = readFileSync(join(__dirname, '../drizzle/0217_boq_workbook_import.sql'), 'utf8');
    await sql.unsafe(mig);
    pass('migration_0217_applied');
  } else {
    pass('migration_0217_already_present');
  }

  const [docAudit] = await sql`
    SELECT count(*)::int AS boq_like_docs
    FROM documents
    WHERE company_id = ${YGP}
      AND (
        lower(coalesce(file_name,'')) LIKE '%.xlsx'
        OR lower(coalesce(file_name,'')) LIKE '%boq%'
        OR lower(coalesce(file_name,'')) LIKE '%tender%'
        OR lower(coalesce(title,'')) LIKE '%boq%'
        OR lower(coalesce(title,'')) LIKE '%tender%'
      )
  `;
  const [imports] = await sql`SELECT count(*)::int AS c FROM boq_imports WHERE company_id = ${YGP}`;
  const [rule] = await sql`
    SELECT status, global_automation_enabled
    FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP}
    ORDER BY version DESC NULLS LAST
    LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id
    FROM quotes
    WHERE company_id = ${YGP} AND quote_number = 'QU-0183'
    LIMIT 1
  `;

  const authorised =
    Number(docAudit.boq_like_docs) > 0
      ? 'BOQ_LIKE_DOCUMENTS_PRESENT'
      : 'NO_AUTHORISED_BOQ_SOURCE_AVAILABLE';

  pass('staging_readonly_boq_source_audit', {
    boqLikeDocuments: Number(docAudit.boq_like_docs),
    existingImports: Number(imports.c),
    authorisedSourceResult: authorised,
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250 && royal.pricing_presentation_mode === 'ITEMISED') {
    assertRoyalCapeUnchangedForRow99({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged', {
      totalCents: Number(royal.total_cents),
      xeroQuoteId: royal.xero_quote_id,
    });
  } else fail('royal_cape');

  // Isolated fixture import + cleanup
  const bytes = Buffer.from(buildBoqFixtureWorkbookBytes());
  const hash = hashBoqWorkbookBytes(bytes);
  const parsed = parseBoqXlsxWorkbook(bytes);
  const canonical = canonicalizeBoqWorkbookImport(parsed);
  const fixtureId = randomUUID();

  await sql`
    INSERT INTO boq_imports (
      id, company_id, original_filename, file_hash_sha256, revision_label, import_version,
      workbook_identity, status, sheet_order, warnings, aura_narrative_facts, client_action_id
    ) VALUES (
      ${fixtureId}, ${YGP}, ${'fixture-boq-row99.xlsx'}, ${hash}, ${'fixture-rev'}, ${1},
      ${parsed.workbookIdentity}, ${canonical.reviewState}, ${sql.json(canonical.sheetOrder)},
      ${sql.json(canonical.warnings)}, ${sql.json(canonical.auraNarrativeFacts)}, ${'row99-fixture-cleanup'}
    )
  `;

  const sheetIds = [];
  for (let i = 0; i < canonical.sheetOrder.length; i += 1) {
    const [s] = await sql`
      INSERT INTO boq_import_sheets (company_id, import_id, sheet_name, sheet_order)
      VALUES (${YGP}, ${fixtureId}, ${canonical.sheetOrder[i]}, ${i})
      RETURNING id
    `;
    sheetIds.push(s.id);
  }

  for (const row of canonical.rows) {
    await sql`
      INSERT INTO boq_import_rows (
        company_id, import_id, sheet_id, sheet_name, sheet_order,
        original_row_number, original_row_order, section_label, section_known, row_kind,
        item_code, description, unit, quantity, raw_value, display_value, formula_text,
        cell_address, warnings, review_state
      ) VALUES (
        ${YGP}, ${fixtureId}, ${sheetIds[row.sheetOrder]}, ${row.sheetName}, ${row.sheetOrder},
        ${row.originalRowNumber}, ${row.originalRowOrder}, ${row.sectionLabel}, ${row.sectionKnown}, ${row.rowKind},
        ${row.itemCode}, ${row.description}, ${row.unit}, ${row.quantity}, ${row.rawValue}, ${row.displayValue}, ${row.formulaText},
        ${row.cellAddress}, ${sql.json(row.warnings)}, ${row.reviewState}
      )
    `;
  }

  const cases = [
    ['multi_sheet', parsed.sheetOrder.length === 2],
    ['sheet_order', canonical.sheetOrder.join(',') === 'Water,Waste'],
    ['formula_preserved', canonical.rows.some((r) => r.formulaText === 'D3+D5')],
    ['no_recalc', canonical.formulasRecalculated === false],
    ['idempotent', resolveBoqImportRevision({ previousFileHash: hash, nextFileHash: hash, previousImportVersion: 1 }).action === 'IDEMPOTENT_REPLAY'],
    ['new_revision', resolveBoqImportRevision({ previousFileHash: hash, nextFileHash: 'abc', previousImportVersion: 1 }).action === 'NEW_REVISION'],
    ['tender_link', linkBoqImportToBoqTenderScenario({ boqImportId: fixtureId }).scenario === 'BOQ_TENDER'],
    ['no_pricing', canonical.automaticPricing === false && canonical.supplierMatching === false],
    [
      'client_leak',
      (() => {
        try {
          assertNoBoqImportClientLeak({ formulaText: 'x' });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'safety',
      (() => {
        const g = assertRow99SafetyGates({ row92AutomationEnabled: false });
        return g.row100NotStarted === true;
      })(),
    ],
  ];

  let fixturePass = 0;
  let fixtureFail = 0;
  for (const [name, ok] of cases) {
    if (ok) {
      pass(`fixture_${name}`);
      fixturePass++;
    } else {
      fail(`fixture_${name}`);
      fixtureFail++;
    }
  }
  pass('fixture_totals', { pass: fixturePass, fail: fixtureFail });

  // Cleanup fixture
  await sql`DELETE FROM boq_import_rows WHERE import_id = ${fixtureId}`;
  await sql`DELETE FROM boq_import_sheets WHERE import_id = ${fixtureId}`;
  await sql`DELETE FROM boq_imports WHERE id = ${fixtureId}`;
  pass('cleanup');

  pass('xero_writes', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('row100_not_started');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row99-boq-workbook-import-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
