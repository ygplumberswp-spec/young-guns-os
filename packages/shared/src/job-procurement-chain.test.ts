import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  JOB_PROCUREMENT_CHAIN_ROYAL_CAPE,
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
  projectTechOperationalMaterialView,
  projectXeroBillLinkage,
  recordDeliveryEvidence,
  recordSupplierInvoiceEvidence,
  resolveMaterialCostPosting,
  type ApprovedProposalLineInput,
} from './job-procurement-chain.js';

const companyId = 'company-a';
const jobId = 'job-1';
const otherJob = 'job-2';

function approvedLine(
  partial: Partial<ApprovedProposalLineInput> = {},
): ApprovedProposalLineInput {
  return {
    companyId,
    proposalId: 'prop-1',
    proposalLineId: 'pline-1',
    proposalStatus: 'REVIEWED',
    boqImportId: 'boq-1',
    boqImportRowId: 'brow-1',
    quoteId: 'quote-1',
    jobId,
    supplierId: 'sup-1',
    supplierName: 'Supplier A',
    row100ProposalKey: 'r100-p1',
    offerKey: 'offer-a',
    quantityProposed: 4,
    unitPriceCents: 1000,
    vatBasis: 'EXCLUSIVE',
    expectedSupplierCostCents: 4600,
    sourceDocumentRef: 'SQ-A.pdf',
    ...partial,
  };
}

