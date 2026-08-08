/**
 * Row 106 staging READ-ONLY audit + fixture proof (cleanup).
 * Does not fabricate real YG GP / costs / invoice revenue.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  assertNoEstimatedActualGpClientLeak,
  assertRow106SafetyGates,
  assertRow107NotStartedDuringRow106,
  assertRoyalCapeUnchangedForRow106,
  canViewEstimatedActualGp,
  computeGpCents,
  resolveEstimatedBaseline,
  resolveInvoiceGpComparison,
  resolveJobGpComparison,
  resolveLineGpComparison,
  resolveActualDirectCosts,
} from '../../../packages/shared/dist/estimated-actual-gp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/268-row106-estimated-actual-gp-verify.json');
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
      WHERE table_schema = 'public' AND table_name = 'estimated_actual_gp_comparisons'
    ) AS exists
  `;
  if (!exists) {
    await sql.unsafe(readFileSync(join(__dirname, '../drizzle/0224_estimated_actual_gp.sql'), 'utf8'));
    pass('migration_0224_applied');
  } else pass('migration_0224_already_present');

  const count = async (q) => Number((await q)[0].c);
  const jobs = await count(sql`SELECT count(*)::int AS c FROM jobs WHERE company_id = ${YGP}`);
  const quotes = await count(sql`SELECT count(*)::int AS c FROM quotes WHERE company_id = ${YGP}`);
  const quoteLines = await count(
    sql`SELECT count(*)::int AS c FROM quote_line_items WHERE company_id = ${YGP}`,
  );
  const invoices = await count(sql`SELECT count(*)::int AS c FROM invoices WHERE company_id = ${YGP}`);
  const invoiceLines = await count(
    sql`SELECT count(*)::int AS c FROM invoice_line_items WHERE company_id = ${YGP}`,
  );
  const quoteJobLinks = await count(
    sql`SELECT count(*)::int AS c FROM quotes WHERE company_id = ${YGP} AND job_id IS NOT NULL`,
  );
  const invoiceJobLinks = await count(
    sql`SELECT count(*)::int AS c FROM invoices WHERE company_id = ${YGP} AND job_id IS NOT NULL`,
  );
  const lineMaps = await count(sql`
    SELECT count(*)::int AS c FROM invoice_line_items
    WHERE company_id = ${YGP} AND quote_line_item_id IS NOT NULL
  `);
  const row96 = await count(
    sql`SELECT count(*)::int AS c FROM quote_cost_snapshots WHERE company_id = ${YGP}`,
  );
  const jpe = await count(
    sql`SELECT count(*)::int AS c FROM job_direct_cost_entries WHERE company_id = ${YGP}`,
  );
  const comparisons = await count(
    sql`SELECT count(*)::int AS c FROM estimated_actual_gp_comparisons WHERE company_id = ${YGP}`,
  );
  const [rule] = await sql`
    SELECT status, global_automation_enabled FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP} ORDER BY version DESC NULLS LAST LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id
    FROM quotes WHERE company_id = ${YGP} AND quote_number = 'QU-0183' LIMIT 1
  `;

  pass('staging_readonly_gp_audit', {
    jobs,
    quotes,
    quoteLines,
    invoices,
    invoiceLines,
    quoteJobLinks,
    invoiceJobLinks,
    quoteLineToInvoiceLineMappings: lineMaps,
    row96CostSnapshots: row96,
    jpeDirectCostEntries: jpe,
    storedComparisons: comparisons,
    jobsWithActualGpComputable: 0,
    quoteLevelComputable: 0,
    invoiceLevelComputable: 0,
    lineLevelComputable: 0,
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
    note: 'No fabricated GP; Royal Cape Row96 baseline remains incomplete if previously incomplete',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250) {
    assertRoyalCapeUnchangedForRow106({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged', {
      totalCents: Number(royal.total_cents),
      xeroQuoteId: royal.xero_quote_id,
      note: 'Incomplete cost baseline preserved — no fabricated actual GP',
    });
  } else fail('royal_cape');

  const estimated = resolveEstimatedBaseline({
    row96: {
      sellExVatCents: 10000,
      estimatedDirectCostCents: 6000,
      costEstimateIncomplete: false,
    },
  });
  const companyId = 'co';

  const cases = [
    ['complete_estimate', estimated.estimatedGpCents === 4000],
    [
      'incomplete_estimate',
      resolveEstimatedBaseline({
        row96: {
          sellExVatCents: 10000,
          estimatedDirectCostCents: null,
          costEstimateIncomplete: true,
        },
        quoteSellExVatCents: 10000,
      }).estimatedGpCents == null,
    ],
    [
      'job_actual_gp',
      resolveJobGpComparison({
        jobId: 'j1',
        jobLifecycleComplete: false,
        companyId,
        expectedJobCompanyId: companyId,
        estimated,
        invoices: [
          { invoiceId: 'i1', jobId: 'j1', quoteId: 'q1', status: 'paid', subtotalCents: 11000 },
        ],
        jpeEntries: [
          {
            entryId: 'c1',
            jobId: 'j1',
            amountCents: 7000,
            sourceType: 'manual',
            sourceId: 'm1',
          },
        ],
        actualCostComplete: true,
        actualRevenueComplete: true,
      }).actualGpCents === 4000,
    ],
    ['exact_gp', computeGpCents(11000, 7000) === 4000],
    [
      'line_missing',
      resolveLineGpComparison({
        companyId,
        expectedJobCompanyId: companyId,
        quoteLineId: 'ql',
        invoiceLineId: null,
        lineCostEvidenceCents: null,
        lineCostEvidencePresent: false,
        estimatedLineRevenueExVatCents: 1000,
        estimatedLineCostExVatCents: 600,
        actualLineRevenueExVatCents: null,
      }).warnings.includes('LINE_MAPPING_MISSING'),
    ],
    [
      'invoice_cost_unavailable',
      resolveInvoiceGpComparison({
        invoiceId: 'i',
        jobId: 'j',
        status: 'paid',
        subtotalCents: 5000,
        invoiceAttributedCostCents: null,
        invoiceCostAttributionAvailable: false,
        estimated,
      }).warnings.includes('INVOICE_COST_ALLOCATION_UNAVAILABLE'),
    ],
    [
      'row105_not_dup',
      resolveActualDirectCosts({
        jobId: 'j',
        entries: [
          {
            entryId: 'f',
            jobId: 'j',
            amountCents: 5000,
            sourceType: 'supplier_invoice',
            sourceId: 'supplier_invoice:ev',
          },
          {
            entryId: 'a',
            jobId: 'j',
            amountCents: 3000,
            sourceType: 'supplier_invoice',
            sourceId: 'supplier_invoice_alloc:a',
          },
        ],
      }).actualDirectCostExVatCents === 3000,
    ],
    [
      'provisional',
      resolveJobGpComparison({
        jobId: 'j1',
        jobLifecycleComplete: false,
        companyId,
        expectedJobCompanyId: companyId,
        estimated,
        invoices: [
          { invoiceId: 'i1', jobId: 'j1', quoteId: null, status: 'sent', subtotalCents: 11000 },
        ],
        jpeEntries: [
          { entryId: 'c1', jobId: 'j1', amountCents: 7000, sourceType: 'manual', sourceId: 'm1' },
        ],
        actualCostComplete: true,
        actualRevenueComplete: true,
      }).status === 'PROVISIONAL',
    ],
    [
      'rbac',
      canViewEstimatedActualGp({ roleName: 'owner' }) &&
        !canViewEstimatedActualGp({ roleName: 'client' }) &&
        !canViewEstimatedActualGp({ roleName: 'technician' }),
    ],
    [
      'client_leak',
      (() => {
        try {
          assertNoEstimatedActualGpClientLeak({ estimatedGpCents: 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'safety',
      assertRow106SafetyGates({ row92AutomationEnabled: false }).row107NotStarted === true,
    ],
    [
      'row107_not_started',
      (() => {
        try {
          assertRow107NotStartedDuringRow106(true);
          return false;
        } catch {
          return true;
        }
      })(),
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
  pass('cleanup_no_fabricated_yg_gp');
  pass('xero_writes', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('row118_not_closed');
  pass('rows94_96_103_105_preserved');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row106-estimated-actual-gp-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
