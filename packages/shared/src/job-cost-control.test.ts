import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessJobCostControl,
  canAccessJobCostControl,
  isFinancialReviewStale,
  isReceiptRequiredForDirectCost,
  mapProfitabilityConfidenceToCompleteness,
} from './job-cost-control.js';
import { computeJobProfitability } from './job-profitability.js';
import { buildLabourRateLockMetadata } from './job-profitability-source-integrity.js';

const THRESHOLDS = {
  excellentMarginBps: 3500,
  healthyMarginBps: 2500,
  warningMarginBps: 1500,
};

function profitabilityFromInput(
  input: Parameters<typeof computeJobProfitability>[0],
): ReturnType<typeof computeJobProfitability> {
  return computeJobProfitability(input);
}

function assess(overrides: Partial<Parameters<typeof assessJobCostControl>[0]> = {}) {
  const p = profitabilityFromInput({
    jobId: 'job-1',
    currency: 'ZAR',
    jobStatus: 'completed',
    labourRateCentsPerHour: 8000,
    thresholds: THRESHOLDS,
    materialLines: [],
    purchaseOrders: [],
    invoices: [],
    payments: [],
    quotes: [],
    labourEntries: [],
    directCosts: [],
    adjustments: [],
    includeSensitiveCosts: true,
  });
  return assessJobCostControl({
    jobId: 'job-1',
    jobStatus: 'completed',
    jobReference: 'JOB-001',
    currency: 'ZAR',
    profitability: p,
    financialReview: { status: 'needs_review', reviewFingerprint: null, isStale: false },
    labourEntries: [],
    materialLines: [],
    directCosts: [],
    hasCrewAssigned: false,
    marginVarianceThresholdBps: 1000,
    warningMarginBps: 1500,
    ...overrides,
  });
}

