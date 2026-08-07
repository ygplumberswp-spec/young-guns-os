import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JPE_CALCULATION_VERSION } from './job-profitability.js';
import {
  buildJobFinancialFingerprintFromSources,
  JPE_FINANCIAL_FINGERPRINT_VERSION,
  type BuildFingerprintFromProfitabilitySourcesInput,
} from './job-financial-fingerprint.js';
import {
  computeJobFinancialSourceFingerprint,
  computeJobFinancialSourceFingerprintFromSources,
} from './job-financial-fingerprint-hash.js';
import { isFinancialReviewStale } from './job-cost-control.js';

function baseSources(
  overrides: Partial<BuildFingerprintFromProfitabilitySourcesInput> = {},
): BuildFingerprintFromProfitabilitySourcesInput {
  return {
    jobId: 'job-a',
    invoices: [
      {
        id: 'inv-1',
        status: 'sent',
        totalCents: 50_000,
        subtotalCents: 43_478,
        vatCents: 6522,
        amountPaidCents: 25_000,
      },
    ],
    quotes: [
      {
        id: 'quote-1',
        status: 'accepted',
        totalCents: 50_000,
        subtotalCents: 43_478,
        lineItems: [
          {
            id: 'ql-1',
            category: 'labour',
            lineCostCents: 10_000,
            lineSubtotalCents: 30_000,
            isOptional: false,
          },
        ],
      },
    ],
    adjustments: [{ id: 'adj-1', kind: 'credit', amountCents: -500 }],
    materialLines: [
      {
        id: 'mat-1',
        status: 'used',
        quantity: '3',
        fulfilledQuantity: '3',
        unitCostCents: 1200,
        materialSource: 'warehouse_stock',
      },
    ],
    purchaseOrders: [
      {
        id: 'po-1',
        status: 'received',
        totalCostCents: 3600,
        items: [{ id: 'poi-1', lineTotalCents: 3600 }],
      },
    ],
    labourEntries: [
      {
        id: 'lab-1',
        entryType: 'job_time',
        durationMinutes: 120,
        hourlyCostCents: 8000,
        overtimeMultiplier: 1,
        metadata: { hourlyCostLockedAt: '2026-01-01T08:00:00.000Z' },
      },
    ],
    directCosts: [
      {
        id: 'dc-1',
        category: 'fuel',
        amountCents: 4500,
        sourceType: 'manual',
        sourceId: 'manual-1',
        isPaid: true,
        receiptDocumentId: 'doc-1',
      },
    ],
    payments: [
      {
        id: 'pay-1',
        amountCents: 25_000,
        xeroPaymentStatus: 'AUTHORISED',
      },
    ],
    ...overrides,
  };
}

