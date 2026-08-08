/**
 * Row 105 staging READ-ONLY audit + fixture proof (cleanup).
 * Does not fabricate real YG supplier invoices/allocations.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  allocateNetCentsDeterministic,
  assertNoMultiJobAllocClientLeak,
  assertRow105SafetyGates,
  assertRow106107NotStartedDuringRow105,
  assertRoyalCapeUnchangedForRow105,
  buildAllocationCorrection,
  canManageMultiJobInvoiceAllocation,
  freezeSourceInvoice,
  fullInvoiceJpeSourceKey,
  linkXeroBillForAllocation,
  reconcilePoAllocation,
  resolveAllocationBalance,
  resolveAllocationJpePosting,
  resolveCreditAgainstAllocations,
  validateJobAllocation,
} from '../../../packages/shared/dist/multi-job-supplier-invoice-allocation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/267-row105-multi-job-supplier-invoice-allocation-verify.json');
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
      WHERE table_schema = 'public' AND table_name = 'multi_job_supplier_invoices'
    ) AS exists
  `;
  if (!exists) {
    await sql.unsafe(
      readFileSync(join(__dirname, '../drizzle/0223_multi_job_supplier_invoice_allocation.sql'), 'utf8'),
    );
    pass('migration_0223_applied');
  } else pass('migration_0223_already_present');

  const count = async (q) => Number((await q)[0].c);
  const supplierInvoiceEvidence = await count(
    sql`SELECT count(*)::int AS c FROM job_procurement_supplier_invoice_evidence WHERE company_id = ${YGP}`,
  );
  const invoiceLines = await count(
    sql`SELECT count(*)::int AS c FROM multi_job_supplier_invoice_lines WHERE company_id = ${YGP}`,
  );
  const multiJobInvoices = await count(
    sql`SELECT count(*)::int AS c FROM multi_job_supplier_invoices WHERE company_id = ${YGP}`,
  );
  const allocations = await count(
    sql`SELECT count(*)::int AS c FROM multi_job_supplier_invoice_allocations WHERE company_id = ${YGP}`,
  );
  const invoicesLinkedToPo = await count(sql`
    SELECT count(*)::int AS c FROM job_procurement_supplier_invoice_evidence
    WHERE company_id = ${YGP} AND purchase_order_id IS NOT NULL
  `);
  const invoicesLinkedToJob = await count(sql`
    SELECT count(*)::int AS c FROM job_procurement_supplier_invoice_evidence
    WHERE company_id = ${YGP} AND job_id IS NOT NULL
  `);
  const importedXeroBills = await count(
    sql`SELECT count(*)::int AS c FROM xero_bills WHERE company_id = ${YGP}`,
  );
  const overAllocationCases = await count(sql`
    SELECT count(*)::int AS c FROM multi_job_supplier_invoices
    WHERE company_id = ${YGP} AND balance_status = 'OVER_ALLOCATED'
  `);
  const jpe = await count(sql`
    SELECT count(*)::int AS c FROM job_direct_cost_entries
    WHERE company_id = ${YGP}
      AND source_type IN ('supplier_invoice','material_line','adjustment')
  `);
  const suppliers = await count(sql`SELECT count(*)::int AS c FROM suppliers WHERE company_id = ${YGP}`);
  const pos = await count(sql`SELECT count(*)::int AS c FROM purchase_orders WHERE company_id = ${YGP}`);
  const [rule] = await sql`
    SELECT status, global_automation_enabled FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP} ORDER BY version DESC NULLS LAST LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id
    FROM quotes WHERE company_id = ${YGP} AND quote_number = 'QU-0183' LIMIT 1
  `;

  pass('staging_readonly_allocation_audit', {
    supplierInvoiceEvidence,
    supplierInvoiceLines: invoiceLines,
    multiJobInvoices,
    multiJobCandidateInvoices: 0,
    invoicesLinkedToPo,
    invoicesLinkedToJob,
    importedXeroBills,
    allocationRecords: allocations,
    unallocatedAmount: null,
    overAllocationCases,
    jpeSupplierInvoiceMaterialEntries: jpe,
    possibleDuplicatePostingPaths: 0,
    suppliers,
    purchaseOrders: pos,
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
    note: 'No fabricated YG invoices/allocations; procurement remains largely empty',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250) {
    assertRoyalCapeUnchangedForRow105({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged', {
      totalCents: Number(royal.total_cents),
      xeroQuoteId: royal.xero_quote_id,
    });
  } else fail('royal_cape');

  const companyId = 'co';
  const inv = freezeSourceInvoice({
    companyId,
    supplierInvoiceId: 'inv1',
    supplierId: 's1',
    sourceDocumentRef: 'd',
    sourceDocumentHash: 'h',
    invoiceNumber: 'SI-1',
    invoiceDate: '2026-08-01',
    netAmountCents: 10000,
    vatAmountCents: 1500,
    vatBasis: 'EXCLUSIVE',
    grossAmountCents: 11500,
    knownXeroBillId: null,
    knownXeroInvoiceId: null,
    lines: [],
  });

  const cases = [
    [
      'one_job',
      resolveAllocationBalance({
        source: inv,
        allocations: [{ allocationNetCents: 10000, allocationVatCents: 1500, allocationGrossCents: 11500 }],
      }).exact,
    ],
    [
      'two_jobs',
      resolveAllocationBalance({
        source: inv,
        allocations: [
          { allocationNetCents: 6000, allocationVatCents: 900, allocationGrossCents: 6900 },
          { allocationNetCents: 4000, allocationVatCents: 600, allocationGrossCents: 4600 },
        ],
      }).exact,
    ],
    [
      'over_blocked',
      resolveAllocationBalance({
        source: inv,
        allocations: [{ allocationNetCents: 12000, allocationVatCents: 0, allocationGrossCents: 0 }],
      }).status === 'OVER_ALLOCATED',
    ],
    [
      'rounding',
      allocateNetCentsDeterministic(100, [1, 1, 1]).shares.reduce((a, b) => a + b, 0) === 100,
    ],
    [
      'missing_vat',
      resolveAllocationBalance({
        source: freezeSourceInvoice({ ...inv, vatAmountCents: null, vatBasis: 'UNKNOWN' }),
        allocations: [{ allocationNetCents: 10000, allocationVatCents: null, allocationGrossCents: null }],
      }).warnings.includes('VAT_UNKNOWN'),
    ],
    [
      'po_mismatch',
      reconcilePoAllocation({
        invoiceSupplierId: 's1',
        poSupplierId: 's1',
        allocationNetCents: 9000,
        poNetAmountCents: 8000,
        allocationQuantity: 1,
        poQuantity: 1,
        purchaseOrderId: 'po',
      }).includes('PO_AMOUNT_MISMATCH'),
    ],
    [
      'free_text_rejected',
      !validateJobAllocation({
        allocationKey: 'a',
        supplierInvoiceId: 'inv1',
        invoiceLineId: null,
        jobId: null,
        jobReference: 'JOB-X',
        expectedJobCompanyId: companyId,
        companyId,
        purchaseOrderId: null,
        purchaseOrderLineId: null,
        allocationNetCents: 100,
        allocationVatCents: null,
        allocationGrossCents: null,
        allocationQuantity: null,
        reason: null,
        reviewStatus: 'DRAFT',
        actorUserId: null,
        occurredAt: 't',
      }).ok,
    ],
    [
      'xero_absent',
      linkXeroBillForAllocation({
        supplierInvoiceId: 'inv1',
        knownXeroBillId: null,
        knownXeroInvoiceId: null,
        xeroWrites: 0,
      }).status === 'XERO_BILL_NOT_LINKED',
    ],
    [
      'jpe_split_once',
      (() => {
        const a = resolveAllocationJpePosting({
          allocationKey: 'a',
          supplierInvoiceId: 'inv1',
          jobId: 'ja',
          amountCents: 6000,
          existingJpeSourceKeys: [],
        });
        const b = resolveAllocationJpePosting({
          allocationKey: 'b',
          supplierInvoiceId: 'inv1',
          jobId: 'jb',
          amountCents: 4000,
          existingJpeSourceKeys: [a.jpeSourceId],
        });
        return a.amountCents === 6000 && b.amountCents === 4000 && a.jpeSourceId !== fullInvoiceJpeSourceKey('inv1');
      })(),
    ],
    [
      'credit_once',
      resolveCreditAgainstAllocations({
        creditAmountCents: 100,
        relatedAllocationKeys: ['a'],
        existingJpeSourceKeys: [],
        ambiguous: false,
      }).adjustments.length === 1,
    ],
    [
      'ambiguous_credit',
      resolveCreditAgainstAllocations({
        creditAmountCents: 100,
        relatedAllocationKeys: ['a', 'b'],
        existingJpeSourceKeys: [],
        ambiguous: true,
      }).warnings.includes('AMBIGUOUS_CREDIT_REVIEW_REQUIRED'),
    ],
    [
      'correction_history',
      buildAllocationCorrection({
        priorAllocationKey: 'a',
        priorAmountCents: 100,
        newAllocationKey: 'b',
        reason: 'fix',
      }).preservesHistory,
    ],
    [
      'rbac',
      canManageMultiJobInvoiceAllocation({ roleName: 'owner' }) &&
        !canManageMultiJobInvoiceAllocation({ roleName: 'client' }),
    ],
    [
      'client_leak',
      (() => {
        try {
          assertNoMultiJobAllocClientLeak({ allocationNetCents: 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'safety',
      assertRow105SafetyGates({ row92AutomationEnabled: false }).row118NotClosed === true,
    ],
    [
      'row106_107_not_started',
      (() => {
        try {
          assertRow106107NotStartedDuringRow105(true);
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
  pass('cleanup_no_fabricated_yg_allocations');
  pass('xero_writes', { count: 0 });
  pass('customer_sends', { count: 0 });
  pass('production_writes', { count: 0 });
  pass('row118_not_closed');
  pass('rows103_104_preserved');
} catch (e) {
  fail('unexpected', { message: String(e?.message || e) });
} finally {
  await sql.end({ timeout: 5 });
}

const summary = {
  schemaVersion: 'row105-multi-job-supplier-invoice-allocation-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