describe('JPE-002 job cost control', () => {
  it('1 completed job with no revenue → incomplete', () => {
    const result = assess({ jobStatus: 'completed' });
    assert.equal(result.status, 'attention_required');
    assert.ok(result.flags.some((f) => f.type === 'NO_REVENUE_SOURCE'));
  });

  it('2 completed job with no labour → missing labour', () => {
    const p = profitabilityFromInput({
        jobId: 'job-1',
        currency: 'ZAR',
        jobStatus: 'completed',
        labourRateCentsPerHour: 8000,
        thresholds: THRESHOLDS,
        materialLines: [],
        purchaseOrders: [],
        invoices: [
          {
            id: 'inv',
            status: 'sent',
            totalCents: 10_000,
            subtotalCents: 8696,
            vatCents: 1304,
            amountPaidCents: 0,
          },
        ],
        payments: [],
        quotes: [],
        labourEntries: [],
        directCosts: [],
        adjustments: [],
        includeSensitiveCosts: true,
    });
    const result = assess({ profitability: p, jobStatus: 'completed', hasCrewAssigned: true });
    assert.ok(result.flags.some((f) => f.type === 'NO_LABOUR_CAPTURED'));
  });

  it('3 unlocked labour → provisional', () => {
    const p = profitabilityFromInput({
        jobId: 'job-1',
        currency: 'ZAR',
        jobStatus: 'completed',
        labourRateCentsPerHour: 8000,
        thresholds: THRESHOLDS,
        materialLines: [],
        purchaseOrders: [],
        invoices: [
          {
            id: 'inv',
            status: 'sent',
            totalCents: 10_000,
            subtotalCents: 8696,
            vatCents: 1304,
            amountPaidCents: 0,
          },
        ],
        payments: [{ id: 'p1', amountCents: 10_000, paidAt: '2026-01-02', reference: null }],
        quotes: [],
        labourEntries: [
          {
            id: 't1',
            userId: 'u1',
            entryType: 'job_time',
            durationMinutes: 60,
            startedAt: '2026-01-01T08:00:00.000Z',
            endedAt: '2026-01-01T09:00:00.000Z',
            approved: true,
            hourlyCostCents: 8000,
            overtimeMultiplier: 1,
            labourRateConfidence: 'fallback_current_rate',
          },
        ],
        directCosts: [],
        adjustments: [],
        includeSensitiveCosts: true,
    });
    const result = assess({
      profitability: p,
      labourEntries: [
        {
          id: 't1',
          entryType: 'job_time',
          durationMinutes: 60,
          labourRateConfidence: 'fallback_current_rate',
          userId: 'u1',
        },
      ],
    });
    assert.equal(result.status, 'provisional');
    assert.ok(result.flags.some((f) => f.type === 'LABOUR_ENTRY_UNLOCKED'));
  });

  it('4 material with no cost → missing cost', () => {
    const result = assess({
      materialLines: [
        {
          id: 'm1',
          status: 'used',
          quantity: '2',
          unitCostCents: 0,
          description: 'Copper pipe',
        },
      ],
    });
    assert.ok(result.flags.some((f) => f.type === 'MATERIAL_COST_MISSING'));
  });

  it('5 unknown tax → provisional via profitability confidence', () => {
    const p = profitabilityFromInput({
        jobId: 'job-1',
        currency: 'ZAR',
        jobStatus: 'completed',
        labourRateCentsPerHour: 8000,
        thresholds: THRESHOLDS,
        materialLines: [
          {
            id: 'm1',
            status: 'used',
            quantity: '1',
            fulfilledQuantity: '1',
            unitCostCents: 5000,
            materialSource: 'warehouse_stock',
            description: 'Part',
            recordedByUserId: 'u1',
            createdAt: '2026-01-01',
            supplierReference: null,
          },
        ],
        purchaseOrders: [],
        invoices: [
          {
            id: 'inv',
            status: 'sent',
            totalCents: 20_000,
            subtotalCents: 17_391,
            vatCents: 2609,
            amountPaidCents: 0,
          },
        ],
        payments: [],
        quotes: [],
        labourEntries: [],
        directCosts: [],
        adjustments: [],
        includeSensitiveCosts: true,
    });
    const result = assess({ profitability: p });
    assert.equal(result.profitabilityConfidence.status, 'provisional');
  });

  it('6 cost without evidence → receipt missing', () => {
    assert.equal(
      isReceiptRequiredForDirectCost({ category: 'fuel', sourceType: 'manual', amountCents: 2850 }),
      true,
    );
    const result = assess({
      directCosts: [
        {
          id: 'd1',
          category: 'fuel',
          description: 'Fuel',
          amountCents: 2850,
          sourceType: 'manual',
          receiptDocumentId: null,
          isPaid: true,
        },
      ],
    });
    assert.ok(result.flags.some((f) => f.type === 'DIRECT_COST_RECEIPT_MISSING'));
    assert.equal(result.checklist.receipts.status, 'warning');
  });

  it('12 expected vs actual margin warning', () => {
    const p = profitabilityFromInput({
        jobId: 'job-1',
        currency: 'ZAR',
        jobStatus: 'completed',
        labourRateCentsPerHour: 8000,
        thresholds: THRESHOLDS,
        materialLines: [],
        purchaseOrders: [],
        invoices: [
          {
            id: 'inv',
            status: 'sent',
            totalCents: 100_000,
            subtotalCents: 86_957,
            vatCents: 13_043,
            amountPaidCents: 0,
          },
        ],
        payments: [],
        quotes: [
          {
            id: 'q1',
            status: 'accepted',
            totalCents: 100_000,
            subtotalCents: 86_957,
            lineItems: [
              {
                category: 'materials',
                lineCostCents: 20_000,
                lineSubtotalCents: 30_000,
                isOptional: false,
              },
              {
                category: 'labour',
                lineCostCents: 10_000,
                lineSubtotalCents: 40_000,
                isOptional: false,
              },
            ],
          },
        ],
        labourEntries: [
          {
            id: 't1',
            userId: 'u1',
            entryType: 'job_time',
            durationMinutes: 600,
            startedAt: '2026-01-01T08:00:00.000Z',
            endedAt: '2026-01-01T18:00:00.000Z',
            approved: true,
            metadata: buildLabourRateLockMetadata({
              existingMetadata: {},
              companyDefaultRateCentsPerHour: 10_000,
            }),
            labourRateConfidence: 'locked',
            hourlyCostCents: 10_000,
            overtimeMultiplier: 1,
          },
        ],
        directCosts: [],
        adjustments: [],
        includeSensitiveCosts: true,
    });
    const result = assess({
      profitability: p,
      marginVarianceThresholdBps: 500,
    });
    assert.ok(
      result.flags.some((f) => f.type === 'EXPECTED_MARGIN_MISSED') ||
        result.flags.some((f) => f.type === 'LOW_MARGIN_JOB'),
    );
  });

  it('13 negative-margin job flagged', () => {
    const p = profitabilityFromInput({
        jobId: 'job-1',
        currency: 'ZAR',
        jobStatus: 'completed',
        labourRateCentsPerHour: 8000,
        thresholds: THRESHOLDS,
        materialLines: [],
        purchaseOrders: [],
        invoices: [
          {
            id: 'inv',
            status: 'sent',
            totalCents: 5000,
            subtotalCents: 4348,
            vatCents: 652,
            amountPaidCents: 0,
          },
        ],
        payments: [],
        quotes: [],
        labourEntries: [
          {
            id: 't1',
            userId: 'u1',
            entryType: 'job_time',
            durationMinutes: 600,
            startedAt: '2026-01-01T08:00:00.000Z',
            endedAt: '2026-01-01T18:00:00.000Z',
            approved: true,
            hourlyCostCents: 10_000,
            overtimeMultiplier: 1,
            labourRateConfidence: 'locked',
          },
        ],
        directCosts: [],
        adjustments: [],
        includeSensitiveCosts: true,
    });
    const result = assess({ profitability: p });
    assert.ok(result.flags.some((f) => f.type === 'LOSS_JOB'));
    assert.equal(mapProfitabilityConfidenceToCompleteness(p.profitabilityConfidence, result.flags), 'attention_required');
  });

  it('14-16 financial review fingerprint staleness', () => {
    assert.equal(isFinancialReviewStale('abc123', 'abc123', 'financially_complete'), false);
    assert.equal(isFinancialReviewStale('abc123', 'def456', 'financially_complete'), true);
    assert.equal(isFinancialReviewStale('abc123', 'def456', 'needs_review'), false);

    const result = assess({
      financialReview: {
        status: 'financially_complete',
        reviewFingerprint: 'abc123',
        isStale: true,
      },
    });
    assert.ok(result.flags.some((f) => f.type === 'FINANCIAL_REVIEW_STALE'));
  });

  it('17 technician cannot access finance queue', () => {
    assert.equal(canAccessJobCostControl({ permissions: ['jobs:read'], roleName: 'Technician' }), false);
  });

  it('19 owner can access finance queue', () => {
    assert.equal(
      canAccessJobCostControl({ permissions: ['finance:read'], roleName: 'Company Owner' }),
      true,
    );
  });

  it('21 currency remains cent-exact in flags', () => {
    const p = profitabilityFromInput({
        jobId: 'job-1',
        currency: 'ZAR',
        jobStatus: 'completed',
        labourRateCentsPerHour: 8000,
        thresholds: THRESHOLDS,
        materialLines: [],
        purchaseOrders: [],
        invoices: [
          {
            id: 'inv',
            status: 'sent',
            totalCents: 11_500,
            subtotalCents: 10_000,
            vatCents: 1500,
            amountPaidCents: 5750,
          },
        ],
        payments: [{ id: 'p1', amountCents: 5750, paidAt: '2026-01-02', reference: null }],
        quotes: [],
        labourEntries: [],
        directCosts: [],
        adjustments: [],
        includeSensitiveCosts: true,
    });
    const result = assess({ profitability: p });
    const outstanding = result.flags.find((f) => f.type === 'CUSTOMER_PAYMENT_OUTSTANDING');
    assert.equal(outstanding?.amountCents, 5750);
  });
});