describe('JPE-002A job financial fingerprint', () => {
  it('1 same sources produce same fingerprint', () => {
    const input = baseSources();
    const a = computeJobFinancialSourceFingerprintFromSources(input);
    const b = computeJobFinancialSourceFingerprintFromSources({ ...input });
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it('2 source order changed produces same fingerprint', () => {
    const input = baseSources();
    const reversed = baseSources({
      invoices: [...input.invoices].reverse(),
      materialLines: [...input.materialLines].reverse(),
      labourEntries: [...input.labourEntries].reverse(),
      directCosts: [...input.directCosts].reverse(),
      payments: [...input.payments].reverse(),
      purchaseOrders: input.purchaseOrders.map((po) => ({
        ...po,
        items: [...po.items].reverse(),
      })),
      quotes: input.quotes.map((q) => ({
        ...q,
        lineItems: [...q.lineItems].reverse(),
      })),
    });
    assert.equal(
      computeJobFinancialSourceFingerprintFromSources(input),
      computeJobFinancialSourceFingerprintFromSources(reversed),
    );
  });

  it('3 amount changed produces different fingerprint', () => {
    const before = computeJobFinancialSourceFingerprintFromSources(baseSources());
    const after = computeJobFinancialSourceFingerprintFromSources(
      baseSources({
        directCosts: [
          {
            id: 'dc-1',
            category: 'fuel',
            amountCents: 4600,
            sourceType: 'manual',
            sourceId: 'manual-1',
            isPaid: true,
            receiptDocumentId: 'doc-1',
          },
        ],
      }),
    );
    assert.notEqual(before, after);
  });

  it('4 older source deleted produces different fingerprint', () => {
    const withOlderCost = baseSources({
      directCosts: [
        {
          id: 'dc-old',
          category: 'misc',
          amountCents: 1000,
          sourceType: 'manual',
          sourceId: 'old-1',
          isPaid: true,
          receiptDocumentId: null,
        },
        {
          id: 'dc-1',
          category: 'fuel',
          amountCents: 4500,
          sourceType: 'manual',
          sourceId: 'manual-1',
          isPaid: true,
          receiptDocumentId: 'doc-1',
        },
      ],
    });
    const withoutOlderCost = baseSources();
    const fingerprintA = computeJobFinancialSourceFingerprintFromSources(withOlderCost);
    const fingerprintB = computeJobFinancialSourceFingerprintFromSources(withoutOlderCost);
    assert.notEqual(fingerprintA, fingerprintB);
  });

  it('5 cost reallocated away from job produces different fingerprint', () => {
    const allocated = computeJobFinancialSourceFingerprintFromSources(baseSources());
    const reallocated = computeJobFinancialSourceFingerprintFromSources(
      baseSources({ directCosts: [] }),
    );
    assert.notEqual(allocated, reallocated);
  });

  it('6 payment status change produces different fingerprint', () => {
    const before = computeJobFinancialSourceFingerprintFromSources(baseSources());
    const after = computeJobFinancialSourceFingerprintFromSources(
      baseSources({
        payments: [{ id: 'pay-1', amountCents: 25_000, xeroPaymentStatus: 'DELETED' }],
      }),
    );
    assert.notEqual(before, after);
  });

  it('7 material quantity change produces different fingerprint', () => {
    const before = computeJobFinancialSourceFingerprintFromSources(baseSources());
    const after = computeJobFinancialSourceFingerprintFromSources(
      baseSources({
        materialLines: [
          {
            id: 'mat-1',
            status: 'used',
            quantity: '4',
            fulfilledQuantity: '4',
            unitCostCents: 1200,
            materialSource: 'warehouse_stock',
          },
        ],
      }),
    );
    assert.notEqual(before, after);
  });

  it('8 labour rate change produces different fingerprint', () => {
    const before = computeJobFinancialSourceFingerprintFromSources(baseSources());
    const after = computeJobFinancialSourceFingerprintFromSources(
      baseSources({
        labourEntries: [
          {
            id: 'lab-1',
            entryType: 'job_time',
            durationMinutes: 120,
            hourlyCostCents: 8500,
            overtimeMultiplier: 1,
            metadata: { hourlyCostLockedAt: '2026-01-01T08:00:00.000Z' },
          },
        ],
      }),
    );
    assert.notEqual(before, after);
  });

  it('9 unrelated job id keeps fingerprint isolated per job', () => {
    const jobA = computeJobFinancialSourceFingerprintFromSources(baseSources({ jobId: 'job-a' }));
    const jobB = computeJobFinancialSourceFingerprintFromSources(baseSources({ jobId: 'job-b' }));
    assert.notEqual(jobA, jobB);
  });

  it('10 reviewed fingerprint A then source mutation B marks review stale', () => {
    const fingerprintA = computeJobFinancialSourceFingerprintFromSources(baseSources());
    const fingerprintB = computeJobFinancialSourceFingerprintFromSources(
      baseSources({
        adjustments: [{ id: 'adj-1', kind: 'credit', amountCents: -750 }],
      }),
    );
    assert.notEqual(fingerprintA, fingerprintB);
    assert.equal(isFinancialReviewStale(fingerprintA, fingerprintA, 'financially_complete'), false);
    assert.equal(isFinancialReviewStale(fingerprintA, fingerprintB, 'financially_complete'), true);
  });

  it('11 calculationVersion change produces different fingerprint', () => {
    const canonical = buildJobFinancialFingerprintFromSources(baseSources());
    const v4 = computeJobFinancialSourceFingerprint({
      ...canonical,
      calculationVersion: JPE_CALCULATION_VERSION,
    });
    const v5 = computeJobFinancialSourceFingerprint({
      ...canonical,
      calculationVersion: JPE_CALCULATION_VERSION + 1,
    });
    assert.notEqual(v4, v5);
    assert.equal(canonical.fingerprintVersion, JPE_FINANCIAL_FINGERPRINT_VERSION);
  });

  it('12 canonical JSON excludes timestamps and uses stable key ordering', () => {
    const input = baseSources();
    const canonical = buildJobFinancialFingerprintFromSources(input);
    const json = JSON.stringify(canonical);
    assert.doesNotMatch(json, /calculatedAt/);
    assert.doesNotMatch(json, /createdAt/);
    assert.doesNotMatch(json, /updatedAt/);
    assert.ok(canonical.jobId === 'job-a');
  });

  it('13 legacy JPE-002A canonical fixture matches pre-split SHA-256 fingerprint', () => {
    const fingerprint = computeJobFinancialSourceFingerprintFromSources(baseSources());
    assert.equal(
      fingerprint,
      '1844815e3de4dd436b773419231de1ac8464f9d09850a320d49b68bd9459b981',
    );
  });
});
