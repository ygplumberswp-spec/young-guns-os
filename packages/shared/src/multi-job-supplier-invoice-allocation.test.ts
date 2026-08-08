import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
  projectTechSafeAllocationView,
  reconcilePoAllocation,
  resolveAllocationBalance,
  resolveAllocationJpePosting,
  resolveCreditAgainstAllocations,
  validateJobAllocation,
} from './multi-job-supplier-invoice-allocation.js';

const companyId = 'co-1';
const invId = 'inv-1';

function source(overrides: Partial<ReturnType<typeof freezeSourceInvoice>> = {}) {
  return freezeSourceInvoice({
    companyId,
    supplierInvoiceId: invId,
    supplierId: 'sup-1',
    sourceDocumentRef: 'doc.pdf',
    sourceDocumentHash: 'hash1',
    invoiceNumber: 'SI-100',
    invoiceDate: '2026-08-01',
    netAmountCents: 10_000,
    vatAmountCents: 1_500,
    vatBasis: 'EXCLUSIVE',
    grossAmountCents: 11_500,
    knownXeroBillId: null,
    knownXeroInvoiceId: null,
    lines: [
      {
        lineId: 'L1',
        lineOrder: 1,
        itemCode: 'W1',
        description: 'Widget',
        quantity: 10,
        unit: 'each',
        netAmountCents: 10_000,
        vatAmountCents: 1_500,
        vatBasis: 'EXCLUSIVE',
        grossAmountCents: 11_500,
        purchaseOrderId: 'po-1',
        purchaseOrderLineId: 'pol-1',
      },
    ],
    ...overrides,
  });
}

function draft(partial: Partial<Parameters<typeof validateJobAllocation>[0]> = {}) {
  return validateJobAllocation({
    allocationKey: 'alloc-a',
    supplierInvoiceId: invId,
    invoiceLineId: 'L1',
    jobId: 'job-a',
    expectedJobCompanyId: companyId,
    companyId,
    purchaseOrderId: 'po-1',
    purchaseOrderLineId: 'pol-1',
    allocationNetCents: 10_000,
    allocationVatCents: 1_500,
    allocationGrossCents: 11_500,
    allocationQuantity: 10,
    reason: 'full',
    reviewStatus: 'APPROVED',
    actorUserId: 'u1',
    occurredAt: 't',
    poNetAmountCents: 10_000,
    poQuantity: 10,
    poSupplierId: 'sup-1',
    ...partial,
  });
}

