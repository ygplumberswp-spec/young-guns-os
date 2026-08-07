import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAccessJobProfitability,
  canViewJobProfitabilityMargin,
  computeJobProfitability,
  computeLabourCostCents,
  computeNetMaterialCostCents,
  isAuthoritativeInvoiceForRevenue,
  isPaymentCountedForCashCollection,
  resolveJobRevenue,
  resolveLabourHourlyCostCents,
  sumCashCollectedCents,
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
  it('computes basic profit on ex-VAT economic basis', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 11_500,
            subtotalCents: 10_000,
            vatCents: 1500,
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

    assert.equal(result.summary.jobRevenueCents, 11_500);
    assert.equal(result.summary.economicRevenueCents, 10_000);
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
    assert.equal(result.snapshot.calculationVersion, 4);
  });

  it('computes loss on ex-VAT economic basis', () => {
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

    assert.equal(result.summary.economicRevenueCents, 4348);
    assert.equal(result.summary.grossProfitCents, -1652);
    assert.equal(result.summary.grossMarginPct, -37.99);
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
    // SEC-001: role hard-deny — mis-elevated finance:write must not expose margin.
    assert.equal(canViewJobProfitabilityMargin(['finance:write'], 'Technician'), false);
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

describe('JPE-001C accounting integrity', () => {
  it('VAT-consistent economic margin uses ex-VAT subtotals not invoice totals', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'paid',
            totalCents: 11_500,
            subtotalCents: 10_000,
            vatCents: 1500,
            amountPaidCents: 11_500,
          },
        ],
        materialLines: [
          {
            id: 'm1',
            status: 'used',
            quantity: '1',
            fulfilledQuantity: '1',
            unitCostCents: 4000,
            materialSource: 'warehouse_stock',
            description: 'Materials',
            recordedByUserId: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z',
            supplierReference: null,
          },
        ],
      }),
    );

    assert.equal(result.summary.jobRevenueCents, 11_500);
    assert.equal(result.summary.economicRevenueCents, 10_000);
    assert.equal(result.summary.grossProfitCents, 6000);
    assert.equal(result.summary.grossMarginPct, 60);
  });

  it('VAT-inclusive cash collected remains actual payment amounts', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'partial',
            totalCents: 11_500,
            subtotalCents: 10_000,
            vatCents: 1500,
            amountPaidCents: 5750,
          },
        ],
        payments: [
          {
            id: 'pay-1',
            amountCents: 5750,
            paidAt: '2026-01-02T00:00:00.000Z',
            reference: 'EFT',
          },
        ],
      }),
    );

    assert.equal(result.cash.cashCollectedCents, 5750);
    assert.equal(result.summary.economicRevenueCents, 10_000);
  });

  it('historical labour rate stays locked when company default changes', () => {
    const lockedRate = resolveLabourHourlyCostCents(
      { metadata: { hourlyCostCents: 10_000 } },
      15_000,
    );
    assert.equal(lockedRate, 10_000);

    const cost = computeLabourCostCents([
      {
        id: 't1',
        userId: 'u1',
        durationMinutes: 120,
        startedAt: '2026-01-01T08:00:00.000Z',
        endedAt: '2026-01-01T10:00:00.000Z',
        approved: true,
        hourlyCostCents: lockedRate,
        overtimeMultiplier: 1,
      },
    ]);

    assert.equal(cost.labourCostCents, 20_000);
  });

  it('multiple historical worker rates are preserved per entry metadata', () => {
    const workerA = resolveLabourHourlyCostCents({ metadata: { hourlyCostCents: 8000 } }, 12_000);
    const workerB = resolveLabourHourlyCostCents(
      { metadata: { internalRateCentsPerHour: 9500 } },
      12_000,
    );
    const fallback = resolveLabourHourlyCostCents({}, 12_000);

    const cost = computeLabourCostCents([
      {
        id: 't1',
        userId: 'u1',
        durationMinutes: 60,
        startedAt: '2026-01-01T08:00:00.000Z',
        endedAt: '2026-01-01T09:00:00.000Z',
        approved: true,
        hourlyCostCents: workerA,
        overtimeMultiplier: 1,
      },
      {
        id: 't2',
        userId: 'u2',
        durationMinutes: 60,
        startedAt: '2026-01-01T09:00:00.000Z',
        endedAt: '2026-01-01T10:00:00.000Z',
        approved: true,
        hourlyCostCents: workerB,
        overtimeMultiplier: 1,
      },
      {
        id: 't3',
        userId: 'u3',
        durationMinutes: 60,
        startedAt: '2026-01-01T10:00:00.000Z',
        endedAt: '2026-01-01T11:00:00.000Z',
        approved: true,
        hourlyCostCents: fallback,
        overtimeMultiplier: 1,
      },
    ]);

    assert.equal(cost.labourCostCents, 8000 + 9500 + 12_000);
  });

  it('draft invoice excluded from revenue; accepted quote used instead', () => {
    const resolved = resolveJobRevenue({
      invoices: [
        {
          id: 'inv-draft',
          status: 'draft',
          totalCents: 99_999,
          subtotalCents: 86_999,
          vatCents: 13_000,
          amountPaidCents: 0,
        },
      ],
      primaryQuote: {
        id: 'q1',
        status: 'accepted',
        totalCents: 8000,
        subtotalCents: 6957,
        lineItems: [],
      },
      revenueAdjustmentsCents: 0,
    });

    assert.equal(resolved.revenueSource, 'approved_quote');
    assert.equal(resolved.jobRevenueCents, 8000);
    assert.equal(resolved.economicRevenueCents, 6957);
  });

  it('cancelled invoice excluded from revenue', () => {
    const resolved = resolveJobRevenue({
      invoices: [
        {
          id: 'inv-void',
          status: 'cancelled',
          totalCents: 50_000,
          subtotalCents: 43_478,
          vatCents: 6522,
          amountPaidCents: 0,
        },
      ],
      primaryQuote: null,
      revenueAdjustmentsCents: 0,
    });

    assert.equal(resolved.invoiceAmountCents, 0);
    assert.equal(resolved.jobRevenueCents, 0);
    assert.equal(isAuthoritativeInvoiceForRevenue('cancelled'), false);
    assert.equal(isAuthoritativeInvoiceForRevenue('sent'), true);
  });

  it('authoritative sent/paid/partial/overdue invoices included', () => {
    for (const status of ['sent', 'paid', 'partial', 'overdue'] as const) {
      assert.equal(isAuthoritativeInvoiceForRevenue(status), true);
    }
  });

  it('credit reduces economic revenue exactly once via adjustment', () => {
    const result = computeJobProfitability(
      baseInput({
        invoices: [
          {
            id: 'inv-1',
            status: 'sent',
            totalCents: 11_500,
            subtotalCents: 10_000,
            vatCents: 1500,
            amountPaidCents: 0,
          },
        ],
        adjustments: [
          {
            id: 'adj-credit',
            kind: 'revenue',
            amountCents: -1000,
            reason: 'Credit note CN-001',
            createdAt: '2026-01-02T00:00:00.000Z',
            createdByUserId: 'u1',
          },
        ],
      }),
    );

    assert.equal(result.summary.economicRevenueCents, 9000);
    assert.equal(result.summary.jobRevenueCents, 10_500);
    assert.equal(result.explainability.revenue.adjustments.length, 1);
  });

  it('refund/reversal payment reduces cash exactly once', () => {
    const collected = sumCashCollectedCents([
      { id: 'p1', amountCents: 10_000, paidAt: '2026-01-01', reference: 'IN', xeroPaymentStatus: 'AUTHORISED' },
      { id: 'p2', amountCents: -1000, paidAt: '2026-01-02', reference: 'REF', xeroPaymentStatus: 'AUTHORISED' },
    ]);

    assert.equal(collected, 9000);
  });

  it('failed and voided Xero payments excluded from cash collected', () => {
    assert.equal(
      isPaymentCountedForCashCollection({ amountCents: 5000, xeroPaymentStatus: 'DELETED' }),
      false,
    );
    assert.equal(
      isPaymentCountedForCashCollection({ amountCents: 5000, xeroPaymentStatus: 'VOIDED' }),
      false,
    );
    assert.equal(
      isPaymentCountedForCashCollection({ amountCents: 5000, xeroPaymentStatus: 'FAILED' }),
      false,
    );
    assert.equal(
      isPaymentCountedForCashCollection({ amountCents: 5000, xeroPaymentStatus: 'AUTHORISED' }),
      true,
    );
    assert.equal(isPaymentCountedForCashCollection({ amountCents: 5000, xeroPaymentStatus: null }), true);
  });

  it('cent precision for labour overtime multipliers', () => {
    const cost = computeLabourCostCents([
      {
        id: 't1',
        userId: 'u1',
        durationMinutes: 7,
        startedAt: '2026-01-01T08:00:00.000Z',
        endedAt: '2026-01-01T08:07:00.000Z',
        approved: true,
        hourlyCostCents: 10_000,
        overtimeMultiplier: 1.5,
      },
    ]);

    assert.equal(cost.labourCostCents, Math.round((7 / 60) * 10_000 * 1.5));
  });

  it('snapshot metadata marks live calculation — never authoritative cache', () => {
    const result = computeJobProfitability(baseInput({ sourceFingerprint: '999' }));
    assert.equal(result.snapshot.isLiveCalculation, true);
    assert.equal(result.snapshot.sourceFingerprint, '999');
    assert.equal(result.snapshot.calculationVersion, 4);
  });
});
