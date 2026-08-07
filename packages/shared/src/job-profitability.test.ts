import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAccessJobProfitability,
  canViewJobProfitabilityMargin,
  computeJobProfitability,
  computeNetMaterialCostCents,
  resolveJobRevenue,
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
    payments: [],
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
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 10_000,
            subtotalCents: 8696,
            vatCents: 1304,
            amountPaidCents: 0,
          },
        ],
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
            supplierReference: null,
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

  it('invoice + negative revenue adjustment reduces final revenue additively', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 10_000,
            subtotalCents: 8696,
            vatCents: 1304,
            amountPaidCents: 0,
          },
        ],
        adjustments: [
          {
            id: 'adj-1',
            kind: 'revenue',
            amountCents: -1000,
            reason: 'Customer discount',
            createdAt: '2026-01-02T00:00:00.000Z',
            createdByUserId: 'u1',
          },
        ],
      }),
    );

    assert.equal(result.summary.baseRevenueCents, 10_000);
    assert.equal(result.summary.revenueAdjustmentCents, -1000);
    assert.equal(result.summary.jobRevenueCents, 9000);
    assert.equal(result.summary.revenueSource, 'invoice');
    assert.equal(result.explainability.revenue.finalRevenueCents, 9000);
  });

  it('invoice + positive revenue adjustment increases final revenue additively', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 10_000,
            subtotalCents: 8696,
            vatCents: 1304,
            amountPaidCents: 0,
          },
        ],
        adjustments: [
          {
            id: 'adj-1',
            kind: 'revenue',
            amountCents: 500,
            reason: 'Variation approved',
            createdAt: '2026-01-02T00:00:00.000Z',
            createdByUserId: 'u1',
          },
        ],
      }),
    );

    assert.equal(result.summary.jobRevenueCents, 10_500);
    assert.equal(result.summary.revenueSource, 'invoice');
  });

  it('quote fallback + revenue adjustment when no invoice exists', () => {
    const resolved = resolveJobRevenue({
      invoices: [],
      primaryQuote: {
        id: 'q1',
        status: 'accepted',
        totalCents: 8000,
        subtotalCents: 7000,
        lineItems: [],
      },
      revenueAdjustmentsCents: 500,
    });

    assert.equal(resolved.baseRevenueCents, 8000);
    assert.equal(resolved.jobRevenueCents, 8500);
    assert.equal(resolved.revenueSource, 'approved_quote');
  });

  it('aggregates multiple revenue adjustments', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 10_000,
            subtotalCents: 8696,
            vatCents: 1304,
            amountPaidCents: 0,
          },
        ],
        adjustments: [
          {
            id: 'adj-1',
            kind: 'revenue',
            amountCents: -1000,
            reason: 'Discount',
            createdAt: '2026-01-02T00:00:00.000Z',
            createdByUserId: 'u1',
          },
          {
            id: 'adj-2',
            kind: 'revenue',
            amountCents: 300,
            reason: 'Approved extra',
            createdAt: '2026-01-03T00:00:00.000Z',
            createdByUserId: 'u1',
          },
        ],
      }),
    );

    assert.equal(result.summary.jobRevenueCents, 9300);
  });

  it('partial PO/material conversion dedupes at PO-line level', () => {
    const net = computeNetMaterialCostCents({
      materialLines: [
        {
          id: 'm1',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: '1',
          unitCostCents: 1000,
          materialSource: 'supplier_purchase',
          description: 'PO line A',
          recordedByUserId: 'u1',
          createdAt: '2026-01-01T00:00:00.000Z',
          supplierReference: 'po-item:po-line-a',
        },
      ],
      purchaseOrders: [
        {
          id: 'po1',
          referenceNumber: 'PO-100',
          status: 'received',
          totalCostCents: 6000,
          items: [
            { id: 'po-line-a', lineTotalCents: 1000, description: 'Line A' },
            { id: 'po-line-b', lineTotalCents: 2000, description: 'Line B' },
            { id: 'po-line-c', lineTotalCents: 3000, description: 'Line C' },
          ],
        },
      ],
    });

    assert.equal(net.materialCostCents, 6000);
    assert.equal(net.purchaseOrderAddOnCents, 5000);
  });

  it('full PO conversion dedupes — no PO add-on when all lines covered', () => {
    const net = computeNetMaterialCostCents({
      materialLines: [
        {
          id: 'm1',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: '1',
          unitCostCents: 1000,
          materialSource: 'supplier_purchase',
          description: 'Line A',
          recordedByUserId: 'u1',
          createdAt: '2026-01-01T00:00:00.000Z',
          supplierReference: 'po-item:po-line-a',
        },
        {
          id: 'm2',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: '1',
          unitCostCents: 2000,
          materialSource: 'supplier_purchase',
          description: 'Line B',
          recordedByUserId: 'u1',
          createdAt: '2026-01-01T00:00:00.000Z',
          supplierReference: 'po-item:po-line-b',
        },
        {
          id: 'm3',
          status: 'used',
          quantity: '1',
          fulfilledQuantity: '1',
          unitCostCents: 3000,
          materialSource: 'supplier_purchase',
          description: 'Line C',
          recordedByUserId: 'u1',
          createdAt: '2026-01-01T00:00:00.000Z',
          supplierReference: 'po-item:po-line-c',
        },
      ],
      purchaseOrders: [
        {
          id: 'po1',
          referenceNumber: 'PO-100',
          status: 'received',
          totalCostCents: 6000,
          items: [
            { id: 'po-line-a', lineTotalCents: 1000, description: 'Line A' },
            { id: 'po-line-b', lineTotalCents: 2000, description: 'Line B' },
            { id: 'po-line-c', lineTotalCents: 3000, description: 'Line C' },
          ],
        },
      ],
    });

    assert.equal(net.purchaseOrderAddOnCents, 0);
    assert.equal(net.materialCostCents, 6000);
  });

  it('cashSpent includes paid supplier/direct costs once; labour accrual excluded', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 20_000,
            subtotalCents: 17_391,
            vatCents: 2609,
            amountPaidCents: 15_000,
          },
        ],
        payments: [{ id: 'pay-1', amountCents: 15_000, paidAt: '2026-01-05T00:00:00.000Z', reference: 'EFT-1' }],
        materialLines: [
          {
            id: 'm1',
            status: 'used',
            quantity: '1',
            fulfilledQuantity: '1',
            unitCostCents: 8000,
            materialSource: 'supplier_purchase',
            description: 'Materials consumed',
            recordedByUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
            supplierReference: null,
          },
        ],
        labourEntries: [
          {
            id: 't1',
            userId: 'u1',
            durationMinutes: 120,
            startedAt: '2026-01-01T08:00:00.000Z',
            endedAt: '2026-01-01T10:00:00.000Z',
            approved: true,
            hourlyCostCents: 1000,
            overtimeMultiplier: 1,
          },
        ],
        directCosts: [
          {
            id: 'd-supplier',
            category: 'miscellaneous',
            description: 'Supplier payment',
            amountCents: 5000,
            sourceType: 'purchase_order',
            sourceId: 'po1',
            costDate: '2026-01-02T00:00:00.000Z',
            enteredByUserId: 'u1',
            isPaid: true,
            notes: null,
          },
          {
            id: 'd-other',
            category: 'fuel',
            description: 'Fuel',
            amountCents: 1000,
            sourceType: 'manual',
            sourceId: 'manual-1',
            costDate: '2026-01-02T00:00:00.000Z',
            enteredByUserId: 'u1',
            isPaid: true,
            notes: null,
          },
        ],
      }),
    );

    assert.equal(result.summary.totalDirectCostCents, 11_000);
    assert.equal(result.cash.cashCollectedCents, 15_000);
    assert.equal(result.cash.cashSpentCents, 6000);
    assert.equal(result.cash.realisedCashProfitCents, 9000);
    assert.equal(result.explainability.cash.labourIncludedInCashSpent, false);
  });

  it('unpaid supplier cost affects economic cost but not cashSpent', () => {
    const result = computeJobProfitability(
      baseInput({
        materialLines: [
          {
            id: 'm1',
            status: 'used',
            quantity: '1',
            fulfilledQuantity: '1',
            unitCostCents: 4000,
            materialSource: 'supplier_purchase',
            description: 'Materials',
            recordedByUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
            supplierReference: null,
          },
        ],
        directCosts: [
          {
            id: 'd1',
            category: 'miscellaneous',
            description: 'Supplier bill unpaid',
            amountCents: 4000,
            sourceType: 'purchase_order',
            sourceId: 'po1',
            costDate: null,
            enteredByUserId: 'u1',
            isPaid: false,
            notes: null,
          },
        ],
      }),
    );

    assert.equal(result.summary.materialCostCents, 4000);
    assert.equal(result.cash.cashSpentCents, 0);
    assert.equal(result.cash.unpaidAccrualCostsCents, 4000);
  });

  it('payment changes cash profitability section', () => {
    const before = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 10_000,
            subtotalCents: 8696,
            vatCents: 1304,
            amountPaidCents: 0,
          },
        ],
        payments: [],
      }),
    );
    const after = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 10_000,
            subtotalCents: 8696,
            vatCents: 1304,
            amountPaidCents: 6000,
          },
        ],
        payments: [{ id: 'pay-1', amountCents: 6000, paidAt: '2026-01-04T00:00:00.000Z', reference: null }],
      }),
    );

    assert.equal(before.cash.cashCollectedCents, 0);
    assert.equal(after.cash.cashCollectedCents, 6000);
    assert.equal(after.cash.uncollectedRevenueCents, 4000);
  });

  it('marks snapshot as live calculation with source fingerprint', () => {
    const result = computeJobProfitability(
      baseInput({ sourceFingerprint: '1735689600000' }),
    );

    assert.equal(result.snapshot.isLiveCalculation, true);
    assert.equal(result.snapshot.sourceFingerprint, '1735689600000');
    assert.equal(result.snapshot.calculationVersion, 2);
  });

  it('computes loss: revenue 5k, costs 6k, margin -20%', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 5000,
            subtotalCents: 4348,
            vatCents: 652,
            amountPaidCents: 0,
          },
        ],
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
            supplierReference: null,
          },
        ],
      }),
    );

    assert.equal(result.summary.grossProfitCents, -1000);
    assert.equal(result.summary.grossMarginPct, -20);
    assert.equal(result.summary.status, 'loss');
  });

  it('handles zero revenue without divide-by-zero', () => {
    const result = computeJobProfitability(baseInput());
    assert.equal(result.summary.jobRevenueCents, 0);
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
          supplierReference: null,
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
          supplierReference: null,
        },
      ],
      purchaseOrders: [],
    });

    assert.equal(net.materialCostCents, 1500);
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
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 10_000,
            subtotalCents: 8696,
            vatCents: 1304,
            amountPaidCents: 5000,
          },
        ],
        payments: [{ id: 'pay-1', amountCents: 5000, paidAt: '2026-01-01T00:00:00.000Z', reference: null }],
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
            supplierReference: null,
          },
        ],
      }),
    );

    assert.equal(result.summary.grossMarginPct, null);
    assert.equal(result.summary.grossProfitCents, 0);
    assert.equal(result.leakage.length, 0);
  });
});
