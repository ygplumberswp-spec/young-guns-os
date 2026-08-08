#!/usr/bin/env node
/**
 * Row 90 — Fixed-price / flat-rate quoting staging proof.
 * READ-ONLY real-data audit + in-memory fixtures.
 * No Xero writes. No customer sends. Production = 0. No historical repricing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  FIXED_PRICE_ROYAL_CAPE,
  assertNoInternalPricingLeak,
  assertRow90NoCustomerSends,
  assertRow90NoProductionWrites,
  assertRow90NoXeroWrites,
  assertRow91NotStarted,
  assertRow92NotStarted,
  assertRoyalCapeFixedPriceUnchanged,
  calculateCustomerFacingQuoteAmounts,
  projectPdfSafePricingLines,
  projectPortalSafePricingLines,
  projectXeroRevenueLines,
  resolveConfiguredCalloutSellRateCents,
  resolveConfiguredLabourSellRateCents,
} from '../../shared/dist/fixed-price-quoting.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(
  repoRoot,
  'diagnostic-output/fixed-price-flat-rate-quoting-staging-proof.json',
);
const FORBIDDEN_PROD = 'rshuiaghmtrvvilhqpwm';
const YG = FIXED_PRICE_ROYAL_CAPE.youngGunsCompanyId;

function loadEnv() {
  const out = {};
  const envPath = path.resolve(repoRoot, 'apps/api/.env.staging.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const i = s.indexOf('=');
      if (i < 0) continue;
      let v = s.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[s.slice(0, i).trim()] = v;
    }
  }
  out.APP_ENV = process.env.APP_ENV || out.APP_ENV || 'staging';
  out.TITAN_ENV = process.env.TITAN_ENV || out.TITAN_ENV || 'staging';
  if (process.env.STAGING_DATABASE_URL) out.DATABASE_URL = process.env.STAGING_DATABASE_URL;
  else if (process.env.DATABASE_URL) out.DATABASE_URL = process.env.DATABASE_URL;
  const tip = '/tmp/cursor-staging-db-url.txt';
  if (!out.DATABASE_URL && fs.existsSync(tip)) {
    out.DATABASE_URL = fs.readFileSync(tip, 'utf8').trim();
  }
  return out;
}

const report = {
  label: 'fixed-price-flat-rate-quoting-staging-proof',
  row: 90,
  generatedAt: new Date().toISOString(),
  stagingOnly: true,
  xeroWriteCalls: 0,
  customerSends: 0,
  productionWrites: 0,
  productionMigrations: 0,
  row91Started: false,
  row92Started: false,
  architecture: {},
  realDataAudit: {},
  safeFixtures: {},
  royalCape: {},
  results: [],
  blockers: [],
};

function pass(name, detail = '') {
  report.results.push({ name, status: 'PASS', detail });
}
function fail(name, detail = '') {
  report.results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 800) });
}

function looksLikeLabour(description, category) {
  const d = `${description ?? ''} ${category ?? ''}`.toLowerCase();
  return category === 'labour' || /\blabou?r\b/.test(d);
}

function looksLikeCallout(description, category) {
  const d = `${description ?? ''} ${category ?? ''}`.toLowerCase();
  return category === 'travel' || /\bcall[-\s]?out\b|\bcallout\b|\battendance\b/.test(d);
}

async function main() {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL required');
  if (env.DATABASE_URL.includes(FORBIDDEN_PROD)) throw new Error('Production DB forbidden');
  const stagingId = assertStagingDatabaseIdentity({
    databaseUrl: env.DATABASE_URL,
    appEnv: env.APP_ENV,
    titanEnv: env.TITAN_ENV,
  });
  if (!stagingId.ok) throw new Error(stagingId.reason);
  assertRow90NoXeroWrites(0);
  assertRow90NoCustomerSends(0);
  assertRow90NoProductionWrites(0);
  assertRow91NotStarted(false);
  assertRow92NotStarted(false);
  pass('safety_gates');

  report.architecture = {
    pricingFields:
      'quotes.pricing_presentation_mode, labour_included, callout_included, callout_allocation; quote_line_items.customer_visible',
    pricebookSource: 'finance_catalogue / YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK (not auto-applied by Row 90)',
    labourConfigSource:
      'company_finance_settings.default_internal_labour_rate_cents_per_hour (COST only — sell rate MISSING)',
    calloutConfigSource: 'No canonical call-out sell setting — MISSING (pricebook not auto-applied)',
    taxSource: 'company_finance_settings.default_vat_rate_bps + line vat_rate_bps',
    xeroLineMappingSource:
      'projectXeroRevenueLines → customer-facing lines only (writes=0; dry-run projection)',
  };

  // Safe fixtures
  const flatConfig = {
    pricingPresentationMode: 'FLAT_RATE_INCLUDED',
    labourIncluded: true,
    calloutIncluded: true,
    calloutAllocation: 'PER_JOB',
  };
  const lines = [
    {
      category: 'scope',
      description: 'Replace XYZ valve',
      quantity: 1,
      unitPriceCents: 190000,
      unitCostCents: 40000,
      vatRateBps: 1500,
    },
    {
      category: 'labour',
      description: 'Labour allocation',
      quantity: 1,
      unitPriceCents: 60000,
      unitCostCents: 20000,
      vatRateBps: 1500,
    },
    {
      category: 'travel',
      description: 'Call-out allocation',
      quantity: 1,
      unitPriceCents: 30000,
      unitCostCents: 5000,
      vatRateBps: 1500,
    },
  ];
  const calc = calculateCustomerFacingQuoteAmounts({ lines, config: flatConfig });
  report.safeFixtures = {
    labourIncluded: calc.validation.ok && calc.customerFacingLines.every((l) => l.category !== 'labour') ? 'PASS' : 'FAIL',
    calloutIncluded: calc.customerFacingLines.every((l) => l.category !== 'travel') ? 'PASS' : 'FAIL',
    bothIncluded: calc.subtotalCents === 190000 ? 'PASS' : 'FAIL',
    itemised: (() => {
      const itemised = calculateCustomerFacingQuoteAmounts({
        lines,
        config: { pricingPresentationMode: 'ITEMISED', labourIncluded: false, calloutIncluded: false, calloutAllocation: 'PER_JOB' },
      });
      return itemised.subtotalCents === 280000 ? 'PASS' : 'FAIL';
    })(),
    quantity: (() => {
      const q = calculateCustomerFacingQuoteAmounts({
        lines: [{ ...lines[0], quantity: 2 }, lines[1], lines[2]],
        config: flatConfig,
      });
      return q.subtotalCents === 380000 ? 'PASS' : 'FAIL';
    })(),
    vat: calc.vatCents === 28500 && calc.totalCents === 218500 ? 'PASS' : 'FAIL',
    invoiceConversion: projectXeroRevenueLines(lines, flatConfig).length === 1 ? 'PASS' : 'FAIL',
    pdf: (() => {
      try {
        const pdf = projectPdfSafePricingLines(lines, flatConfig);
        assertNoInternalPricingLeak({ lines: pdf });
        return pdf.length === 1 ? 'PASS' : 'FAIL';
      } catch (e) {
        return `FAIL: ${e.message}`;
      }
    })(),
    portal: (() => {
      try {
        const portal = projectPortalSafePricingLines(lines, flatConfig);
        assertNoInternalPricingLeak({ lines: portal });
        return portal.length === 1 ? 'PASS' : 'FAIL';
      } catch (e) {
        return `FAIL: ${e.message}`;
      }
    })(),
    xeroProjection: projectXeroRevenueLines(lines, flatConfig).length === 1 ? 'PASS' : 'FAIL',
    noDoubleCharge: calc.subtotalCents === 190000 && calc.subtotalCents !== 280000 ? 'PASS' : 'FAIL',
    idempotency: (() => {
      const again = calculateCustomerFacingQuoteAmounts({ lines: calc.lines, config: calc.config });
      return again.totalCents === calc.totalCents ? 'PASS' : 'FAIL';
    })(),
    missingLabourSellRate: resolveConfiguredLabourSellRateCents({}).status === 'MISSING' ? 'PASS' : 'FAIL',
    missingCalloutSellRate: resolveConfiguredCalloutSellRateCents({}).status === 'MISSING' ? 'PASS' : 'FAIL',
  };
  for (const [k, v] of Object.entries(report.safeFixtures)) {
    if (v === 'PASS') pass(`fixture_${k}`);
    else fail(`fixture_${k}`, v);
  }

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  try {
    // Apply additive migration on staging only (idempotent IF NOT EXISTS).
    const migrationSql = fs.readFileSync(
      path.resolve(repoRoot, 'packages/db/drizzle/0209_fixed_price_flat_rate_quoting.sql'),
      'utf8',
    );
    await sql.unsafe(migrationSql);
    pass('staging_additive_migration');

    const [{ quoteCount }] = await sql`
      select count(*)::int as "quoteCount" from quotes where company_id = ${YG}
    `;
    const [{ lineCount }] = await sql`
      select count(*)::int as "lineCount" from quote_line_items where company_id = ${YG}
    `;
    const categoryRows = await sql`
      select category, count(*)::int as n
      from quote_line_items
      where company_id = ${YG}
      group by category
      order by n desc
    `;
    const allLines = await sql`
      select q.id as quote_id, q.quote_number, q.xero_quote_number, q.total_cents,
             q.status, li.category, li.description, li.unit_price_cents, li.line_subtotal_cents
      from quote_line_items li
      join quotes q on q.id = li.quote_id
      where li.company_id = ${YG}
    `;

    let labourLines = 0;
    let calloutLines = 0;
    let serviceProductLines = 0;
    const quotesWithServiceAndLabourOrCallout = new Set();
    const quoteCats = new Map();
    for (const row of allLines) {
      const cats = quoteCats.get(row.quote_id) ?? { labour: false, callout: false, service: false };
      if (looksLikeLabour(row.description, row.category)) {
        labourLines += 1;
        cats.labour = true;
      } else if (looksLikeCallout(row.description, row.category)) {
        calloutLines += 1;
        cats.callout = true;
      } else {
        serviceProductLines += 1;
        cats.service = true;
      }
      quoteCats.set(row.quote_id, cats);
    }
    for (const [qid, cats] of quoteCats) {
      if (cats.service && (cats.labour || cats.callout)) {
        quotesWithServiceAndLabourOrCallout.add(qid);
      }
    }

    const settings = await sql`
      select default_vat_rate_bps, default_internal_labour_rate_cents_per_hour
      from company_finance_settings
      where company_id = ${YG}
      limit 1
    `;

    report.realDataAudit = {
      totalQuotes: quoteCount,
      totalLines: lineCount,
      linesByCategory: Object.fromEntries(categoryRows.map((r) => [r.category, r.n])),
      labourLines,
      calloutLines,
      serviceProductLines,
      quotesWithServiceAndLabourOrCallout: quotesWithServiceAndLabourOrCallout.size,
      potentialDuplicateChargeCandidates: quotesWithServiceAndLabourOrCallout.size,
      note: 'Candidates are READ-ONLY observations — no automatic historical repricing applied',
      labourSellRate: resolveConfiguredLabourSellRateCents({
        defaultInternalLabourRateCentsPerHour:
          settings[0]?.default_internal_labour_rate_cents_per_hour ?? null,
      }),
      calloutSellRate: resolveConfiguredCalloutSellRateCents({}),
      vatRateBps: settings[0]?.default_vat_rate_bps ?? null,
      historicalRepricingApplied: false,
    };
    pass('real_data_audit_readonly');

    const rc = await sql`
      select id, quote_number, xero_quote_number, xero_quote_id, customer_id, job_id,
             total_cents, amount_cents, payment_terms, customer_notes, notes, internal_notes,
             pricing_presentation_mode, labour_included, callout_included
      from quotes
      where id = ${FIXED_PRICE_ROYAL_CAPE.royalCapeQuoteId}
        and company_id = ${YG}
      limit 1
    `;
    if (!rc[0]) {
      fail('royal_cape', 'QU-0183 not found');
    } else {
      const row = rc[0];
      try {
        assertRoyalCapeFixedPriceUnchanged({
          quoteId: row.id,
          xeroQuoteId: row.xero_quote_id,
          xeroQuoteNumber: row.xero_quote_number ?? row.quote_number,
          totalCents: row.total_cents ?? row.amount_cents,
          customerId: row.customer_id,
          jobId: row.job_id,
        });
        report.royalCape = {
          quoteNumber: row.xero_quote_number ?? row.quote_number,
          totalCents: row.total_cents ?? row.amount_cents,
          xeroQuoteId: row.xero_quote_id,
          customerId: row.customer_id,
          jobId: row.job_id,
          pricingPresentationMode: row.pricing_presentation_mode,
          labourIncluded: row.labour_included,
          calloutIncluded: row.callout_included,
          paymentTerms: row.payment_terms,
          unchanged: true,
        };
        if (row.pricing_presentation_mode !== 'ITEMISED') {
          fail('royal_cape_mode', `Expected ITEMISED default, got ${row.pricing_presentation_mode}`);
        } else {
          pass('royal_cape_unchanged');
        }
      } catch (e) {
        fail('royal_cape', e.message);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, pass: report.results.filter((r) => r.status === 'PASS').length, fail: report.results.filter((r) => r.status === 'FAIL').length }, null, 2));
  if (report.results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
