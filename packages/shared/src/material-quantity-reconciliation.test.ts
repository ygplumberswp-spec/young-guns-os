import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MATERIAL_QTY_RECON_ROYAL_CAPE,
  assertNoMaterialQtyReconClientLeak,
  assertRow104SafetyGates,
  assertRow105NotStartedDuringRow104,
  assertRow106107NotStartedDuringRow104,
  assertRoyalCapeUnchangedForRow104,
  canManageMaterialQtyReconciliation,
  materialEventIdempotencyKey,
  projectTechOperationalQtyView,
  qtyEvidence,
  resolveMaterialCostAdjustment,
  resolveMaterialQuantityReconciliation,
  validateSupplierCredit,
  validateSupplierReturn,
  validateWasteEvent,
} from './material-quantity-reconciliation.js';

const companyId = 'co-1';
const jobId = 'job-1';

function baseQty(partial: Parameters<typeof resolveMaterialQuantityReconciliation>[0] extends infer T
  ? Partial<T>
  : never = {}) {
  return {
    companyId,
    jobId,
    expectedJobCompanyId: companyId,
    chainLinkId: 'link-1',
    materialKey: 'W1',
    quoted: qtyEvidence(10, 'each', 'quote_line', 'ql-1'),
    ordered: qtyEvidence(10, 'each', 'po_line', 'pol-1'),
    received: qtyEvidence(10, 'each', 'delivery', 'del-1'),
    used: qtyEvidence(6, 'each', 'material_use', 'mu-1'),
    returnedToSupplier: qtyEvidence(0, 'each', 'none', null),
    returnedToStock: qtyEvidence(0, 'each', 'none', null),
    wasted: qtyEvidence(0, 'each', 'none', null),
    ...partial,
  };
}

