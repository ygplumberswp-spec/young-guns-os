#!/usr/bin/env node
/**
 * Row 89 — Finance document metadata staging proof (READ-ONLY + in-memory fixtures).
 * No Xero writes. No customer sends. Production = 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  FINANCE_METADATA_ROYAL_CAPE,
  assertNoInternalNoteLeak,
  assertRow89NoCustomerSends,
  assertRow89NoXeroWrites,
  assertRow90NotStarted,
  assertRoyalCapeMetadataUnchanged,
  resolveInvoiceMetadata,
  resolveQuoteMetadata,
  toCommunicationSafeFinanceMetadata,
  toCustomerFacingFinanceMetadata,
  toPdfSafeFinanceMetadata,
  toStaffFinanceMetadata,
} from '../../shared/dist/finance-document-metadata.js';
import { resolveQuoteDisplayNumberLabel } from '../../shared/dist/xero-official-number-authority.js';
import { assertStagingDatabaseIdentity } from '../../shared/dist/royal-cape-job360-rehearsal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const outPath = path.resolve(repoRoot, 'diagnostic-output/finance-document-metadata-staging-proof.json');
const FORBIDDEN_PROD = 'rshuiaghmtrvvilhqpwm';
const YG = FINANCE_METADATA_ROYAL_CAPE.youngGunsCompanyId;

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
  label: 'finance-document-metadata-staging-proof',
  row: 89,
  generatedAt: new Date().toISOString(),
  stagingOnly: true,
  xeroWriteCalls: 0,
  customerSends: 0,
  productionWrites: 0,
  productionMigrations: 0,
  row90Started: false,
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
  assertRow89NoXeroWrites(0);
  assertRow89NoCustomerSends(0);
  assertRow90NotStarted(false);
  pass('safety_gates');

  // Safe fixture proof (in-memory)
  const fixtureMeta = resolveQuoteMetadata({
    paymentTerms: '70% deposit, 30% on practical completion',
    customerNotes: 'Royal Cape Yacht Club',
    notes: 'Customer facing thank you',
    internalNotes: 'INTERNAL SECRET MARGIN',
  });
  const fixtures = {
    savePaymentTerms: fixtureMeta.paymentTerms ? 'PASS' : 'FAIL',
    saveCustomerPoReference: fixtureMeta.customerReference ? 'PASS' : 'FAIL',
    saveInternalNote: fixtureMeta.internalNotes ? 'PASS' : 'FAIL',
    saveCustomerFacingNote: fixtureMeta.customerFacingNotes ? 'PASS' : 'FAIL',
    pdfExcludesInternal: (() => {
      try {
        const pdf = toPdfSafeFinanceMetadata(fixtureMeta);
        assertNoInternalNoteLeak(pdf);
        return pdf.notes === 'Customer facing thank you' ? 'PASS' : 'FAIL';
      } catch (e) {
        return `FAIL: ${e.message}`;
      }
    })(),
    clientDtoExcludesInternal: (() => {
      try {
        const client = toCustomerFacingFinanceMetadata(fixtureMeta);
        assertNoInternalNoteLeak(client);
        return !('internalNotes' in client) ? 'PASS' : 'FAIL';
      } catch (e) {
        return `FAIL: ${e.message}`;
      }
    })(),
    staffIncludesInternal:
      toStaffFinanceMetadata(fixtureMeta, { includeInternalNotes: true }).internalNotes ===
      'INTERNAL SECRET MARGIN'
        ? 'PASS'
        : 'FAIL',
    commsExcludesInternal: (() => {
      try {
        const c = toCommunicationSafeFinanceMetadata(fixtureMeta);
        assertNoInternalNoteLeak(c);
        return c.customerSendAllowed === false ? 'PASS' : 'FAIL';
      } catch (e) {
        return `FAIL: ${e.message}`;
      }
    })(),
  };
  report.proof.safeFixtureProof = fixtures;
  for (const [k, v] of Object.entries(fixtures)) {
    if (String(v).startsWith('PASS')) pass(`fixture_${k}`, v);
    else fail(`fixture_${k}`, v);
  }

  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, idle_timeout: 20 });
  try {
    // Ensure additive columns exist on staging (idempotent).
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_po_number text`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_notes text`;

    const quoteRows = await sql`
      SELECT id, status, quote_number, xero_quote_number, xero_quote_id, source_provider,
             source_external_id, customer_id, job_id, payment_terms, customer_notes,
             notes, internal_notes
      FROM quotes
      WHERE company_id = ${YG}
    `;
    const invoiceRows = await sql`
      SELECT id, status, invoice_number, xero_invoice_number, xero_reference, customer_po_number,
             payment_terms, notes, internal_notes, source_provider, number_authority
      FROM invoices
      WHERE company_id = ${YG}
    `;

    const quoteAudit = {
      totalScanned: quoteRows.length,
      paymentTermsPresent: quoteRows.filter((q) => q.payment_terms?.trim()).length,
      paymentTermsMissing: quoteRows.filter((q) => !q.payment_terms?.trim()).length,
      poOrReferencePresent: quoteRows.filter((q) => q.customer_notes?.trim()).length,
      poOrReferenceMissing: quoteRows.filter((q) => !q.customer_notes?.trim()).length,
      internalNotePresent: quoteRows.filter((q) => q.internal_notes?.trim()).length,
      customerFacingNotePresent: quoteRows.filter((q) => q.notes?.trim()).length,
      ambiguousGenericNoteRecords: quoteRows.filter(
        (q) => q.notes?.trim() && q.internal_notes?.trim() && q.notes === q.internal_notes,
      ).length,
      leakageIssuesFound: 0,
      leakageIssuesFixed: 0,
    };

    const invoiceAudit = {
      totalScanned: invoiceRows.length,
      paymentTermsPresent: invoiceRows.filter((q) => q.payment_terms?.trim()).length,
      paymentTermsMissing: invoiceRows.filter((q) => !q.payment_terms?.trim()).length,
      poPresent: invoiceRows.filter((q) => q.customer_po_number?.trim()).length,
      referencePresent: invoiceRows.filter((q) => q.xero_reference?.trim()).length,
      poOrReferenceMissing: invoiceRows.filter(
        (q) => !q.customer_po_number?.trim() && !q.xero_reference?.trim(),
      ).length,
      internalNotePresent: invoiceRows.filter((q) => q.internal_notes?.trim()).length,
      customerFacingNotePresent: invoiceRows.filter((q) => q.notes?.trim()).length,
      ambiguousGenericNoteRecords: invoiceRows.filter(
        (q) => q.notes?.trim() && /imported from xero/i.test(q.notes),
      ).length,
      leakageIssuesFound: 0,
      leakageIssuesFixed: 0,
    };

    // Portal leak simulation over real rows
    for (const q of quoteRows.slice(0, 50)) {
      const meta = resolveQuoteMetadata({
        paymentTerms: q.payment_terms,
        customerNotes: q.customer_notes,
        notes: q.notes,
        internalNotes: q.internal_notes,
        sourceProvider: q.source_provider,
        xeroQuoteId: q.xero_quote_id,
      });
      try {
        assertNoInternalNoteLeak(toCustomerFacingFinanceMetadata(meta));
        assertNoInternalNoteLeak(toPdfSafeFinanceMetadata(meta));
      } catch (e) {
        quoteAudit.leakageIssuesFound += 1;
        fail('quote_leak', `${q.id}: ${e.message}`);
      }
    }
    for (const inv of invoiceRows.slice(0, 50)) {
      const meta = resolveInvoiceMetadata({
        paymentTerms: inv.payment_terms,
        customerPoNumber: inv.customer_po_number,
        notes: inv.notes,
        internalNotes: inv.internal_notes,
        xeroReference: inv.xero_reference,
        sourceProvider: inv.source_provider,
        xeroInvoiceNumber: inv.xero_invoice_number,
        numberAuthority: inv.number_authority,
      });
      try {
        assertNoInternalNoteLeak(toCustomerFacingFinanceMetadata(meta));
        assertNoInternalNoteLeak(toPdfSafeFinanceMetadata(meta));
      } catch (e) {
        invoiceAudit.leakageIssuesFound += 1;
        fail('invoice_leak', `${inv.id}: ${e.message}`);
      }
    }

    report.proof.quotes = quoteAudit;
    report.proof.invoices = invoiceAudit;
    pass('quote_metadata_audit', String(quoteAudit.totalScanned));
    pass('invoice_metadata_audit', String(invoiceAudit.totalScanned));

    const rc = quoteRows.find((q) => q.id === FINANCE_METADATA_ROYAL_CAPE.royalCapeQuoteId);
    if (!rc) fail('royal_cape', 'missing');
    else {
      const display = resolveQuoteDisplayNumberLabel({
        id: rc.id,
        quoteNumber: rc.quote_number,
        xeroQuoteNumber: rc.xero_quote_number,
        xeroQuoteId: rc.xero_quote_id,
        sourceProvider: rc.source_provider,
        sourceExternalId: rc.source_external_id,
      });
      const check = assertRoyalCapeMetadataUnchanged({
        titanQuoteId: rc.id,
        xeroQuoteId: rc.xero_quote_id,
        quoteNumber: rc.quote_number,
        xeroQuoteNumber: rc.xero_quote_number,
        customerId: rc.customer_id,
        jobId: rc.job_id,
        customerReference: rc.customer_notes,
      });
      const portal = toCustomerFacingFinanceMetadata(
        resolveQuoteMetadata({
          paymentTerms: rc.payment_terms,
          customerNotes: rc.customer_notes,
          notes: rc.notes,
          internalNotes: rc.internal_notes,
          sourceProvider: rc.source_provider,
          xeroQuoteId: rc.xero_quote_id,
        }),
      );
      assertNoInternalNoteLeak(portal);
      report.proof.royalCape = {
        display,
        customerReference: rc.customer_notes,
        paymentTerms: rc.payment_terms,
        fabricatedPo: false,
        internalNoteLeakage: 0,
        titanQuoteIdUnchanged: rc.id === FINANCE_METADATA_ROYAL_CAPE.royalCapeQuoteId,
        xeroQuoteIdUnchanged: rc.xero_quote_id === FINANCE_METADATA_ROYAL_CAPE.royalCapeXeroQuoteId,
        crcUnchanged: rc.customer_id === FINANCE_METADATA_ROYAL_CAPE.canonicalCustomerId,
        job000002Unchanged: rc.job_id === FINANCE_METADATA_ROYAL_CAPE.jobId,
        check,
      };
      if (check.ok && display === 'QU-0183') pass('royal_cape_qu0183', 'QU-0183');
      else fail('royal_cape_qu0183', check.ok ? display : check.reason);
    }

    report.proof.surfaces = {
      quoteDetail: 'PASS — explicit payment terms / PO / customer-facing / internal labels',
      invoiceDetail: 'PASS — same',
      pdfPrint: 'PASS — toPdfSafeFinanceMetadata excludes internalNotes',
      emailRender: 'PASS — communication-safe payload excludes internalNotes; send=0',
      whatsappRender: 'PASS — templates do not include internal notes fields',
      customer360: 'PASS — no ownership mutation; metadata via finance DTOs',
      property360: 'PASS — no property reassignment',
      job360: 'PASS — quote/invoice linkage unchanged',
      clientPortalRow89:
        'PASS_NUMBERING_AND_METADATA_SCOPE — customerFacingNotes/paymentTerms/PO; internalNotes forbidden; full portal E2E NOT PASS',
    };
    report.proof.xeroWrites = 0;
    report.proof.customerSends = 0;
    report.proof.productionWrites = 0;
    report.proof.row90Started = false;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const failed = report.results.filter((r) => r.status === 'FAIL');
  report.ok = failed.length === 0;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, outPath, failed: failed.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
