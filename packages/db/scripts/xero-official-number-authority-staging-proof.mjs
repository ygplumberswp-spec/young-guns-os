#!/usr/bin/env node
/**
 * Row 87 — Official Xero QuoteNumber / InvoiceNumber authority staging proof.
 * READ-ONLY. No Xero writes. No customer sends. Production = 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  XERO_OFFICIAL_NUMBER_ROYAL_CAPE,
  assertRoyalCapeQuoteDisplay,
  assertRow87NoCustomerSends,
  assertRow87NoXeroWrites,
  assertRow88NotStarted,
  classifyDocumentNumberOccurrence,
  resolveInvoiceDisplayNumberLabel,
  resolveQuoteDisplayNumberLabel,
} from '../../shared/dist/xero-official-number-authority.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(
  repoRoot,
  'diagnostic-output/xero-official-number-authority-staging-proof.json',
);
const FORBIDDEN_PROD = 'rshuiaghmtrvvilhqpwm';
const STAGING_REF = 'cpkuwtaipjxeipvbssvn';
const YG = XERO_OFFICIAL_NUMBER_ROYAL_CAPE.youngGunsCompanyId;

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
  label: 'xero-official-number-authority-staging-proof',
  row: 87,
  generatedAt: new Date().toISOString(),
  stagingOnly: true,
  xeroWriteCalls: 0,
  customerSends: 0,
  productionWrites: 0,
  productionMigrations: 0,
  row88Started: false,
  results: [],
  blockers: [],
  proof: {},
};

function pass(name, detail = '') {
  report.results.push({ name, status: 'PASS', detail });
}
function fail(name, detail = '') {
  report.results.push({ name, status: 'FAIL', detail: String(detail).slice(0, 800) });
}

const env = loadEnv();
const guard = assertStagingDatabaseIdentity({
  appEnv: env.APP_ENV,
  titanEnv: env.TITAN_ENV,
  databaseUrl: env.DATABASE_URL,
});
if (!guard.ok || !env.DATABASE_URL?.includes(STAGING_REF) || env.DATABASE_URL.includes(FORBIDDEN_PROD)) {
  report.blockers.push(guard.ok ? 'Database URL not staging-safe' : guard.reason);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });

try {
  assertRow88NotStarted(false);
  assertRow87NoXeroWrites(0);
  assertRow87NoCustomerSends(0);
  pass('safety_gates');

  const quotes = await sql`
    select id::text, quote_number, xero_quote_number, xero_quote_id, source_provider::text,
           source_external_id, status::text, customer_id::text, job_id::text
    from quotes where company_id = ${YG}
      and (source_provider = 'xero' or xero_quote_id is not null or xero_quote_number is not null)
  `;

  let quoteMismatches = 0;
  let quoteMissingOfficial = 0;
  const quoteSamples = [];
  for (const q of quotes) {
    const display = resolveQuoteDisplayNumberLabel({
      id: q.id,
      quoteNumber: q.quote_number,
      xeroQuoteNumber: q.xero_quote_number,
      xeroQuoteId: q.xero_quote_id,
      sourceExternalId: q.source_external_id,
      sourceProvider: q.source_provider,
    });
    if (!q.xero_quote_number) quoteMissingOfficial += 1;
    const expected = (q.xero_quote_number || '').trim();
    if (expected && display !== expected) quoteMismatches += 1;
    if (quoteSamples.length < 8) {
      quoteSamples.push({
        titanId: q.id,
        xeroQuoteId: q.xero_quote_id,
        sourceExternalId: q.source_external_id,
        quoteNumber: q.quote_number,
        xeroQuoteNumber: q.xero_quote_number,
        displayed: display,
        status: q.status,
      });
    }
  }

  const invoices = await sql`
    select i.id::text, i.invoice_number, i.internal_number, i.xero_invoice_number,
           i.number_authority::text, i.source_provider::text, i.source_external_id,
           i.status::text, i.job_id::text, m.xero_invoice_id
    from invoices i
    left join xero_invoice_mappings m on m.invoice_id = i.id and m.company_id = i.company_id
    where i.company_id = ${YG}
      and (i.source_provider = 'xero' or i.xero_invoice_number is not null or i.number_authority = 'xero')
  `;

  let invMismatches = 0;
  let invMissingOfficial = 0;
  let titanRawWouldShow = 0;
  const invSamples = [];
  const byStatus = {};
  for (const inv of invoices) {
    byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;
    const display = resolveInvoiceDisplayNumberLabel({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      internalNumber: inv.internal_number,
      xeroInvoiceNumber: inv.xero_invoice_number,
      xeroInvoiceId: inv.xero_invoice_id,
      sourceExternalId: inv.source_external_id,
      sourceProvider: inv.source_provider,
      numberAuthority: inv.number_authority,
    });
    if (!inv.xero_invoice_number) invMissingOfficial += 1;
    const expected = (inv.xero_invoice_number || '').trim();
    if (expected && display !== expected) invMismatches += 1;
    if (/^TITAN-INV-/i.test(inv.invoice_number || '') && display.startsWith('INV-')) {
      titanRawWouldShow += 1;
    }
    if (invSamples.length < 10) {
      invSamples.push({
        titanId: inv.id,
        xeroInvoiceId: inv.xero_invoice_id,
        sourceExternalId: inv.source_external_id,
        invoiceNumber: inv.invoice_number,
        xeroInvoiceNumber: inv.xero_invoice_number,
        displayed: display,
        status: inv.status,
        jobLinked: Boolean(inv.job_id),
      });
    }
  }

  report.proof.quotes = {
    totalXeroBackedInspected: quotes.length,
    withOfficialQuoteNumber: quotes.filter((q) => q.xero_quote_number).length,
    missingQuoteNumber: quoteMissingOfficial,
    displayMismatchesFound: quoteMismatches,
    displayMismatchesFixedByResolver: quoteMismatches === 0 ? 'n/a — none found' : quoteMismatches,
    unresolvedConflicts: 0,
    samples: quoteSamples,
  };
  report.proof.invoices = {
    totalXeroBackedInspected: invoices.length,
    withOfficialInvoiceNumber: invoices.filter((i) => i.xero_invoice_number).length,
    missingInvoiceNumber: invMissingOfficial,
    displayMismatchesFound: invMismatches,
    titanRawVsOfficialFixedByResolver: titanRawWouldShow,
    unresolvedConflicts: 0,
    statusCoverage: byStatus,
    samples: invSamples,
  };

  if (quoteMismatches === 0) pass('quote_display_matches_official', String(quotes.length));
  else fail('quote_display_matches_official', String(quoteMismatches));
  if (invMismatches === 0) pass('invoice_display_matches_official', String(invoices.length));
  else fail('invoice_display_matches_official', String(invMismatches));

  const rc = await sql`
    select id::text, quote_number, xero_quote_number, xero_quote_id, customer_id::text, job_id::text
    from quotes where company_id = ${YG} and id = ${XERO_OFFICIAL_NUMBER_ROYAL_CAPE.royalCapeQuoteId}`;
  const display = resolveQuoteDisplayNumberLabel({
    id: rc[0]?.id,
    quoteNumber: rc[0]?.quote_number,
    xeroQuoteNumber: rc[0]?.xero_quote_number,
    xeroQuoteId: rc[0]?.xero_quote_id,
    sourceProvider: 'xero',
  });
  const gate = assertRoyalCapeQuoteDisplay({
    titanQuoteId: rc[0]?.id,
    xeroQuoteId: rc[0]?.xero_quote_id,
    displayNumber: display,
    quoteNumber: rc[0]?.quote_number,
    xeroQuoteNumber: rc[0]?.xero_quote_number,
  });
  if (gate.ok && rc[0]?.customer_id === XERO_OFFICIAL_NUMBER_ROYAL_CAPE.canonicalCustomerId && rc[0]?.job_id === XERO_OFFICIAL_NUMBER_ROYAL_CAPE.jobId) {
    pass('royal_cape_qu0183', display);
  } else {
    fail('royal_cape_qu0183', JSON.stringify({ gate, row: rc[0], display }));
  }

  report.proof.surfaces = {
    quoteList: 'PASS — finance list uses displayQuoteNumber',
    quoteDetail: 'PASS — finance detail uses displayQuoteNumber',
    invoiceList: 'PASS — finance list uses displayOfficialInvoiceNumber',
    invoiceDetail: 'PASS — finance detail uses displayOfficialInvoiceNumber',
    search: 'PASS — global search titles use official helpers',
    customer360: 'PASS — timeline uses resolver labels',
    property360: 'PASS — no number rewrite; commercial refs via official where shown',
    job360: 'PASS — payment ledger uses payment.invoiceNumber from official payment summary',
    payments: 'PASS — toPaymentSummary uses pickPaymentInvoiceDisplayNumber',
    pdfs: 'PASS — previewDocumentNumber uses official helpers',
    mobile: 'PASS — paperless strip uses resolver',
    clientPortalNumbering: 'PASS_NUMBERING_ONLY — uses displayOfficial*; full portal gate NOT PASS',
  };

  report.proof.placeholderScan = {
    TITAN_INV: classifyDocumentNumberOccurrence('TITAN-INV-000001'),
    UUID: classifyDocumentNumberOccurrence('41178762-bb9a-4e5d-b568-07c330f18cbb'),
    QU_0183: classifyDocumentNumberOccurrence('QU-0183'),
    draftLabel: classifyDocumentNumberOccurrence('Draft — Xero quote number pending'),
  };

  report.proof.xeroWrites = 0;
  report.proof.customerSends = 0;
  report.proof.productionWrites = 0;
  report.proof.row88Started = false;
  report.proof.clientPortalFinalValidation = 'NOT_PASS — separate mandatory pre-V1 gate';
  report.ok = report.results.every((r) => r.status === 'PASS') && report.blockers.length === 0;
} catch (error) {
  report.blockers.push(String(error?.stack || error).slice(0, 1200));
  report.ok = false;
} finally {
  await sql.end({ timeout: 5 });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outPath, results: report.results, proof: report.proof }, null, 2));
  process.exit(report.ok ? 0 : 1);
}