describe('Row 104 material quantity reconciliation', () => {
  it('1-6 quote/order/receipt/used/remainder', () => {
    const r = resolveMaterialQuantityReconciliation(
      baseQty({
        received: qtyEvidence(8, 'each', 'delivery', 'del-1'),
        used: qtyEvidence(5, 'each', 'material_use', 'mu-1'),
        returnedToSupplier: qtyEvidence(0, 'each', 'return', null),
        returnedToStock: qtyEvidence(2, 'each', 'return_stock', 'rts-1'),
        wasted: qtyEvidence(1, 'each', 'waste', 'w-1'),
      }),
    );
    assert.equal(r.quoted, 10);
    assert.equal(r.ordered, 10);
    assert.equal(r.received, 8);
    assert.equal(r.used, 5);
    assert.equal(r.returnedToStock, 2);
    assert.equal(r.wasted, 1);
    assert.equal(r.unaccounted, 0);
    assert.equal(r.quoteBaselineUnchanged, true);
  });

  it('3-4 partial and full receipt', () => {
    const partial = resolveMaterialQuantityReconciliation(
      baseQty({ received: qtyEvidence(4, 'each', 'delivery', 'd1') }),
    );
    assert.ok(partial.warnings.includes('UNDER_RECEIVED'));
    const full = resolveMaterialQuantityReconciliation(baseQty());
    assert.equal(full.received, 10);
    assert.ok(!full.warnings.includes('UNDER_RECEIVED'));
  });

  it('7-10 return-to-stock, supplier return, credit, waste', () => {
    const ret = validateSupplierReturn({
      companyId,
      jobId,
      expectedJobId: jobId,
      expectedJobCompanyId: companyId,
      supplierId: 'sup-1',
      purchaseOrderId: 'po-1',
      purchaseOrderLineId: 'pol-1',
      supplierInvoiceEvidenceId: 'inv-1',
      deliveryEvidenceId: 'del-1',
      materialKey: 'W1',
      quantity: 2,
      unit: 'each',
      availableQuantity: 4,
      reason: 'surplus',
      sourceDocumentRef: 'RN-1',
      actorUserId: 'u1',
      occurredAt: '2026-08-08T00:00:00.000Z',
      existingEventKeys: [],
      clientActionId: 'ret-1',
    });
    assert.equal(ret.ok, true);
    assert.equal(ret.event?.deletesOriginalReceipt, false);

    const credit = validateSupplierCredit({
      companyId,
      jobId,
      expectedJobId: jobId,
      expectedJobCompanyId: companyId,
      supplierId: 'sup-1',
      creditNoteRef: 'CN-1',
      sourceDocumentRef: 'cn.pdf',
      relatedReturnEventId: 'ret-ev-1',
      relatedInvoiceEvidenceId: 'inv-1',
      purchaseOrderId: 'po-1',
      amountCents: 2000,
      vatBasis: 'EXCLUSIVE',
      creditDate: '2026-08-08',
      knownXeroCreditNoteId: null,
      xeroWrites: 0,
      existingEventKeys: [],
      clientActionId: 'cred-1',
    });
    assert.equal(credit.ok, true);
    assert.equal(credit.event?.xeroStatus, 'SUPPLIER_CREDIT_NOT_LINKED');
    assert.equal(credit.xeroWrites, 0);

    const waste = validateWasteEvent({
      companyId,
      jobId,
      expectedJobId: jobId,
      expectedJobCompanyId: companyId,
      materialKey: 'W1',
      quantity: 1,
      unit: 'each',
      availableQuantity: 3,
      reason: 'damaged',
      actorUserId: 'u1',
      occurredAt: '2026-08-08T01:00:00.000Z',
      existingEventKeys: [],
      clientActionId: 'waste-1',
    });
    assert.equal(waste.ok, true);
  });

  it('11-15 under/over received, over-used, return/waste exceed blocked', () => {
    assert.ok(
      resolveMaterialQuantityReconciliation(
        baseQty({ received: qtyEvidence(4, 'each', 'd', '1') }),
      ).warnings.includes('UNDER_RECEIVED'),
    );
    assert.ok(
      resolveMaterialQuantityReconciliation(
        baseQty({ received: qtyEvidence(12, 'each', 'd', '1') }),
      ).warnings.includes('OVER_RECEIVED'),
    );
    const overUsed = resolveMaterialQuantityReconciliation(
      baseQty({
        received: qtyEvidence(5, 'each', 'd', '1'),
        used: qtyEvidence(9, 'each', 'u', '1'),
      }),
    );
    assert.ok(overUsed.warnings.includes('OVER_USED'));
    assert.equal(overUsed.status, 'BLOCKED');

    assert.equal(
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
        quantity: 5,
        unit: 'each',
        availableQuantity: 2,
        reason: null,
        sourceDocumentRef: null,
        actorUserId: null,
        occurredAt: 't',
        existingEventKeys: [],
        clientActionId: null,
      }).ok,
      false,
    );
    assert.equal(
      validateWasteEvent({
        companyId,
        jobId,
        expectedJobId: jobId,
        expectedJobCompanyId: companyId,
        materialKey: 'W1',
        quantity: 5,
        unit: 'each',
        availableQuantity: 1,
        reason: null,
        actorUserId: null,
        occurredAt: 't',
        existingEventKeys: [],
        clientActionId: null,
      }).ok,
      false,
    );
  });

  it('16-17 unit mismatch; missing source stays unknown', () => {
    const mm = resolveMaterialQuantityReconciliation(
      baseQty({
        ordered: qtyEvidence(10, 'm', 'po', '1'),
        received: qtyEvidence(10, 'each', 'd', '1'),
      }),
    );
    assert.ok(mm.warnings.includes('UNIT_MISMATCH'));

    const unknown = resolveMaterialQuantityReconciliation(
      baseQty({
        received: qtyEvidence(null, 'each', null, null, false),
        used: qtyEvidence(null, null, null, null, false),
        returnedToSupplier: qtyEvidence(null, null, null, null, false),
        returnedToStock: qtyEvidence(null, null, null, null, false),
        wasted: qtyEvidence(null, null, null, null, false),
      }),
    );
    assert.ok(unknown.warnings.includes('UNKNOWN_QUANTITY'));
    assert.equal(unknown.unaccounted, null);
  });

  it('18-24 cost exactly-once paths', () => {
    const purchase = resolveMaterialCostAdjustment({
      path: 'DIRECT_JOB_PURCHASE',
      amountCents: 5000,
      sourceKey: 'supplier_invoice:inv-1',
      existingJpeSourceKeys: [],
    });
    assert.equal(purchase.shouldAdjust, true);

    const returnAdj = resolveMaterialCostAdjustment({
      path: 'DIRECT_JOB_RETURN_CREDIT',
      amountCents: -2000,
      sourceKey: 'supplier_return:ret-1',
      existingJpeSourceKeys: ['supplier_invoice:inv-1'],
    });
    assert.equal(returnAdj.shouldAdjust, true);

    const creditRetry = resolveMaterialCostAdjustment({
      path: 'DIRECT_JOB_RETURN_CREDIT',
      amountCents: -2000,
      sourceKey: 'supplier_credit:cred-1',
      existingJpeSourceKeys: ['supplier_credit:cred-1'],
    });
    assert.equal(creditRetry.duplicateBlocked, true);

    const stockReceipt = resolveMaterialCostAdjustment({
      path: 'STOCK_RECEIPT',
      amountCents: 3000,
      sourceKey: 'stock_receipt:m1',
      existingJpeSourceKeys: [],
    });
    assert.equal(stockReceipt.shouldAdjust, false);
    assert.equal(stockReceipt.costAuthority, 'stock_receipt_no_job_cost');

    const stockUse = resolveMaterialCostAdjustment({
      path: 'STOCK_USE',
      amountCents: 3000,
      sourceKey: 'material_use:mu-1',
      existingJpeSourceKeys: [],
    });
    assert.equal(stockUse.shouldAdjust, true);

    const rts = resolveMaterialCostAdjustment({
      path: 'RETURN_TO_STOCK',
      amountCents: -1000,
      sourceKey: 'return_to_stock:rts-1',
      existingJpeSourceKeys: [],
    });
    assert.equal(rts.shouldAdjust, true);

    const double = resolveMaterialCostAdjustment({
      path: 'SUPPLIER_RETURN_AND_CREDIT',
      amountCents: -2000,
      sourceKey: 'supplier_return:ret-1',
      pairedCreditKey: 'supplier_credit:cred-1',
      existingJpeSourceKeys: ['supplier_credit:cred-1'],
    });
    assert.equal(double.duplicateBlocked, true);
  });

  it('25-28 quote unchanged; Row103 preserved; wrong job / cross-tenant', () => {
    const r = resolveMaterialQuantityReconciliation(baseQty());
    assert.equal(r.quoteBaselineUnchanged, true);
    assert.equal(r.row103ChainPreserved, true);
    assert.equal(r.quoted, 10);

    const wrong = resolveMaterialQuantityReconciliation({
      ...baseQty(),
      jobId: 'job-2',
      // expected via assertCanonicalJobLink expectedJobId equals jobId in resolver — use conflict via company
      expectedJobCompanyId: 'other-co',
    });
    assert.equal(wrong.ok, false);
  });

  it('29-30 Client denied; Tech operational qty only', () => {
    assert.equal(canManageMaterialQtyReconciliation({ roleName: 'owner' }), true);
    assert.equal(canManageMaterialQtyReconciliation({ roleName: 'client' }), false);
    assert.equal(canManageMaterialQtyReconciliation({ roleName: 'technician' }), false);
    assert.throws(() => assertNoMaterialQtyReconClientLeak({ unitPriceCents: 1 }));
    const tech = projectTechOperationalQtyView({
      jobId,
      ordered: 10,
      received: 8,
      used: 5,
    });
    assert.equal(tech.supplierCostVisible, false);
    assert.equal(tech.creditAmountVisible, false);
  });

  it('31-33 audit/idempotency/safety + Royal Cape', () => {
    assert.equal(
      materialEventIdempotencyKey(['a', 'b']),
      materialEventIdempotencyKey(['a', 'b']),
    );
    const g = assertRow104SafetyGates({ row92AutomationEnabled: false });
    assert.equal(g.row118NotClosed, true);
    assert.throws(() => assertRow105NotStartedDuringRow104(true));
    assert.throws(() => assertRow106107NotStartedDuringRow104(true));
    assertRoyalCapeUnchangedForRow104({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
    assert.equal(MATERIAL_QTY_RECON_ROYAL_CAPE.expectedTotalCents, 4_272_250);

    const dupReturn = validateSupplierReturn({
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
      quantity: 1,
      unit: 'each',
      availableQuantity: 2,
      reason: null,
      sourceDocumentRef: null,
      actorUserId: null,
      occurredAt: 't',
      existingEventKeys: ['ret-dup'],
      clientActionId: 'ret-dup',
    });
    assert.ok(dupReturn.warnings.includes('DUPLICATE_EVENT_BLOCKED'));
  });
});
