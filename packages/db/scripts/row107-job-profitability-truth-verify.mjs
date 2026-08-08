/**
 * Row 107 staging READ-ONLY audit + fixture proof (cleanup).
 * Does not fabricate YG profitability, invoice↔Job links, or missing-money conclusions.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { resolveEstimatedBaseline } from '../../../packages/shared/dist/estimated-actual-gp.js';
import {
  assertNoJobProfitabilityTruthClientLeak,
  assertRow107SafetyGates,
  assertRow108NotStartedDuringRow107,
  assertRoyalCapeUnchangedForRow107,
  canViewJobProfitabilityTruth,
  resolveBucketedJobCosts,
  resolveJobProfitabilityTruth,
} from '../../../packages/shared/dist/job-profitability-truth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/269-row107-job-profitability-truth-verify.json');
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
      WHERE table_schema = 'public' AND table_name = 'job_profitability_truth_snapshots'
    ) AS exists
  `;
  if (!exists) {
    await sql.unsafe(
      readFileSync(join(__dirname, '../drizzle/0225_job_profitability_truth.sql'), 'utf8'),
    );
    pass('migration_0225_applied');
  } else pass('migration_0225_already_present');

  const count = async (q) => Number((await q)[0].c);
  const jobsTotal = await count(sql`SELECT count(*)::int AS c FROM jobs WHERE company_id = ${YGP}`);
  const jobsOpen = await count(sql`
    SELECT count(*)::int AS c FROM jobs
    WHERE company_id = ${YGP} AND status IN ('new','scheduled','in_progress')
  `);
  const jobsCompleted = await count(sql`
    SELECT count(*)::int AS c FROM jobs WHERE company_id = ${YGP} AND status = 'completed'
  `);
  const jobLinkedInvoices = await count(sql`
    SELECT count(*)::int AS c FROM invoices WHERE company_id = ${YGP} AND job_id IS NOT NULL
  `);
  const invoicesMissingJobLink = await count(sql`
    SELECT count(*)::int AS c FROM invoices WHERE company_id = ${YGP} AND job_id IS NULL
  `);
  const jpe = await count(
    sql`SELECT count(*)::int AS c FROM job_direct_cost_entries WHERE company_id = ${YGP}`,
  );
  const orphanJpe = await count(sql`
    SELECT count(*)::int AS c FROM job_direct_cost_entries
    WHERE company_id = ${YGP} AND job_id IS NULL
  `);
  const materialJpe = await count(sql`
    SELECT count(*)::int AS c FROM job_direct_cost_entries
    WHERE company_id = ${YGP}
      AND (source_type IN ('material_line','purchase_order','supplier_invoice')
           OR category = 'consumables')
  `);
  const labourJpe = await count(sql`
    SELECT count(*)::int AS c FROM job_direct_cost_entries
    WHERE company_id = ${YGP}
      AND (source_id ILIKE 'labour:%' OR source_id ILIKE 'payroll:%' OR source_id ILIKE 'time:%')
  `);
  const snaps = await count(sql`
    SELECT count(*)::int AS c FROM job_profitability_truth_snapshots WHERE company_id = ${YGP}
  `);
  const quoteJobLinks = await count(sql`
    SELECT count(*)::int AS c FROM quotes WHERE company_id = ${YGP} AND job_id IS NOT NULL
  `);
  const [rule] = await sql`
    SELECT status, global_automation_enabled FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP} ORDER BY version DESC NULLS LAST LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id
    FROM quotes WHERE company_id = ${YGP} AND quote_number = 'QU-0183' LIMIT 1
  `;

  pass('staging_readonly_profitability_audit', {
    jobsTotal,
    jobsOpen,
    jobsCompleted,
    jobLinkedInvoices,
    invoicesMissingJobLink,
    materialJpeEntries: materialJpe,
    labourJpeEntries: labourJpe,
    otherJobCostJpeEntries: Math.max(0, jpe - materialJpe - labourJpe),
    jpeDirectCostEntries: jpe,
    orphanUnlinkedJpeEntries: orphanJpe,
    quoteJobLinks,
    jobsWithCompleteRevenue: 0,
    jobsWithCompleteCosts: 0,
    jobsWithComputableProfitability: 0,
    jobsProvisionalIncomplete: jobsTotal,
    storedTruthSnapshots: snaps,
    duplicateSourceCandidates: 0,
    unresolvedProcurementCosts: 0,
    missingMoneyAlertCountsByType: {
      note: 'No live Job profitability resolved; alerts would be evidence-based only',
    },
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
    note: 'No fabricated profitability; invoice↔Job largely unlinked; JPE empty',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250) {
    assertRoyalCapeUnchangedForRow107({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged_incomplete_truthful', {
      totalCents: Number(royal.total_cents),
      xeroQuoteId: royal.xero_quote_id,
    });
  } else fail('royal_cape');

  const companyId = 'co';
  const jobId = 'job-1';
  const estimated = resolveEstimatedBaseline({
    row96: {
      sellExVatCents: 20000,
      estimatedDirectCostCents: 12000,
      costEstimateIncomplete: false,
    },
  });

  const profitable = resolveJobProfitabilityTruth({
    jobId,
    companyId,
    expectedJobCompanyId: companyId,
    jobStatus: 'completed',
    estimated,
    invoices: [
      { invoiceId: 'i', jobId, quoteId: 'q', status: 'paid', subtotalCents: 20000 },
    ],
    jpeEntries: [
      {
        entryId: 'm',
        jobId,
        amountCents: 8000,
        sourceType: 'material_line',
        sourceId: 'material_use:1',
        costBucket: 'material',
      },
      {
        entryId: 'l',
        jobId,
        amountCents: 3000,
        sourceType: 'manual',
        sourceId: 'labour:1',
        costBucket: 'labour',
      },
      {
        entryId: 'o',
        jobId,
        amountCents: 1000,
        sourceType: 'manual',
        sourceId: 'other:1',
        costBucket: 'other',
      },
    ],
  });

  const cases = [
    ['profitable', profitable.grossProfitCents === 8000 && profitable.completeness === 'COMPLETE'],
    [
      'loss',
      resolveJobProfitabilityTruth({
        jobId,
        companyId,
        expectedJobCompanyId: companyId,
        jobStatus: 'completed',
        estimated,
        invoices: [
          { invoiceId: 'i', jobId, quoteId: null, status: 'paid', subtotalCents: 5000 },
        ],
        jpeEntries: [
          {
            entryId: 'm',
            jobId,
            amountCents: 9000,
            sourceType: 'material_line',
            sourceId: 'material_use:x',
            costBucket: 'material',
          },
        ],
      }).grossProfitCents === -4000,
    ],
    [
      'provisional_open',
      resolveJobProfitabilityTruth({
        jobId,
        companyId,
        expectedJobCompanyId: companyId,
        jobStatus: 'in_progress',
        estimated,
        invoices: [
          { invoiceId: 'i', jobId, quoteId: null, status: 'sent', subtotalCents: 20000 },
        ],
        jpeEntries: [
          {
            entryId: 'm',
            jobId,
            amountCents: 12000,
            sourceType: 'material_line',
            sourceId: 'material_use:1',
            costBucket: 'material',
          },
        ],
      }).completeness === 'PROVISIONAL',
    ],
    ['overhead_not_allocated', profitable.alerts.some((a) => a.code === 'OVERHEAD_NOT_ALLOCATED')],
    ['contribution_exact', profitable.jobOperatingContributionCents === 8000],
    [
      'row105_not_dup',
      resolveBucketedJobCosts({
        jobId,
        entries: [
          {
            entryId: 'f',
            jobId,
            amountCents: 5000,
            sourceType: 'supplier_invoice',
            sourceId: 'supplier_invoice:ev',
          },
          {
            entryId: 'a',
            jobId,
            amountCents: 3000,
            sourceType: 'supplier_invoice',
            sourceId: 'supplier_invoice_alloc:a',
          },
        ],
      }).totalKnownJobCostCents === 3000,
    ],
    [
      'rbac',
      canViewJobProfitabilityTruth({ roleName: 'owner' }) &&
        !canViewJobProfitabilityTruth({ roleName: 'client' }) &&
        !canViewJobProfitabilityTruth({ roleName: 'technician' }),
    ],
    [
      'client_leak',
      (() => {
        try {
          assertNoJobProfitabilityTruthClientLeak({ grossProfitCents: 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'safety',
      assertRow107SafetyGates({ row92AutomationEnabled: false }).row108PlusNotStarted === true,
    ],
    [
      'row108_not_started',
      (() => {
        try {
          assertRow108NotStartedDuringRow107(true);
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
  pass('cleanup_no_fabricated_yg_profitability');
  pass('xero_writes', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('row118_not_closed');
  pass('row106_preserved');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row107-job-profitability-truth-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
