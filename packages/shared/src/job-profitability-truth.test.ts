import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveEstimatedBaseline } from './estimated-actual-gp.js';
import {
  assertNoJobProfitabilityTruthClientLeak,
  assertRow107SafetyGates,
  assertRow108NotStartedDuringRow107,
  assertRoyalCapeUnchangedForRow107,
  canViewJobProfitabilityTruth,
  classifyJobCostBucket,
  profitabilityTruthIdempotencyKey,
  resolveBucketedJobCosts,
  resolveJobProfitabilityTruth,
} from './job-profitability-truth.js';

const companyId = 'co-1';
const jobId = 'job-1';

function est() {
  return resolveEstimatedBaseline({
    row96: {
      sellExVatCents: 20_000,
      estimatedDirectCostCents: 12_000,
      costEstimateIncomplete: false,
    },
  });
}

function base(overrides: Partial<Parameters<typeof resolveJobProfitabilityTruth>[0]> = {}) {
  return resolveJobProfitabilityTruth({
    jobId,
    companyId,
    expectedJobCompanyId: companyId,
    jobStatus: 'completed',
    estimated: est(),
    approvedQuoteSellExVatCents: 20_000,
    invoices: [
      {
        invoiceId: 'inv-1',
        jobId,
        quoteId: 'q1',
        status: 'paid',
        subtotalCents: 20_000,
      },
    ],
    jpeEntries: [
      {
        entryId: 'm1',
        jobId,
        amountCents: 8_000,
        sourceType: 'material_line',
        sourceId: 'material_use:1',
        costBucket: 'material',
      },
      {
        entryId: 'l1',
        jobId,
        amountCents: 3_000,
        sourceType: 'manual',
        sourceId: 'labour:1',
        costBucket: 'labour',
      },
      {
        entryId: 'o1',
        jobId,
        amountCents: 1_000,
        sourceType: 'manual',
        sourceId: 'other:1',
        costBucket: 'other',
      },
    ],
    ...overrides,
  });
}

