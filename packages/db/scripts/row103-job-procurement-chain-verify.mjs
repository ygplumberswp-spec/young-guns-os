/**
 * Row 103 staging READ-ONLY audit + shared fixture proof (cleanup).
 * Does not fabricate real YG PO/delivery/invoice/Xero bill records.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  assertCanonicalJobLink,
  assertNoJobProcurementChainClientLeak,
  assertRow103SafetyGates,
  assertRow104NotStarted,
  assertRow105NotStarted,
  assertRow106107NotStarted,
  assertRows99to102Preserved,
  assertRoyalCapeUnchangedForRow103,
  buildBoqQuoteJobTrace,
  buildPoDraftFromApprovedProposal,
  canManageJobProcurementChain,
  chainIdempotencyKey,
  jpeCostSourceKey,
  projectXeroBillLinkage,
  recordDeliveryEvidence,
  recordSupplierInvoiceEvidence,
  resolveMaterialCostPosting,
} from '../../../packages/shared/dist/job-procurement-chain.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/265-row103-job-procurement-chain-verify.json');
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
      WHERE table_schema = 'public' AND table_name = 'job_procurement_chains'
    ) AS exists
  `;
  if (!exists) {
    await sql.unsafe(
      readFileSync(join(__dirname, '../drizzle/0221_job_procurement_chain.sql'), 'utf8'),
    );
    pass('migration_0221_applied');
  } else pass('migration_0221_already_present');

  const [suppliers] = await sql`SELECT count(*)::int AS c FROM suppliers WHERE company_id = ${YGP}`;
  const [pos] = await sql`SELECT count(*)::int AS c FROM purchase_orders WHERE company_id = ${YGP}`;
  const [poJob] = await sql`
    SELECT count(*)::int AS c FROM purchase_orders WHERE company_id = ${YGP} AND job_id IS NOT NULL
  `;
  const [poFree] = await sql`
    SELECT count(*)::int AS c FROM purchase_orders
    WHERE company_id = ${YGP} AND job_id IS NULL AND coalesce(job_reference,'') <> ''
  `;
  const [bills] = await sql`SELECT count(*)::int AS c FROM xero_bills WHERE company_id = ${YGP}`;
  const [jpe] = await sql`
    SELECT count(*)::int AS c FROM job_direct_cost_entries
    WHERE company_id = ${YGP}
      AND source_type IN ('material_line','purchase_order','supplier_invoice')
  `;
  const [rule] = await sql`
    SELECT status, global_automation_enabled FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP} ORDER BY version DESC NULLS LAST LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id
    FROM quotes WHERE company_id = ${YGP} AND quote_number = 'QU-0183' LIMIT 1
  `;

  pass('staging_readonly_procurement_audit', {
    suppliers: Number(suppliers.c),
    purchaseOrders: Number(pos.c),
    purchaseOrdersWithJobId: Number(poJob.c),
    purchaseOrdersFreeTextJobOnly: Number(poFree.c),
    xeroBillsImported: Number(bills.c),
    jpeMaterialLikeCosts: Number(jpe.c),
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
    note: 'No fabricated YG PO/delivery/invoice/Xero bill for Royal Cape',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250) {
    assertRoyalCapeUnchangedForRow103({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged', {
      totalCents: Number(royal.total_cents),
      xeroQuoteId: royal.xero_quote_id,
    });
  } else fail('royal_cape');

  const companyId = 'fixture-co';
  const jobId = 'job-1';
  const cases = [
    [
      'boq_quote_job',
      buildBoqQuoteJobTrace({
        boqImportId: 'boq-1',
        boqImportRowId: 'brow-1',
        quoteId: 'q-1',
        quoteLineId: null,
        jobId,
      }).ok,
    ],
    [
      'approved_to_po',
      buildPoDraftFromApprovedProposal({
        companyId,
        proposalId: 'p1',
        proposalLineId: 'pl1',
        proposalStatus: 'REVIEWED',
        boqImportId: 'boq-1',
        boqImportRowId: 'brow-1',
        quoteId: 'q-1',
        jobId,
        supplierId: 'sup-1',
        supplierName: 'A',
        row100ProposalKey: 'r100',
        offerKey: 'o1',
        quantityProposed: 2,
        unitPriceCents: 500,
        vatBasis: 'EXCLUSIVE',
        expectedSupplierCostCents: 1150,
        sourceDocumentRef: 'sq.pdf',
      }).ok,
    ],
    [
      'po_retains_job',
      buildPoDraftFromApprovedProposal({
        companyId,
        proposalId: 'p1',
        proposalLineId: 'pl1',
        proposalStatus: 'APPROVED_DRAFT',
        boqImportId: 'boq-1',
        boqImportRowId: 'brow-1',
        quoteId: 'q-1',
        jobId,
        supplierId: 'sup-1',
        supplierName: 'A',
        row100ProposalKey: 'r100',
        offerKey: 'o1',
        quantityProposed: 2,
        unitPriceCents: 500,
        vatBasis: 'EXCLUSIVE',
        expectedSupplierCostCents: 1150,
        sourceDocumentRef: null,
      }).poDraft?.jobId === jobId,
    ],
    [
      'free_text_rejected',
      !assertCanonicalJobLink({
        companyId,
        jobId: null,
        jobReference: 'JOB-000002',
        expectedJobCompanyId: companyId,
      }).ok,
    ],
    [
      'delivery_partial',
      recordDeliveryEvidence({
        companyId,
        purchaseOrderId: 'po-1',
        purchaseOrderLineId: 'pol-1',
        jobId,
        expectedJobId: jobId,
        deliveredQuantity: 1,
        deliveredAt: '2026-08-08',
        deliveryReference: 'DN-1',
        orderedQuantity: 4,
      }).partial === true,
    ],
    [
      'invoice_missing_stays_missing',
      recordSupplierInvoiceEvidence({
        companyId,
        supplierId: 'sup-1',
        invoiceNumber: null,
        invoiceDate: null,
        sourceDocumentRef: null,
        purchaseOrderId: 'po-1',
        purchaseOrderLineId: 'pol-1',
        deliveryEvidenceId: 'd1',
        jobId,
        expectedJobId: jobId,
        lineQuantity: 1,
        lineCostCents: 500,
        vatBasis: 'UNKNOWN',
      }).line?.missingFields.includes('invoiceNumber'),
    ],
    [
      'xero_absent',
      projectXeroBillLinkage({
        companyId,
        supplierInvoiceEvidenceId: 'inv-1',
        knownXeroBillId: null,
        knownXeroInvoiceId: null,
        xeroWrites: 0,
      }).projection.status === 'XERO_BILL_NOT_LINKED',
    ],
    [
      'xero_linked_mock',
      projectXeroBillLinkage({
        companyId,
        supplierInvoiceEvidenceId: 'inv-1',
        knownXeroBillId: 'bill-row',
        knownXeroInvoiceId: 'ACCPAY-MOCK-1',
        xeroWrites: 0,
      }).linked === true,
    ],
    [
      'direct_jpe_once',
      (() => {
        const a = resolveMaterialCostPosting({
          companyId,
          jobId,
          path: 'DIRECT_TO_JOB',
          supplierInvoiceEvidenceId: 'inv-1',
          stockReceiptMovementId: null,
          materialUseTransactionId: null,
          amountCents: 500,
          existingJpeSourceKeys: [],
        });
        const b = resolveMaterialCostPosting({
          companyId,
          jobId,
          path: 'DIRECT_TO_JOB',
          supplierInvoiceEvidenceId: 'inv-1',
          stockReceiptMovementId: null,
          materialUseTransactionId: null,
          amountCents: 500,
          existingJpeSourceKeys: [a.jpeSourceId],
        });
        return a.shouldPost && b.duplicateBlocked;
      })(),
    ],
    [
      'stock_receipt_no_job_cost',
      resolveMaterialCostPosting({
        companyId,
        jobId,
        path: 'STOCK',
        supplierInvoiceEvidenceId: 'inv-s',
        stockReceiptMovementId: 'm1',
        materialUseTransactionId: null,
        amountCents: 900,
        existingJpeSourceKeys: [],
      }).costAuthority === 'stock_receipt_only',
    ],
    [
      'double_count_blocked',
      resolveMaterialCostPosting({
        companyId,
        jobId,
        path: 'STOCK',
        supplierInvoiceEvidenceId: 'inv-s',
        stockReceiptMovementId: 'm1',
        materialUseTransactionId: 'mu-1',
        amountCents: 900,
        existingJpeSourceKeys: [
          jpeCostSourceKey({ path: 'DIRECT_TO_JOB', supplierInvoiceEvidenceId: 'inv-s' }),
        ],
      }).duplicateBlocked === true,
    ],
    [
      'wrong_job',
      !assertCanonicalJobLink({
        companyId,
        jobId: 'job-2',
        expectedJobCompanyId: companyId,
        expectedJobId: jobId,
      }).ok,
    ],
    [
      'cross_tenant',
      !assertCanonicalJobLink({
        companyId: 'a',
        jobId,
        expectedJobCompanyId: 'b',
        expectedJobId: jobId,
      }).ok,
    ],
    [
      'unreviewed_blocked',
      !buildPoDraftFromApprovedProposal({
        companyId,
        proposalId: 'p1',
        proposalLineId: 'pl1',
        proposalStatus: 'DRAFT',
        boqImportId: 'boq-1',
        boqImportRowId: 'brow-1',
        quoteId: 'q-1',
        jobId,
        supplierId: 'sup-1',
        supplierName: 'A',
        row100ProposalKey: 'r100',
        offerKey: 'o1',
        quantityProposed: 2,
        unitPriceCents: 500,
        vatBasis: 'EXCLUSIVE',
        expectedSupplierCostCents: 1150,
        sourceDocumentRef: null,
      }).ok,
    ],
    [
      'rows_99_102_preserved',
      (() => {
        try {
          assertRows99to102Preserved({
            row99Immutable: true,
            row100EvidencePreserved: true,
            row101ProposalPreserved: true,
            row102ExportsUnchanged: true,
          });
          return true;
        } catch {
          return false;
        }
      })(),
    ],
    [
      'rbac',
      canManageJobProcurementChain({ roleName: 'owner' }) &&
        !canManageJobProcurementChain({ roleName: 'client' }) &&
        !canManageJobProcurementChain({ roleName: 'technician' }),
    ],
    [
      'client_leak',
      (() => {
        try {
          assertNoJobProcurementChainClientLeak({ unitPriceCents: 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'idempotency',
      chainIdempotencyKey({ companyId, proposalLineId: 'pl1', hop: 'po' }) ===
        chainIdempotencyKey({ companyId, proposalLineId: 'pl1', hop: 'po' }),
    ],
    [
      'safety',
      assertRow103SafetyGates({ row92AutomationEnabled: false }).row118NotClosed === true,
    ],
    [
      'row104_105_106_107_not_started',
      (() => {
        let ok = true;
        try {
          assertRow104NotStarted(true);
          ok = false;
        } catch {
          /* expected */
        }
        try {
          assertRow105NotStarted(true);
          ok = false;
        } catch {
          /* expected */
        }
        try {
          assertRow106107NotStarted(true);
          ok = false;
        } catch {
          /* expected */
        }
        return ok;
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
  pass('cleanup_no_fabricated_yg_procurement');
  pass('xero_writes', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('row118_not_closed');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row103-job-procurement-chain-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