describe('Row 105 multi-job supplier invoice allocation', () => {
  it('1 one invoice → one Job', () => {
    const a = draft();
    assert.equal(a.ok, true);
    assert.equal(a.allocation?.jobId, 'job-a');
    const bal = resolveAllocationBalance({
      source: source(),
      allocations: [{ allocationNetCents: 10_000, allocationVatCents: 1_500, allocationGrossCents: 11_500 }],
    });
    assert.equal(bal.status, 'RECONCILED');
    assert.equal(bal.exact, true);
  });

  it('2-4 one invoice/line → two Jobs; two lines → different Jobs', () => {
    const a = draft({ allocationKey: 'a', allocationNetCents: 6_000, allocationVatCents: 900, allocationGrossCents: 6_900, jobId: 'job-a' });
    const b = draft({ allocationKey: 'b', allocationNetCents: 4_000, allocationVatCents: 600, allocationGrossCents: 4_600, jobId: 'job-b' });
    assert.equal(a.ok && b.ok, true);
    const bal = resolveAllocationBalance({
      source: source(),
      allocations: [
        { allocationNetCents: 6_000, allocationVatCents: 900, allocationGrossCents: 6_900 },
        { allocationNetCents: 4_000, allocationVatCents: 600, allocationGrossCents: 4_600 },
      ],
    });
    assert.equal(bal.exact, true);

    const twoLines = resolveAllocationBalance({
      source: source({
        lines: [
          { ...source().lines[0]!, lineId: 'L1', netAmountCents: 6_000 },
          { ...source().lines[0]!, lineId: 'L2', lineOrder: 2, netAmountCents: 4_000 },
        ],
      }),
      allocations: [
        { allocationNetCents: 6_000, allocationVatCents: 900, allocationGrossCents: null },
        { allocationNetCents: 4_000, allocationVatCents: 600, allocationGrossCents: null },
      ],
    });
    assert.equal(twoLines.allocatedNetCents, 10_000);
  });

  it('5-6 PO-line retained; source invoice immutable', () => {
    const a = draft();
    assert.equal(a.allocation?.purchaseOrderLineId, 'pol-1');
    const bal = resolveAllocationBalance({
      source: source(),
      allocations: [{ allocationNetCents: 10_000, allocationVatCents: 1_500, allocationGrossCents: 11_500 }],
    });
    assert.equal(bal.sourceInvoiceImmutable, true);
    assert.ok(bal.warnings.includes('SOURCE_INVOICE_IMMUTABLE'));
  });

  it('7-10 allocation totals / partial / unallocated / over blocked', () => {
    const exact = resolveAllocationBalance({
      source: source(),
      allocations: [{ allocationNetCents: 10_000, allocationVatCents: 1_500, allocationGrossCents: 11_500 }],
    });
    assert.equal(exact.exact, true);

    const partial = resolveAllocationBalance({
      source: source(),
      allocations: [{ allocationNetCents: 4_000, allocationVatCents: 600, allocationGrossCents: 4_600 }],
    });
    assert.equal(partial.status, 'PARTIALLY_ALLOCATED');
    assert.equal(partial.unallocatedNetCents, 6_000);

    const none = resolveAllocationBalance({ source: source(), allocations: [] });
    assert.equal(none.status, 'UNALLOCATED');

    const over = resolveAllocationBalance({
      source: source(),
      allocations: [{ allocationNetCents: 12_000, allocationVatCents: 0, allocationGrossCents: 0 }],
    });
    assert.equal(over.status, 'OVER_ALLOCATED');
    assert.ok(over.warnings.includes('OVER_ALLOCATED'));
  });

  it('11 deterministic rounding', () => {
    const r = allocateNetCentsDeterministic(100, [1, 1, 1]);
    assert.equal(r.shares.reduce((a, b) => a + b, 0), 100);
    assert.deepEqual(r.shares, [33, 33, 34]);
    assert.equal(r.roundingApplied, true);
    assert.equal(r.remainderToIndex, 2);
  });

  it('12 missing VAT remains unknown', () => {
    const a = draft({ allocationVatCents: null });
    assert.ok(a.warnings.includes('VAT_UNKNOWN'));
    const bal = resolveAllocationBalance({
      source: source({ vatAmountCents: null, vatBasis: 'UNKNOWN' }),
      allocations: [{ allocationNetCents: 10_000, allocationVatCents: null, allocationGrossCents: null }],
    });
    assert.ok(bal.warnings.includes('VAT_UNKNOWN'));
    assert.equal(bal.allocatedVatCents, null);
  });

  it('13-15 PO amount/qty mismatch; supplier mismatch', () => {
    const amt = reconcilePoAllocation({
      invoiceSupplierId: 'sup-1',
      poSupplierId: 'sup-1',
      allocationNetCents: 9_000,
      poNetAmountCents: 8_000,
      allocationQuantity: 10,
      poQuantity: 10,
      purchaseOrderId: 'po-1',
    });
    assert.ok(amt.includes('PO_AMOUNT_MISMATCH'));
    assert.ok(amt.includes('INVOICE_EXCEEDS_PO'));

    const qty = reconcilePoAllocation({
      invoiceSupplierId: 'sup-1',
      poSupplierId: 'sup-1',
      allocationNetCents: 8_000,
      poNetAmountCents: 8_000,
      allocationQuantity: 12,
      poQuantity: 10,
      purchaseOrderId: 'po-1',
    });
    assert.ok(qty.includes('PO_QUANTITY_MISMATCH'));

    const sup = reconcilePoAllocation({
      invoiceSupplierId: 'sup-1',
      poSupplierId: 'sup-2',
      allocationNetCents: 8_000,
      poNetAmountCents: 8_000,
      allocationQuantity: 10,
      poQuantity: 10,
      purchaseOrderId: 'po-1',
    });
    assert.ok(sup.includes('SUPPLIER_MISMATCH'));
  });

  it('16-18 free-text / wrong Job / cross-tenant blocked', () => {
    const free = draft({ jobId: null, jobReference: 'JOB-X' });
    assert.equal(free.ok, false);
    assert.ok(free.warnings.includes('FREE_TEXT_JOB_LINK_ONLY'));

    const wrong = draft({ jobId: 'job-b', expectedJobId: 'job-a' });
    assert.equal(wrong.ok, false);
    assert.ok(wrong.warnings.includes('WRONG_JOB'));

    const xt = draft({ expectedJobCompanyId: 'other' });
    assert.equal(xt.ok, false);
    assert.ok(xt.warnings.includes('CROSS_TENANT_ALLOCATION'));
  });

  it('19-21 Xero bill linked / absent / zero writes', () => {
    const linked = linkXeroBillForAllocation({
      supplierInvoiceId: invId,
      knownXeroBillId: 'xero-bill-1',
      knownXeroInvoiceId: 'xero-inv-1',
      xeroWrites: 0,
    });
    assert.equal(linked.status, 'LINKED');
    assert.equal(linked.xeroBillId, 'xero-bill-1');
    assert.equal(linked.xeroWrites, 0);

    const absent = linkXeroBillForAllocation({
      supplierInvoiceId: invId,
      knownXeroBillId: null,
      knownXeroInvoiceId: null,
      xeroWrites: 0,
    });
    assert.equal(absent.status, 'XERO_BILL_NOT_LINKED');
    assert.equal(absent.warning, 'XERO_BILL_NOT_LINKED');
  });

  it('22-25 JPE allocation-only per Job; no full duplicate; retry idempotent', () => {
    const a = resolveAllocationJpePosting({
      allocationKey: 'alloc-a',
      supplierInvoiceId: invId,
      jobId: 'job-a',
      amountCents: 6_000,
      existingJpeSourceKeys: [],
    });
    const b = resolveAllocationJpePosting({
      allocationKey: 'alloc-b',
      supplierInvoiceId: invId,
      jobId: 'job-b',
      amountCents: 4_000,
      existingJpeSourceKeys: [a.jpeSourceId!],
    });
    assert.equal(a.shouldPost && b.shouldPost, true);
    assert.equal(a.amountCents, 6_000);
    assert.equal(b.amountCents, 4_000);
    assert.notEqual(a.jpeSourceId, fullInvoiceJpeSourceKey(invId));

    const retry = resolveAllocationJpePosting({
      allocationKey: 'alloc-a',
      supplierInvoiceId: invId,
      jobId: 'job-a',
      amountCents: 6_000,
      existingJpeSourceKeys: [a.jpeSourceId!],
    });
    assert.equal(retry.duplicateBlocked, true);

    const fullBlocked = resolveAllocationJpePosting({
      allocationKey: 'alloc-c',
      supplierInvoiceId: invId,
      jobId: 'job-c',
      amountCents: 1_000,
      existingJpeSourceKeys: [fullInvoiceJpeSourceKey(invId)],
    });
    assert.ok(fullBlocked.warnings.includes('FULL_INVOICE_JPE_BLOCKED'));
  });

  it('26 reallocation/correction auditable', () => {
    const corr = buildAllocationCorrection({
      priorAllocationKey: 'alloc-a',
      priorAmountCents: 6_000,
      newAllocationKey: 'alloc-a2',
      reason: 'reallocate',
    });
    assert.equal(corr.preservesHistory, true);
    assert.equal(corr.reverseAmountCents, -6_000);
  });

  it('27-28 Row104 credit adjusts correct allocation once; ambiguous review', () => {
    const once = resolveCreditAgainstAllocations({
      creditAmountCents: 500,
      relatedAllocationKeys: ['alloc-a'],
      existingJpeSourceKeys: [],
      ambiguous: false,
    });
    assert.equal(once.ok, true);
    assert.equal(once.adjustments.length, 1);
    assert.equal(once.adjustments[0]!.amountCents, -500);

    const retry = resolveCreditAgainstAllocations({
      creditAmountCents: 500,
      relatedAllocationKeys: ['alloc-a'],
      existingJpeSourceKeys: [once.adjustments[0]!.jpeSourceId],
      ambiguous: false,
    });
    assert.ok(retry.warnings.includes('DUPLICATE_JPE_BLOCKED'));

    const amb = resolveCreditAgainstAllocations({
      creditAmountCents: 500,
      relatedAllocationKeys: ['alloc-a', 'alloc-b'],
      existingJpeSourceKeys: [],
      ambiguous: true,
    });
    assert.ok(amb.warnings.includes('AMBIGUOUS_CREDIT_REVIEW_REQUIRED'));
  });

  it('29-30 Client/Tech denied internals', () => {
    assert.equal(canManageMultiJobInvoiceAllocation({ roleName: 'client' }), false);
    assert.equal(canManageMultiJobInvoiceAllocation({ roleName: 'technician' }), false);
    assert.equal(canManageMultiJobInvoiceAllocation({ roleName: 'owner' }), true);
    assert.throws(() => assertNoMultiJobAllocClientLeak({ allocationNetCents: 1 }));
    const tech = projectTechSafeAllocationView({ jobId: 'job-a', allocationQuantity: 2 });
    assert.equal(tech.pricesVisible, false);
    assert.equal(tech.jpeVisible, false);
  });

  it('31-32 audit/safety + Royal Cape + cleanup', () => {
    const gates = assertRow105SafetyGates({ row92AutomationEnabled: false });
    assert.equal(gates.row118NotClosed, true);
    assert.equal(gates.rows103104Preserved, true);
    assert.throws(() => assertRow106107NotStartedDuringRow105(true));
    assertRoyalCapeUnchangedForRow105({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
  });
});