describe('Row 107 job profitability truth', () => {
  it('1 complete profitable Job', () => {
    const r = base();
    assert.equal(r.grossProfitCents, 8_000);
    assert.equal(r.completeness, 'COMPLETE');
    assert.equal(r.profitableOrLossLabelled, true);
    assert.ok((r.grossProfitCents ?? 0) > 0);
  });

  it('2 complete loss Job', () => {
    const r = base({
      invoices: [
        { invoiceId: 'inv', jobId, quoteId: null, status: 'paid', subtotalCents: 5_000 },
      ],
      jpeEntries: [
        {
          entryId: 'm',
          jobId,
          amountCents: 9_000,
          sourceType: 'material_line',
          sourceId: 'material_use:x',
          costBucket: 'material',
        },
      ],
    });
    assert.equal(r.grossProfitCents, -4_000);
    assert.equal(r.profitableOrLossLabelled, true);
  });

  it('3 open Job → PROVISIONAL', () => {
    const r = base({ jobStatus: 'in_progress' });
    assert.equal(r.completeness, 'PROVISIONAL');
    assert.equal(r.lifecycleStatus, 'OPEN');
  });

  it('4-6 revenue/material/labour missing alerts', () => {
    const noRev = base({ invoices: [] });
    assert.ok(noRev.alerts.some((a) => a.code === 'JOB_REVENUE_MISSING'));
    assert.equal(noRev.profitableOrLossLabelled, false);

    const noMat = base({
      jpeEntries: [
        {
          entryId: 'l1',
          jobId,
          amountCents: 3_000,
          sourceType: 'manual',
          sourceId: 'labour:1',
          costBucket: 'labour',
        },
      ],
    });
    assert.ok(noMat.alerts.some((a) => a.code === 'MATERIAL_COST_MISSING'));

    const noLab = base({
      jpeEntries: [
        {
          entryId: 'm1',
          jobId,
          amountCents: 8_000,
          sourceType: 'material_line',
          sourceId: 'material_use:1',
          costBucket: 'material',
        },
      ],
    });
    assert.ok(noLab.alerts.some((a) => a.code === 'LABOUR_COST_MISSING'));
  });

  it('7-11 other cost + totals + GP + margin + contribution exact', () => {
    const r = base();
    assert.equal(r.otherJobCostCents, 1_000);
    assert.equal(r.materialCostCents, 8_000);
    assert.equal(r.labourCostCents, 3_000);
    assert.equal(r.totalKnownJobCostCents, 12_000);
    assert.equal(r.grossProfitCents, 8_000);
    assert.equal(r.grossMarginBps, 4_000);
    assert.equal(r.jobOperatingContributionCents, 8_000);
  });

  it('12-13 no fake overhead; OVERHEAD_NOT_ALLOCATED', () => {
    const r = base();
    assert.equal(r.overheadAllocated, false);
    assert.ok(r.alerts.some((a) => a.code === 'OVERHEAD_NOT_ALLOCATED'));
    assert.ok(
      r.alerts.find((a) => a.code === 'OVERHEAD_NOT_ALLOCATED')?.message.includes(
        'not company operating profit',
      ),
    );
  });

  it('14-15 estimated-vs-actual variance; incomplete blocks false variance', () => {
    const r = base();
    assert.equal(r.gpVarianceCents, 0);
    assert.equal(r.revenueVarianceCents, 0);

    const incompleteEst = base({
      estimated: resolveEstimatedBaseline({
        row96: {
          sellExVatCents: 20_000,
          estimatedDirectCostCents: null,
          costEstimateIncomplete: true,
        },
        quoteSellExVatCents: 20_000,
      }),
    });
    assert.equal(incompleteEst.gpVarianceCents, null);
    assert.ok(incompleteEst.alerts.some((a) => a.code === 'ESTIMATE_BASELINE_INCOMPLETE'));
  });

  it('16-18 invoice link / revenue without cost / cost without revenue', () => {
    const link = base({ invoicesMissingJobLink: 2 });
    assert.ok(link.alerts.some((a) => a.code === 'INVOICE_JOB_LINK_MISSING'));

    const revOnly = base({ jpeEntries: [] });
    assert.ok(revOnly.alerts.some((a) => a.code === 'REVENUE_WITHOUT_COST_EVIDENCE'));

    const costOnly = base({ invoices: [] });
    assert.ok(costOnly.alerts.some((a) => a.code === 'COST_WITHOUT_REVENUE'));
  });

  it('19 procurement unresolved alert', () => {
    const r = base({
      jpeEntries: [
        {
          entryId: 'm1',
          jobId,
          amountCents: 100,
          sourceType: 'supplier_invoice',
          sourceId: 'supplier_invoice_alloc:a',
          costBucket: 'material',
          unresolvedProcurement: true,
        },
      ],
    });
    assert.ok(r.alerts.some((a) => a.code === 'PROCUREMENT_COST_UNRESOLVED'));
  });

  it('20-25 credit once; Row105 not dup; stock/labour not dup; reverse once', () => {
    const costs = resolveBucketedJobCosts({
      jobId,
      entries: [
        {
          entryId: 'full',
          jobId,
          amountCents: 5_000,
          sourceType: 'supplier_invoice',
          sourceId: 'supplier_invoice:ev1',
        },
        {
          entryId: 'alloc',
          jobId,
          amountCents: 3_000,
          sourceType: 'supplier_invoice',
          sourceId: 'supplier_invoice_alloc:a1',
        },
        {
          entryId: 'cred',
          jobId,
          amountCents: -200,
          sourceType: 'adjustment',
          sourceId: 'supplier_invoice_alloc_credit:a1',
          costBucket: 'material',
        },
        {
          entryId: 'm1',
          jobId,
          amountCents: 1_000,
          sourceType: 'material_line',
          sourceId: 'material_use:1',
        },
        {
          entryId: 'm1dup',
          jobId,
          amountCents: 1_000,
          sourceType: 'material_line',
          sourceId: 'material_use:1',
        },
        {
          entryId: 'l1',
          jobId,
          amountCents: 2_000,
          sourceType: 'manual',
          sourceId: 'labour:1',
          costBucket: 'labour',
        },
        {
          entryId: 'l1dup',
          jobId,
          amountCents: 2_000,
          sourceType: 'manual',
          sourceId: 'labour:1',
          costBucket: 'labour',
        },
        {
          entryId: 'orig',
          jobId,
          amountCents: 500,
          sourceType: 'manual',
          sourceId: 'misc:1',
          costBucket: 'other',
          reversed: true,
        },
        {
          entryId: 'rev',
          jobId,
          amountCents: -500,
          sourceType: 'adjustment',
          sourceId: 'misc_reversal:1',
          costBucket: 'other',
        },
      ],
    });
    assert.equal(costs.materialCostCents, 3_000 - 200 + 1_000);
    assert.equal(costs.labourCostCents, 2_000);
    assert.equal(costs.otherJobCostCents, -500);
    assert.ok(costs.duplicateKeysBlocked.length > 0);
    assert.ok(!costs.includedEntryIds.includes('full'));
    assert.ok(!costs.includedEntryIds.includes('orig') || costs.otherJobCostCents === -500);
  });

  it('26-28 Client/Tech denied; cross-tenant blocked', () => {
    assert.equal(canViewJobProfitabilityTruth({ roleName: 'client' }), false);
    assert.equal(canViewJobProfitabilityTruth({ roleName: 'technician' }), false);
    assert.equal(canViewJobProfitabilityTruth({ roleName: 'owner' }), true);
    assert.throws(() => assertNoJobProfitabilityTruthClientLeak({ grossProfitCents: 1 }));
    const xt = resolveJobProfitabilityTruth({
      jobId,
      companyId: 'other',
      expectedJobCompanyId: companyId,
      jobStatus: 'completed',
      invoices: [],
      jpeEntries: [],
    });
    assert.ok(xt.warnings.includes('CROSS_TENANT_BLOCKED'));
  });

  it('29-31 audit/idempotency/safety + Royal Cape + cleanup', () => {
    assert.equal(classifyJobCostBucket({
      entryId: 'x',
      jobId,
      amountCents: 1,
      sourceType: 'material_line',
      sourceId: 'material_use:1',
    }), 'material');
    const gates = assertRow107SafetyGates({ row92AutomationEnabled: false });
    assert.equal(gates.row108PlusNotStarted, true);
    assert.equal(gates.row106Preserved, true);
    assert.throws(() => assertRow108NotStartedDuringRow107(true));
    assert.equal(profitabilityTruthIdempotencyKey(['job', jobId]), 'job:job-1');
    assertRoyalCapeUnchangedForRow107({
      totalCents: 4_272_250,
      pricingPresentationMode: 'ITEMISED',
    });
  });
});
