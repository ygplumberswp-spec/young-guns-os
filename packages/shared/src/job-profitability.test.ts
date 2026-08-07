import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAccessJobProfitability,
  canViewJobProfitabilityMargin,
  classifyProfitabilityStatus,
  computeJobProfitability,
  computeLabourCostCents,
  computeNetMaterialCostCents,
  safeMarginPct,
} from './job-profitability.js';

const DEFAULT_THRESHOLDS = {
  excellentMarginBps: 3500,
  healthyMarginBps: 2500,
  warningMarginBps: 1500,
};

function baseInput(
  overrides: Partial<Parameters<typeof computeJobProfitability>[0]> = {},
): Parameters<typeof computeJobProfitability>[0] {
  return {
    jobId: 'job-1',
    currency: 'ZAR',
    jobStatus: 'completed',
    labourRateCentsPerHour: 8000,
    thresholds: DEFAULT_THRESHOLDS,
    materialLines: [],
    purchaseOrders: [],
    invoices: [],
    paymentsCents: 0,
    quotes: [],
    labourEntries: [],
    directCosts: [],
    adjustments: [],
    includeSensitiveCosts: true,
    ...overrides,
  };
}

describe('job profitability engine', () => {
  it('computes basic profit: revenue 10k, costs 5k, margin 50%', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [{ id: 'inv-1', status: 'sent', totalCents: 10_000, subtotalCents: 8696, vatCents: 1304, amountPaidCents: 0 }],
        materialLines: [
          {
            id: 'm1',
            status: 'used',
            quantity: '1',
            fulfilledQuantity: '1',
            unitCostCents: 3000,
            materialSource: 'warehouse_stock',
            description: 'Materials',
            recordedByUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        labourEntries: [
          {
            id: 't1',
            userId: 'u1',
            durationMinutes: 90,
            startedAt: '2026-01-01T08:00:00.000Z',
            endedAt: '2026-01-01T09:30:00.000Z',
            approved: true,
            hourlyCostCents: 1000,
            overtimeMultiplier: 1,
          },
        ],
        directCosts: [
          {
            id: 'd1',
            category: 'fuel',
            description: 'Fuel',
            amountCents: 500,
            sourceType: 'manual',
            sourceId: 'manual-1',
            costDate: null,
            enteredByUserId: 'u1',
            isPaid: true,
            notes: null,
          },
        ],
      }),
    );

    assert.equal(result.summary.totalDirectCostCents, 5000);
    assert.equal(result.summary.grossProfitCents, 5000);
    assert.equal(result.summary.grossMarginPct, 50);
    assert.equal(result.summary.revenueSource, 'invoice');
  });

  it('computes loss: revenue 5k, costs 6k, margin -20%', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [{ id: 'inv-1', status: 'sent', totalCents: 5000, subtotalCents: 4348, vatCents: 652, amountPaidCents: 0 }],
        materialLines: [
          {
            id: 'm1',
            status: 'used',
            quantity: '1',
            fulfilledQuantity: '1',
            unitCostCents: 6000,
            materialSource: 'supplier_purchase',
            description: 'Materials',
            recordedByUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );

    assert.equal(result.summary.grossProfitCents, -1000);
    assert.equal(result.summary.grossMarginPct, -20);
    assert.equal(result.summary.status, 'loss');
  });

  it('handles zero revenue without divide-by-zero', () => {
    const result = computeJobProfitability(
      baseInput({
        materialLines: [
          {
            id: 'm1',
            status: 'used',
            quantity: '1',
            fulfilledQuantity: '1',
            unitCostCents: 1000,
            materialSource: 'warehouse_stock',
            description: 'Materials',
            recordedByUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );

    assert.equal(result.summary.jobRevenueCents, 0);
    assert.equal(result.summary.grossMarginPct, null);
    assert.equal(result.summary.grossMarginPct, null);
  });

  it('nets material returns: issued 2k, returned 500 → net 1.5k', () => {
    const net = computeNetMaterialCostCents({
      materialLines: [
        {
          id: 'm1',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: '1',
          unitCostCents: 2000,
          materialSource: 'warehouse_stock',
          description: 'Used',
          recordedByUserId: 'u1',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'm2',
          status: 'returned',
          quantity: '1',
          fulfilledQuantity: '1',
          unitCostCents: 500,
          materialSource: 'warehouse_stock',
          description: 'Returned',
          recordedByUserId: 'u1',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      purchaseOrders: [],
    });

    assert.equal(net.materialCostCents, 1500);
  });

  it('aggregates multiple labour entries', () => {
    const labour = computeLabourCostCents([
      {
        id: 't1',
        userId: 'u1',
        durationMinutes: 60,
        startedAt: '2026-01-01T08:00:00.000Z',
        endedAt: '2026-01-01T09:00:00.000Z',
        approved: true,
        hourlyCostCents: 8000,
        overtimeMultiplier: 1,
      },
      {
        id: 't2',
        userId: 'u2',
        durationMinutes: 30,
        startedAt: '2026-01-01T09:00:00.000Z',
        endedAt: '2026-01-01T09:30:00.000Z',
        approved: true,
        hourlyCostCents: 8000,
        overtimeMultiplier: 1,
      },
    ]);

    assert.equal(labour.labourMinutes, 90);
    assert.equal(labour.labourCostCents, 10000);
  });

  it('calculates expected vs actual variances', () => {
    const result = computeJobProfitability(
      baseInput({
        quotes: [
          {
            id: 'q1',
            status: 'accepted',
            totalCents: 10_000,
            subtotalCents: 8696,
            lineItems: [
              {
                category: 'materials',
                lineCostCents: 2000,
                lineSubtotalCents: 3000,
                isOptional: false,
              },
              {
                category: 'labour',
                lineCostCents: 1000,
                lineSubtotalCents: 2000,
                isOptional: false,
              },
            ],
          },
        ],
        invoices: [{ id: 'inv-1', status: 'sent', totalCents: 10_000, subtotalCents: 8696, vatCents: 1304, amountPaidCents: 0 }],
        materialLines: [
          {
            id: 'm1',
            status: 'used',
            quantity: '1',
            fulfilledQuantity: '1',
            unitCostCents: 3000,
            materialSource: 'warehouse_stock',
            description: 'Materials',
            recordedByUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );

    assert.equal(result.variance.materialCostVarianceCents, 1000);
    assert.equal(result.variance.revenueVarianceCents, 0);
  });

  it('separates cash profit from accrual profit', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [{ id: 'inv-1', status: 'sent', totalCents: 10_000, subtotalCents: 8696, vatCents: 1304, amountPaidCents: 6000 }],
        paymentsCents: 6000,
        directCosts: [
          {
            id: 'd1',
            category: 'fuel',
            description: 'Fuel',
            amountCents: 4000,
            sourceType: 'manual',
            sourceId: 'manual-cash-1',
            costDate: null,
            enteredByUserId: 'u1',
            isPaid: true,
            notes: null,
          },
        ],
      }),
    );

    assert.equal(result.cash.cashCollectedCents, 6000);
    assert.equal(result.cash.cashSpentCents, 4000);
    assert.equal(result.cash.realisedCashProfitCents, 2000);
    assert.equal(result.cash.uncollectedRevenueCents, 4000);
  });

  it('avoids double-counting PO when supplier purchase material lines exist', () => {
    const net = computeNetMaterialCostCents({
      materialLines: [
        {
          id: 'm1',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: '1',
          unitCostCents: 2000,
          materialSource: 'supplier_purchase',
          description: 'PO material',
          recordedByUserId: 'u1',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      purchaseOrders: [
        { id: 'po1', referenceNumber: 'PO-1', status: 'received', totalCostCents: 2000 },
      ],
    });

    assert.equal(net.purchaseOrderAddOnCents, 0);
    assert.equal(net.materialCostCents, 2000);
  });

  it('classifies profitability status from configurable thresholds', () => {
    assert.equal(classifyProfitabilityStatus(40, DEFAULT_THRESHOLDS), 'excellent');
    assert.equal(classifyProfitabilityStatus(30, DEFAULT_THRESHOLDS), 'healthy');
    assert.equal(classifyProfitabilityStatus(18, DEFAULT_THRESHOLDS), 'warning');
    assert.equal(classifyProfitabilityStatus(-5, DEFAULT_THRESHOLDS), 'loss');
    assert.equal(classifyProfitabilityStatus(null, DEFAULT_THRESHOLDS), 'unknown');
  });

  it('safeMarginPct returns null for zero revenue', () => {
    assert.equal(safeMarginPct(100, 0), null);
  });

  it('RBAC: technician cannot access sensitive margin', () => {
    assert.equal(canAccessJobProfitability({ permissions: ['jobs:read'] }), false);
    assert.equal(canAccessJobProfitability({ permissions: ['finance:read'] }), true);
    assert.equal(canViewJobProfitabilityMargin(['finance:read'], 'Technician'), false);
    assert.equal(canViewJobProfitabilityMargin(['finance:write'], 'Technician'), true);
    assert.equal(canViewJobProfitabilityMargin(['finance:read'], 'Company Owner'), true);
  });

  it('strips sensitive costs when includeSensitiveCosts is false', () => {
    const result = computeJobProfitability(
      baseInput({
        includeSensitiveCosts: false,
        invoices: [{ id: 'inv-1', status: 'sent', totalCents: 10_000, subtotalCents: 8696, vatCents: 1304, amountPaidCents: 5000 }],
        paymentsCents: 5000,
        materialLines: [
          {
            id: 'm1',
            status: 'used',
            quantity: '1',
            fulfilledQuantity: '1',
            unitCostCents: 3000,
            materialSource: 'warehouse_stock',
            description: 'Materials',
            recordedByUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );

    assert.equal(result.summary.grossMarginPct, null);
    assert.equal(result.summary.grossProfitCents, 0);
    assert.equal(result.leakage.length, 0);
  });
});
