import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMaterialSourceBreakdown,
  computeJobGrossProfitCents,
  computeMaterialsVarianceCents,
  materialLineCostCents,
  sumMaterialLinesCents,
  sumQuoteCategoryCents,
  sumReturnedMaterialCents,
} from './job-costing.js';

describe('job costing aggregation', () => {
  it('sums quote line costs by category excluding optional lines', () => {
    const total = sumQuoteCategoryCents(
      [
        {
          category: 'materials',
          lineCostCents: 5000,
          lineSubtotalCents: 6000,
          isOptional: false,
        },
        {
          category: 'materials',
          lineCostCents: 2000,
          lineSubtotalCents: 2500,
          isOptional: true,
        },
        {
          category: 'labour',
          lineCostCents: 8000,
          lineSubtotalCents: 10000,
          isOptional: false,
        },
      ],
      'materials',
    );
    assert.equal(total, 5000);
  });

  it('uses fulfilled quantity for partially fulfilled material lines', () => {
    const cost = materialLineCostCents({
      status: 'partially_fulfilled',
      quantity: '10',
      fulfilledQuantity: '4',
      unitCostCents: 250,
      materialSource: 'vehicle_stock',
    });
    assert.equal(cost, 1000);
  });

  it('aggregates used material cost and source breakdown', () => {
    const lines = [
      {
        status: 'used',
        quantity: '2',
        fulfilledQuantity: '2',
        unitCostCents: 1000,
        materialSource: 'vehicle_stock',
      },
      {
        status: 'used',
        quantity: '1',
        fulfilledQuantity: '1',
        unitCostCents: 500,
        materialSource: 'supplier_purchase',
      },
      {
        status: 'requested',
        quantity: '5',
        fulfilledQuantity: null,
        unitCostCents: 100,
        materialSource: 'warehouse_stock',
      },
    ];
    assert.equal(sumMaterialLinesCents(lines), 2500);
    assert.deepEqual(buildMaterialSourceBreakdown(lines), {
      vehicleStock: 2000,
      warehouseStock: 0,
      supplierPurchase: 500,
      customerSupplied: 0,
      other: 0,
    });
  });

  it('tracks returned material value separately', () => {
    const returned = sumReturnedMaterialCents([
      {
        status: 'returned',
        quantity: '3',
        fulfilledQuantity: '3',
        unitCostCents: 200,
        materialSource: 'warehouse_stock',
      },
    ]);
    assert.equal(returned, 600);
  });

  it('nets in-place partial returns on the same STOCK line', () => {
    const line = {
      status: 'used',
      quantity: '10',
      fulfilledQuantity: '10',
      returnedQuantity: '3',
      unitCostCents: 100,
      materialSource: 'vehicle_stock',
    };
    assert.equal(materialLineCostCents(line), 700);
    assert.equal(sumReturnedMaterialCents([line]), 300);
  });

  it('computes gross profit from paid revenue when available', () => {
    assert.equal(
      computeJobGrossProfitCents({
        paidCents: 10000,
        invoicedCents: 12000,
        actualCostCents: 4500,
        includeProfit: true,
      }),
      5500,
    );
    assert.equal(
      computeJobGrossProfitCents({
        paidCents: 0,
        invoicedCents: 12000,
        actualCostCents: 4500,
        includeProfit: true,
      }),
      7500,
    );
    assert.equal(
      computeJobGrossProfitCents({
        paidCents: 10000,
        invoicedCents: 12000,
        actualCostCents: 4500,
        includeProfit: false,
      }),
      null,
    );
  });

  it('computes materials variance against quoted baseline', () => {
    assert.equal(computeMaterialsVarianceCents(5000, 6200), 1200);
    assert.equal(computeMaterialsVarianceCents(0, 6200), null);
  });
});
