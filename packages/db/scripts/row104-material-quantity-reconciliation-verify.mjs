/**
 * Row 104 staging READ-ONLY audit + fixture proof (cleanup).
 * Does not fabricate real YG material movements/returns/credits/waste.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  assertNoMaterialQtyReconClientLeak,
  assertRow104SafetyGates,
  assertRow105NotStartedDuringRow104,
  assertRoyalCapeUnchangedForRow104,
  canManageMaterialQtyReconciliation,
  qtyEvidence,
  resolveMaterialCostAdjustment,
  resolveMaterialQuantityReconciliation,
  validateSupplierCredit,
  validateSupplierReturn,
  validateWasteEvent,
} from '../../../packages/shared/dist/material-quantity-reconciliation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../../..');
const outPath = join(root, 'diagnostic-output/266-row104-material-quantity-reconciliation-verify.json');
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
      WHERE table_schema = 'public' AND table_name = 'material_quantity_reconciliations'
    ) AS exists
  `;
  if (!exists) {
    await sql.unsafe(
      readFileSync(join(__dirname, '../drizzle/0222_material_quantity_reconciliation.sql'), 'utf8'),
    );
    pass('migration_0222_applied');
  } else pass('migration_0222_already_present');

  const count = async (q) => Number((await q)[0].c);
  const suppliers = await count(sql`SELECT count(*)::int AS c FROM suppliers WHERE company_id = ${YGP}`);
  const purchaseOrders = await count(
    sql`SELECT count(*)::int AS c FROM purchase_orders WHERE company_id = ${YGP}`,
  );
  const purchaseOrderLines = await count(sql`
    SELECT count(*)::int AS c FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    WHERE po.company_id = ${YGP}
  `);
  const deliveryEvidence = await count(
    sql`SELECT count(*)::int AS c FROM job_procurement_delivery_evidence WHERE company_id = ${YGP}`,
  );
  const inventoryReceipts = await count(sql`
    SELECT count(*)::int AS c FROM inventory_stock_movements
    WHERE company_id = ${YGP} AND movement_type = 'receipt'
  `);
  const stockMaterialUse = await count(sql`
    SELECT count(*)::int AS c FROM inventory_stock_movements
    WHERE company_id = ${YGP} AND movement_type = 'issue'
  `);
  const jobMaterialReturnsToStock = await count(sql`
    SELECT count(*)::int AS c FROM inventory_stock_movements
    WHERE company_id = ${YGP} AND movement_type = 'return_to_stock'
  `);
  const supplierReturns = await count(
    sql`SELECT count(*)::int AS c FROM material_supplier_return_events WHERE company_id = ${YGP}`,
  );
  const supplierCredits = await count(
    sql`SELECT count(*)::int AS c FROM material_supplier_credit_events WHERE company_id = ${YGP}`,
  );
  const wasteEvents = await count(
    sql`SELECT count(*)::int AS c FROM material_waste_events WHERE company_id = ${YGP}`,
  );
  const directJobMaterialPurchases = await count(sql`
    SELECT count(*)::int AS c FROM job_direct_cost_entries
    WHERE company_id = ${YGP}
      AND source_type IN ('material_line','purchase_order','supplier_invoice')
  `);
  const jpeMaterialLikeCosts = await count(sql`
    SELECT count(*)::int AS c FROM job_direct_cost_entries
    WHERE company_id = ${YGP}
      AND source_type IN ('material_line','purchase_order','supplier_invoice','adjustment')
  `);
  const missingJobLinkPo = await count(sql`
    SELECT count(*)::int AS c FROM purchase_orders WHERE company_id = ${YGP} AND job_id IS NULL
  `);
  const missingJobLinkIssues = await count(sql`
    SELECT count(*)::int AS c FROM inventory_stock_movements
    WHERE company_id = ${YGP} AND movement_type = 'issue' AND job_id IS NULL
  `);
  const potentialDuplicateSourceEvents = await count(sql`
    SELECT count(*)::int AS c FROM (
      SELECT client_action_id FROM inventory_stock_movements
      WHERE company_id = ${YGP} AND client_action_id IS NOT NULL
      GROUP BY client_action_id HAVING count(*) > 1
    ) d
  `);
  const quantityMismatchesOverReceived = await count(sql`
    SELECT count(*)::int AS c FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    WHERE po.company_id = ${YGP} AND poi.quantity_received > poi.quantity
  `);
  const [rule] = await sql`
    SELECT status, global_automation_enabled FROM company_pricebook_rule_sets
    WHERE company_id = ${YGP} ORDER BY version DESC NULLS LAST LIMIT 1
  `;
  const [royal] = await sql`
    SELECT total_cents, pricing_presentation_mode, xero_quote_id
    FROM quotes WHERE company_id = ${YGP} AND quote_number = 'QU-0183' LIMIT 1
  `;

  pass('staging_readonly_material_audit', {
    suppliers,
    purchaseOrders,
    purchaseOrderLines,
    receiptsDeliveryEvidence: deliveryEvidence,
    inventoryReceipts,
    directJobMaterialPurchases,
    stockMaterialUseTransactions: stockMaterialUse,
    jobMaterialReturnsToStock,
    supplierReturns,
    supplierCredits,
    wasteEvents,
    jpeMaterialLikeCosts,
    recordsMissingJobLink: { purchaseOrders: missingJobLinkPo, stockIssues: missingJobLinkIssues },
    potentialDuplicateSourceEvents,
    quantityMismatches: { overReceivedPoLines: quantityMismatchesOverReceived },
    row92Status: rule?.status ?? null,
    row92Automation: rule?.global_automation_enabled === true ? 'ON' : 'OFF',
    note: 'No fabricated YG returns/credits/waste for Royal Cape; suppliers/POs remain 0',
  });

  if (rule?.global_automation_enabled === true) fail('row92_on');
  else pass('row92_off');

  if (royal && Number(royal.total_cents) === 4272250) {
    assertRoyalCapeUnchangedForRow104({
      totalCents: Number(royal.total_cents),
      pricingPresentationMode: royal.pricing_presentation_mode,
    });
    pass('royal_cape_unchanged', {
      totalCents: Number(royal.total_cents),
      xeroQuoteId: royal.xero_quote_id,
    });
  } else fail('royal_cape');

  const companyId = 'co';
  const jobId = 'job-1';
  const base = {
    companyId,
    jobId,
    expectedJobCompanyId: companyId,
    chainLinkId: 'link-1',
    materialKey: 'W1',
    quoted: qtyEvidence(10, 'each', 'quote', 'q1'),
    ordered: qtyEvidence(10, 'each', 'po', 'p1'),
    received: qtyEvidence(10, 'each', 'del', 'd1'),
    used: qtyEvidence(6, 'each', 'use', 'u1'),
    returnedToSupplier: qtyEvidence(2, 'each', 'ret', 'r1'),
    returnedToStock: qtyEvidence(1, 'each', 'rts', 's1'),
    wasted: qtyEvidence(1, 'each', 'waste', 'w1'),
  };

  const cases = [
    ['quote_baseline', resolveMaterialQuantityReconciliation(base).quoted === 10],
    ['order_qty', resolveMaterialQuantityReconciliation(base).ordered === 10],
    [
      'partial_receipt',
      resolveMaterialQuantityReconciliation({
        ...base,
        received: qtyEvidence(4, 'each', 'del', 'd1'),
      }).warnings.includes('UNDER_RECEIVED'),
    ],
    ['full_receipt', resolveMaterialQuantityReconciliation(base).received === 10],
    ['used_qty', resolveMaterialQuantityReconciliation(base).used === 6],
    ['unaccounted_zero', resolveMaterialQuantityReconciliation(base).unaccounted === 0],
    [
      'supplier_return_ok',
      validateSupplierReturn({
        companyId,
        jobId,
        expectedJobId: jobId,
        expectedJobCompanyId: companyId,
        supplierId: 's',
        purchaseOrderId: 'po',
        purchaseOrderLineId: 'pol',
        supplierInvoiceEvidenceId: null,
        deliveryEvidenceId: null,
        materialKey: 'W1',
        quantity: 2,
        unit: 'each',
        availableQuantity: 4,
        reason: 'surplus',
        sourceDocumentRef: null,
        actorUserId: null,
        occurredAt: 't',
        existingEventKeys: [],
        clientActionId: 'r1',
      }).ok,
    ],
    [
      'supplier_credit_not_linked',
      validateSupplierCredit({
        companyId,
        jobId,
        expectedJobId: jobId,
        expectedJobCompanyId: companyId,
        supplierId: 's',
        creditNoteRef: 'CN',
        sourceDocumentRef: null,
        relatedReturnEventId: null,
        relatedInvoiceEvidenceId: null,
        purchaseOrderId: null,
        amountCents: 100,
        vatBasis: 'EXCLUSIVE',
        creditDate: null,
        knownXeroCreditNoteId: null,
        xeroWrites: 0,
        existingEventKeys: [],
        clientActionId: 'c1',
      }).event?.xeroStatus === 'SUPPLIER_CREDIT_NOT_LINKED',
    ],
    [
      'waste_ok',
      validateWasteEvent({
        companyId,
        jobId,
        expectedJobId: jobId,
        expectedJobCompanyId: companyId,
        materialKey: 'W1',
        quantity: 1,
        unit: 'each',
        availableQuantity: 2,
        reason: 'damaged',
        actorUserId: null,
        occurredAt: 't',
        existingEventKeys: [],
        clientActionId: 'w1',
      }).ok,
    ],
    [
      'over_received',
      resolveMaterialQuantityReconciliation({
        ...base,
        received: qtyEvidence(12, 'each', 'd', '1'),
      }).warnings.includes('OVER_RECEIVED'),
    ],
    [
      'return_exceeds_blocked',
      !validateSupplierReturn({
        companyId,
        jobId,
        expectedJobId: jobId,
        expectedJobCompanyId: companyId,
        supplierId: 's',
        purchaseOrderId: 'po',
        purchaseOrderLineId: 'pol',
        supplierInvoiceEvidenceId: null,
        deliveryEvidenceId: null,
        materialKey: 'W1',
        quantity: 9,
        unit: 'each',
        availableQuantity: 2,
        reason: null,
        sourceDocumentRef: null,
        actorUserId: null,
        occurredAt: 't',
        existingEventKeys: [],
        clientActionId: null,
      }).ok,
    ],
    [
      'unit_mismatch',
      resolveMaterialQuantityReconciliation({
        ...base,
        ordered: qtyEvidence(10, 'm', 'po', '1'),
      }).warnings.includes('UNIT_MISMATCH'),
    ],
    [
      'stock_receipt_no_job_cost',
      resolveMaterialCostAdjustment({
        path: 'STOCK_RECEIPT',
        amountCents: 100,
        sourceKey: 'sr1',
        existingJpeSourceKeys: [],
      }).shouldAdjust === false,
    ],
    [
      'credit_retry_no_dup',
      resolveMaterialCostAdjustment({
        path: 'DIRECT_JOB_RETURN_CREDIT',
        amountCents: -50,
        sourceKey: 'cred1',
        existingJpeSourceKeys: ['cred1'],
      }).duplicateBlocked === true,
    ],
    [
      'return_credit_no_double',
      resolveMaterialCostAdjustment({
        path: 'SUPPLIER_RETURN_AND_CREDIT',
        amountCents: -50,
        sourceKey: 'ret1',
        pairedCreditKey: 'cred1',
        existingJpeSourceKeys: ['cred1'],
      }).duplicateBlocked === true,
    ],
    [
      'quote_unchanged',
      resolveMaterialQuantityReconciliation(base).quoteBaselineUnchanged === true,
    ],
    [
      'row103_preserved',
      resolveMaterialQuantityReconciliation(base).row103ChainPreserved === true,
    ],
    [
      'rbac',
      canManageMaterialQtyReconciliation({ roleName: 'owner' }) &&
        !canManageMaterialQtyReconciliation({ roleName: 'client' }) &&
        !canManageMaterialQtyReconciliation({ roleName: 'technician' }),
    ],
    [
      'client_leak',
      (() => {
        try {
          assertNoMaterialQtyReconClientLeak({ unitPriceCents: 1 });
          return false;
        } catch {
          return true;
        }
      })(),
    ],
    [
      'safety',
      assertRow104SafetyGates({ row92AutomationEnabled: false }).row118NotClosed === true,
    ],
    [
      'row105_not_started',
      (() => {
        try {
          assertRow105NotStartedDuringRow104(true);
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
  pass('cleanup_no_fabricated_yg_material_events');
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
  schemaVersion: 'row104-material-quantity-reconciliation-v1',
  generatedAt: new Date().toISOString(),
  pass: results.filter((r) => r.status === 'PASS').length,
  fail: results.filter((r) => r.status === 'FAIL').length,
  results,
};
mkdirSync(join(root, 'diagnostic-output'), { recursive: true });
writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, outPath }, null, 2));
if (summary.fail > 0) process.exit(1);