describe('Row 103 Job-linked procurement chain', () => {
  it('1 BOQ → Quote → Job trace', () => {
    const t = buildBoqQuoteJobTrace({
      boqImportId: 'boq-1',
      boqImportRowId: 'brow-1',
      quoteId: 'quote-1',
      quoteLineId: 'qline-1',
      jobId,
    });
    assert.equal(t.ok, true);
    assert.equal(t.chain?.jobId, jobId);
  });

  it('2-3 approved supplier offer → PO; PO retains Job', () => {
    const po = buildPoDraftFromApprovedProposal(approvedLine());
    assert.equal(po.ok, true);
    assert.equal(po.createsPurchaseOrder, true);
    assert.equal(po.poDraft?.jobId, jobId);
    assert.equal(po.poDraft?.jobReference, null);
    assert.equal(po.poDraft?.items[0]?.proposalLineId, 'pline-1');
  });

  it('4 free-text-only Job link rejected', () => {
    const link = assertCanonicalJobLink({
      companyId,
      jobId: null,
      jobReference: 'JOB-000002 somehow',
      expectedJobCompanyId: companyId,
    });
    assert.equal(link.ok, false);
    if (!link.ok) {
      assert.ok(link.warnings.includes('FREE_TEXT_JOB_LINK_REJECTED'));
      assert.ok(link.warnings.includes('JOB_LINK_MISSING'));
    }
    const po = buildPoDraftFromApprovedProposal(
      approvedLine({ jobId: null }),
    );
    assert.equal(po.ok, false);
  });

  it('5-6 delivery retains PO+Job; partial preserved', () => {
    const d = recordDeliveryEvidence({
      companyId,
      purchaseOrderId: 'po-1',
      purchaseOrderLineId: 'pol-1',
      jobId,
      expectedJobId: jobId,
      deliveredQuantity: 2,
      deliveredAt: '2026-08-08',
      deliveryReference: 'DN-1',
      orderedQuantity: 4,
    });
    assert.equal(d.ok, true);
    assert.equal(d.partial, true);
    assert.equal(d.evidence?.jobId, jobId);
    assert.equal(d.evidence?.purchaseOrderLineId, 'pol-1');
  });

  it('7-8 supplier invoice retains links; missing fields stay missing', () => {
    const inv = recordSupplierInvoiceEvidence({
      companyId,
      supplierId: 'sup-1',
      invoiceNumber: null,
      invoiceDate: null,
      sourceDocumentRef: 'inv.pdf',
      purchaseOrderId: 'po-1',
      purchaseOrderLineId: 'pol-1',
      deliveryEvidenceId: 'del-1',
      jobId,
      expectedJobId: jobId,
      lineQuantity: 2,
      lineCostCents: 2000,
      vatBasis: 'UNKNOWN',
    });
    assert.equal(inv.ok, true);
    assert.ok(inv.line?.missingFields.includes('invoiceNumber'));
    assert.ok(inv.line?.missingFields.includes('vatBasis'));
    assert.equal(inv.line?.invoiceNumber, null);
  });

  it('9-11 Xero bill projection / link / absent', () => {
    const absent = projectXeroBillLinkage({
      companyId,
      supplierInvoiceEvidenceId: 'inv-1',
      knownXeroBillId: null,
      knownXeroInvoiceId: null,
      xeroWrites: 0,
    });
    assert.equal(absent.xeroWrites, 0);
    assert.equal(absent.projection.status, 'XERO_BILL_NOT_LINKED');
    assert.equal(absent.warning, 'XERO_BILL_NOT_LINKED');

    const linked = projectXeroBillLinkage({
      companyId,
      supplierInvoiceEvidenceId: 'inv-1',
      knownXeroBillId: 'xero-bill-row-1',
      knownXeroInvoiceId: 'ACCPAY-LEGIT-1',
      xeroWrites: 0,
    });
    assert.equal(linked.linked, true);
    assert.equal(linked.projection.xeroInvoiceId, 'ACCPAY-LEGIT-1');
    assert.throws(() =>
      projectXeroBillLinkage({
        companyId,
        supplierInvoiceEvidenceId: 'inv-1',
        knownXeroBillId: 'x',
        knownXeroInvoiceId: null,
        xeroWrites: 1,
      }),
    );
  });

  it('12-13 direct-to-job material cost once; retry no duplicate', () => {
    const first = resolveMaterialCostPosting({
      companyId,
      jobId,
      path: 'DIRECT_TO_JOB',
      supplierInvoiceEvidenceId: 'inv-1',
      stockReceiptMovementId: null,
      materialUseTransactionId: null,
      amountCents: 2000,
      existingJpeSourceKeys: [],
    });
    assert.equal(first.shouldPost, true);
    assert.equal(first.jpeSourceType, 'supplier_invoice');
    const key = first.jpeSourceId!;
    const retry = resolveMaterialCostPosting({
      companyId,
      jobId,
      path: 'DIRECT_TO_JOB',
      supplierInvoiceEvidenceId: 'inv-1',
      stockReceiptMovementId: null,
      materialUseTransactionId: null,
      amountCents: 2000,
      existingJpeSourceKeys: [key],
    });
    assert.equal(retry.shouldPost, false);
    assert.equal(retry.duplicateBlocked, true);
  });

  it('14-16 stock receipt no Job cost; material use once; invoice+use double-count blocked', () => {
    const receiptOnly = resolveMaterialCostPosting({
      companyId,
      jobId,
      path: 'STOCK',
      supplierInvoiceEvidenceId: 'inv-stock',
      stockReceiptMovementId: 'mov-1',
      materialUseTransactionId: null,
      amountCents: 3000,
      existingJpeSourceKeys: [],
    });
    assert.equal(receiptOnly.shouldPost, false);
    assert.equal(receiptOnly.costAuthority, 'stock_receipt_only');

    const use = resolveMaterialCostPosting({
      companyId,
      jobId,
      path: 'STOCK',
      supplierInvoiceEvidenceId: 'inv-stock',
      stockReceiptMovementId: 'mov-1',
      materialUseTransactionId: 'mu-1',
      amountCents: 3000,
      existingJpeSourceKeys: [],
    });
    assert.equal(use.shouldPost, true);

    const afterInvoice = resolveMaterialCostPosting({
      companyId,
      jobId,
      path: 'STOCK',
      supplierInvoiceEvidenceId: 'inv-stock',
      stockReceiptMovementId: 'mov-1',
      materialUseTransactionId: 'mu-1',
      amountCents: 3000,
      existingJpeSourceKeys: [
        jpeCostSourceKey({ path: 'DIRECT_TO_JOB', supplierInvoiceEvidenceId: 'inv-stock' }),
      ],
    });
    assert.equal(afterInvoice.duplicateBlocked, true);
    assert.equal(afterInvoice.shouldPost, false);
  });

  it('17-18 wrong Job + cross-tenant blocked', () => {
    const wrong = assertCanonicalJobLink({
      companyId,
      jobId: otherJob,
      expectedJobCompanyId: companyId,
      expectedJobId: jobId,
    });
    assert.equal(wrong.ok, false);
    if (!wrong.ok) assert.ok(wrong.warnings.includes('JOB_LINK_CONFLICT'));

    const xt = assertCanonicalJobLink({
      companyId: 'company-a',
      jobId,
      expectedJobCompanyId: 'company-b',
      expectedJobId: jobId,
    });
    assert.equal(xt.ok, false);
    if (!xt.ok) assert.ok(xt.warnings.includes('CROSS_TENANT_LINK_BLOCKED'));
  });

  it('19 unreviewed Row101 proposal cannot auto-purchase', () => {
    const po = buildPoDraftFromApprovedProposal(approvedLine({ proposalStatus: 'DRAFT' }));
    assert.equal(po.ok, false);
    assert.ok(po.warnings.includes('UNREVIEWED_PROPOSAL_BLOCKED'));
    assert.equal(po.createsPurchaseOrder, false);
  });

  it('20-23 Rows99–102 preserved flags', () => {
    assert.doesNotThrow(() =>
      assertRows99to102Preserved({
        row99Immutable: true,
        row100EvidencePreserved: true,
        row101ProposalPreserved: true,
        row102ExportsUnchanged: true,
      }),
    );
  });

  it('24-26 no Row104/105/106-107 engines', () => {
    assert.throws(() => assertRow104NotStarted(true));
    assert.throws(() => assertRow105NotStarted(true));
    assert.throws(() => assertRow106107NotStarted(true));
    const g = assertRow103SafetyGates({ row92AutomationEnabled: false });
    assert.equal(g.row118NotClosed, true);
    assert.equal(g.xeroWrites, 0);
  });

  it('27-28 Client/Tech denied internals', () => {
    assert.equal(canManageJobProcurementChain({ roleName: 'owner' }), true);
    assert.equal(canManageJobProcurementChain({ roleName: 'client' }), false);
    assert.equal(canManageJobProcurementChain({ roleName: 'technician' }), false);
    assert.throws(() => assertNoJobProcurementChainClientLeak({ unitPriceCents: 1 }));
    assert.throws(() => assertNoJobProcurementChainClientLeak({ jpeProfitCents: 1 }));
    const tech = projectTechOperationalMaterialView({
      jobId,
      description: 'Pipe',
      quantity: 2,
    });
    assert.equal(tech.supplierPricingVisible, false);
    assert.equal(tech.jpeProfitVisible, false);
  });

  it('29-30 audit/idempotency + Royal Cape', () => {
    const k1 = chainIdempotencyKey({
      companyId,
      proposalLineId: 'pline-1',
      hop: 'po',
    });
    const k2 = chainIdempotencyKey({
      companyId,
      proposalLineId: 'pline-1',
      hop: 'po',
    });
    assert.equal(k1, k2);
    assertRoyalCapeUnchangedForRow103({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
    assert.equal(JOB_PROCUREMENT_CHAIN_ROYAL_CAPE.expectedTotalCents, 4_272_250);
  });
});
