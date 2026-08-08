import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertNoEstimatedActualGpClientLeak,
  assertRow106SafetyGates,
  assertRow107NotStartedDuringRow106,
  assertRoyalCapeUnchangedForRow106,
  canViewEstimatedActualGp,
  computeGpCents,
  computeMarginBps,
  gpComparisonIdempotencyKey,
  resolveActualDirectCosts,
  resolveActualRevenue,
  resolveEstimatedBaseline,
  resolveInvoiceGpComparison,
  resolveJobGpComparison,
  resolveLineGpComparison,
  resolveQuoteGpComparison,
} from './estimated-actual-gp.js';

const companyId = 'co-1';

function completeEstimate() {
  return resolveEstimatedBaseline({
    row96: {
      sellExVatCents: 10_000,
      estimatedDirectCostCents: 6_000,
      costEstimateIncomplete: false,
    },
  });
}

describe('Row 106 estimated vs actual GP', () => {
  it('1 complete estimated quote GP', () => {
    const e = completeEstimate();
    assert.equal(e.estimatedGpCents, 4_000);
    assert.equal(e.estimatedMarginBps, 4_000);
    assert.equal(e.estimateSource, 'row96_quote_cost');
  });

  it('2 incomplete estimate blocks margin', () => {
    const e = resolveEstimatedBaseline({
      row96: {
        sellExVatCents: 10_000,
        estimatedDirectCostCents: null,
        costEstimateIncomplete: true,
      },
      quoteSellExVatCents: 10_000,
    });
    assert.equal(e.estimatedGpCents, null);
    assert.equal(e.estimatedMarginBps, null);
    assert.ok(e.warnings.includes('ESTIMATE_INCOMPLETE'));
  });

  it('3-9 complete Job actual GP, variances, exact cents/bps', () => {
    const estimated = completeEstimate();
    const job = resolveJobGpComparison({
      jobId: 'job-1',
      jobLifecycleComplete: false,
      companyId,
      expectedJobCompanyId: companyId,
      estimated,
      invoices: [
        {
          invoiceId: 'inv-1',
          jobId: 'job-1',
          quoteId: 'q-1',
          status: 'paid',
          subtotalCents: 11_000,
        },
      ],
      jpeEntries: [
        {
          entryId: 'c1',
          jobId: 'job-1',
          amountCents: 7_000,
          sourceType: 'material_line',
          sourceId: 'material_use:1',
        },
      ],
      actualCostComplete: true,
      actualRevenueComplete: true,
    });
    assert.equal(job.actualRevenueExVatCents, 11_000);
    assert.equal(job.actualDirectCostExVatCents, 7_000);
    assert.equal(job.actualGpCents, 4_000);
    assert.equal(job.actualMarginBps, Math.round((4_000 * 10_000) / 11_000));
    assert.equal(job.gpVarianceCents, 0);
    assert.equal(job.estimatedGpCents, 4_000);
    assert.equal(computeGpCents(11_000, 7_000), 4_000);
    assert.equal(computeMarginBps(4_000, 11_000), 3636);
  });

  it('4-5 actual revenue/cost incomplete', () => {
    const estimated = completeEstimate();
    const noRev = resolveJobGpComparison({
      jobId: 'job-1',
      jobLifecycleComplete: false,
      companyId,
      expectedJobCompanyId: companyId,
      estimated,
      invoices: [{ invoiceId: 'd', jobId: 'job-1', quoteId: null, status: 'draft', subtotalCents: 100 }],
      jpeEntries: [
        { entryId: 'c1', jobId: 'job-1', amountCents: 50, sourceType: 'manual', sourceId: 'm1' },
      ],
    });
    assert.ok(noRev.warnings.includes('ACTUAL_REVENUE_INCOMPLETE'));
    assert.equal(noRev.profitableOrLossLabelled, false);

    const noCost = resolveJobGpComparison({
      jobId: 'job-1',
      jobLifecycleComplete: false,
      companyId,
      expectedJobCompanyId: companyId,
      estimated,
      invoices: [
        { invoiceId: 'inv', jobId: 'job-1', quoteId: null, status: 'sent', subtotalCents: 100 },
      ],
      jpeEntries: [],
    });
    assert.ok(noCost.warnings.includes('ACTUAL_COST_INCOMPLETE'));
  });

  it('10-12 line mapping / missing / no proportional spread', () => {
    const mapped = resolveLineGpComparison({
      companyId,
      expectedJobCompanyId: companyId,
      quoteLineId: 'ql1',
      invoiceLineId: 'il1',
      lineCostEvidenceCents: 500,
      lineCostEvidencePresent: true,
      estimatedLineRevenueExVatCents: 1_000,
      estimatedLineCostExVatCents: 600,
      actualLineRevenueExVatCents: 1_000,
    });
    assert.equal(mapped.provenance.lineMapped, true);
    assert.equal(mapped.actualGpCents, 500);

    const missing = resolveLineGpComparison({
      companyId,
      expectedJobCompanyId: companyId,
      quoteLineId: 'ql1',
      invoiceLineId: null,
      lineCostEvidenceCents: null,
      lineCostEvidencePresent: false,
      estimatedLineRevenueExVatCents: 1_000,
      estimatedLineCostExVatCents: 600,
      actualLineRevenueExVatCents: null,
    });
    assert.ok(missing.warnings.includes('LINE_MAPPING_MISSING'));
    assert.equal(missing.actualGpCents, null);
    assert.ok(missing.warnings.includes('NO_PROPORTIONAL_COST_SPREAD'));
  });

  it('13-14 quote→Job→invoice aggregation; multi-invoice once', () => {
    const q = resolveQuoteGpComparison({
      quoteId: 'q-1',
      jobId: 'job-1',
      estimated: completeEstimate(),
      invoices: [
        { invoiceId: 'i1', jobId: 'job-1', quoteId: 'q-1', status: 'paid', subtotalCents: 6_000 },
        { invoiceId: 'i2', jobId: 'job-1', quoteId: 'q-1', status: 'sent', subtotalCents: 5_000 },
      ],
      jpeEntries: [
        { entryId: 'c1', jobId: 'job-1', amountCents: 7_000, sourceType: 'manual', sourceId: 'm1' },
      ],
    });
    assert.equal(q.actualRevenueExVatCents, 11_000);

    const job = resolveJobGpComparison({
      jobId: 'job-1',
      jobLifecycleComplete: false,
      companyId,
      expectedJobCompanyId: companyId,
      estimated: completeEstimate(),
      invoices: [
        { invoiceId: 'i1', jobId: 'job-1', quoteId: 'q-1', status: 'paid', subtotalCents: 6_000 },
        { invoiceId: 'i2', jobId: 'job-1', quoteId: 'q-1', status: 'sent', subtotalCents: 5_000 },
      ],
      jpeEntries: [
        { entryId: 'c1', jobId: 'job-1', amountCents: 7_000, sourceType: 'manual', sourceId: 'm1' },
      ],
      actualCostComplete: true,
      actualRevenueComplete: true,
    });
    assert.equal(job.actualRevenueExVatCents, 11_000);
  });

  it('15-16 invoice-specific cost vs Job-only unavailable', () => {
    const withCost = resolveInvoiceGpComparison({
      invoiceId: 'inv-1',
      jobId: 'job-1',
      status: 'paid',
      subtotalCents: 5_000,
      invoiceAttributedCostCents: 3_000,
      invoiceCostAttributionAvailable: true,
      estimated: completeEstimate(),
    });
    assert.equal(withCost.actualGpCents, 2_000);

    const unavailable = resolveInvoiceGpComparison({
      invoiceId: 'inv-1',
      jobId: 'job-1',
      status: 'paid',
      subtotalCents: 5_000,
      invoiceAttributedCostCents: null,
      invoiceCostAttributionAvailable: false,
      estimated: completeEstimate(),
    });
    assert.ok(unavailable.warnings.includes('INVOICE_COST_ALLOCATION_UNAVAILABLE'));
    assert.equal(unavailable.actualGpCents, null);
  });

  it('17-20 material/labour once; Row105 alloc not duplicated; Row104 credit once', () => {
    const costs = resolveActualDirectCosts({
      jobId: 'job-1',
      entries: [
        {
          entryId: 'm1',
          jobId: 'job-1',
          amountCents: 1_000,
          sourceType: 'material_line',
          sourceId: 'material_use:1',
        },
        {
          entryId: 'm1dup',
          jobId: 'job-1',
          amountCents: 1_000,
          sourceType: 'material_line',
          sourceId: 'material_use:1',
        },
        {
          entryId: 'l1',
          jobId: 'job-1',
          amountCents: 2_000,
          sourceType: 'manual',
          sourceId: 'labour:1',
        },
        {
          entryId: 'full',
          jobId: 'job-1',
          amountCents: 5_000,
          sourceType: 'supplier_invoice',
          sourceId: 'supplier_invoice:ev1',
        },
        {
          entryId: 'alloc',
          jobId: 'job-1',
          amountCents: 3_000,
          sourceType: 'supplier_invoice',
          sourceId: 'supplier_invoice_alloc:a1',
        },
        {
          entryId: 'cred',
          jobId: 'job-1',
          amountCents: -200,
          sourceType: 'adjustment',
          sourceId: 'supplier_invoice_alloc_credit:a1',
        },
      ],
    });
    assert.equal(costs.actualDirectCostExVatCents, 1_000 + 2_000 + 3_000 - 200);
    assert.ok(costs.warnings.includes('DUPLICATE_SOURCE_BLOCKED'));
    assert.ok(!costs.entryIdsIncluded.includes('full'));
  });

  it('21 void/credit revenue truth preserved', () => {
    const rev = resolveActualRevenue({
      invoices: [
        {
          invoiceId: 'inv',
          jobId: 'job-1',
          quoteId: null,
          status: 'paid',
          subtotalCents: 10_000,
          creditNoteExVatCents: -1_500,
        },
        {
          invoiceId: 'voided',
          jobId: 'job-1',
          quoteId: null,
          status: 'cancelled',
          subtotalCents: 9_999,
        },
      ],
      expectedJobId: 'job-1',
    });
    assert.equal(rev.actualRevenueExVatCents, 8_500);
    assert.ok(!rev.invoiceIdsIncluded.includes('voided'));
  });

  it('22-24 PROVISIONAL / incomplete not labelled / FINAL', () => {
    const open = resolveJobGpComparison({
      jobId: 'job-1',
      jobLifecycleComplete: false,
      companyId,
      expectedJobCompanyId: companyId,
      estimated: completeEstimate(),
      invoices: [
        { invoiceId: 'i', jobId: 'job-1', quoteId: null, status: 'sent', subtotalCents: 11_000 },
      ],
      jpeEntries: [
        { entryId: 'c', jobId: 'job-1', amountCents: 7_000, sourceType: 'manual', sourceId: 'm' },
      ],
      actualCostComplete: true,
      actualRevenueComplete: true,
    });
    assert.equal(open.status, 'PROVISIONAL');
    assert.ok(open.warnings.includes('PROVISIONAL'));

    const incomplete = resolveJobGpComparison({
      jobId: 'job-1',
      jobLifecycleComplete: false,
      companyId,
      expectedJobCompanyId: companyId,
      estimated: completeEstimate(),
      invoices: [],
      jpeEntries: [],
    });
    assert.equal(incomplete.profitableOrLossLabelled, false);
    assert.equal(incomplete.status, 'INCOMPLETE');

    const closed = resolveJobGpComparison({
      jobId: 'job-1',
      jobLifecycleComplete: true,
      companyId,
      expectedJobCompanyId: companyId,
      estimated: completeEstimate(),
      invoices: [
        { invoiceId: 'i', jobId: 'job-1', quoteId: null, status: 'paid', subtotalCents: 11_000 },
      ],
      jpeEntries: [
        { entryId: 'c', jobId: 'job-1', amountCents: 7_000, sourceType: 'manual', sourceId: 'm' },
      ],
      actualCostComplete: true,
      actualRevenueComplete: true,
    });
    assert.equal(closed.status, 'FINAL');
  });

  it('25-27 Client/Tech denied; cross-tenant blocked', () => {
    assert.equal(canViewEstimatedActualGp({ roleName: 'client' }), false);
    assert.equal(canViewEstimatedActualGp({ roleName: 'technician' }), false);
    assert.equal(canViewEstimatedActualGp({ roleName: 'owner' }), true);
    assert.throws(() => assertNoEstimatedActualGpClientLeak({ estimatedGpCents: 1 }));
    const xt = resolveJobGpComparison({
      jobId: 'job-1',
      jobLifecycleComplete: false,
      companyId: 'other',
      expectedJobCompanyId: companyId,
      estimated: completeEstimate(),
      invoices: [],
      jpeEntries: [],
    });
    assert.ok(xt.warnings.includes('CROSS_TENANT_BLOCKED'));
  });

  it('28-30 audit/idempotency/safety + Royal Cape + cleanup', () => {
    const gates = assertRow106SafetyGates({ row92AutomationEnabled: false });
    assert.equal(gates.row118NotClosed, true);
    assert.equal(gates.row107NotStarted, true);
    assert.throws(() => assertRow107NotStartedDuringRow106(true));
    assert.equal(gpComparisonIdempotencyKey(['job', 'job-1', 'v1']), 'job:job-1:v1');
    assertRoyalCapeUnchangedForRow106({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
  });
});
