import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STOCK_VARIANCE_REVIEW_LABEL,
  directPurchaseEvidenceOk,
  isDirectPurchaseMaterialSource,
  isStockMaterialSource,
  materialChargeableQuantity,
  materialFlowSourceFor,
  materialPathConflict,
  materialReturnedQuantity,
  resolveJobMaterialSource,
  stockVarianceReviewRequired,
  technicianMaySeeMaterialField,
} from './strict-inventory-material-flow.js';

describe('strict inventory material flow', () => {
  it('maps STOCK vs DIRECT PURCHASE sources', () => {
    assert.equal(isStockMaterialSource('vehicle_stock'), true);
    assert.equal(isStockMaterialSource('warehouse_stock'), true);
    assert.equal(isDirectPurchaseMaterialSource('supplier_purchase'), true);
    assert.equal(materialFlowSourceFor('vehicle_stock'), 'STOCK');
    assert.equal(materialFlowSourceFor('supplier_purchase'), 'DIRECT_PURCHASE');
    assert.equal(materialFlowSourceFor('customer_supplied'), null);
    assert.equal(resolveJobMaterialSource({ flowSource: 'STOCK', stockLocationKind: 'warehouse' }), 'warehouse_stock');
    assert.equal(resolveJobMaterialSource({ flowSource: 'DIRECT_PURCHASE' }), 'supplier_purchase');
  });

  it('charges only fulfilled minus returned', () => {
    assert.equal(
      materialChargeableQuantity({
        quantity: '10',
        fulfilledQuantity: '10',
        returnedQuantity: '3',
        status: 'used',
      }),
      7,
    );
    assert.equal(
      materialChargeableQuantity({
        quantity: '3',
        fulfilledQuantity: '3',
        returnedQuantity: '3',
        status: 'returned',
      }),
      0,
    );
    assert.equal(
      materialReturnedQuantity({
        quantity: '10',
        fulfilledQuantity: '10',
        returnedQuantity: '3',
        status: 'used',
      }),
      3,
    );
  });

  it('requires slip or supplier reference for direct purchase', () => {
    assert.equal(directPurchaseEvidenceOk({ supplierReference: 'SLIP-1' }), true);
    assert.equal(directPurchaseEvidenceOk({ receiptDocumentationId: 'doc-1' }), true);
    assert.equal(directPurchaseEvidenceOk({}), false);
  });

  it('blocks double-count paths', () => {
    assert.match(
      materialPathConflict({
        materialSource: 'vehicle_stock',
        hasStockMovementIssue: true,
        hasMaterialLineDirectCost: true,
      }) ?? '',
      /STOCK/,
    );
    assert.match(
      materialPathConflict({
        materialSource: 'supplier_purchase',
        hasStockMovementIssue: true,
        hasMaterialLineDirectCost: true,
      }) ?? '',
      /DIRECT/,
    );
    assert.equal(
      materialPathConflict({
        materialSource: 'vehicle_stock',
        hasStockMovementIssue: true,
        hasMaterialLineDirectCost: false,
      }),
      null,
    );
  });

  it('flags stock variance when use exceeds on-hand', () => {
    assert.equal(stockVarianceReviewRequired({ requestedQuantity: 3, availableQuantity: 1 }), true);
    assert.equal(stockVarianceReviewRequired({ requestedQuantity: 1, availableQuantity: 1 }), false);
    assert.equal(STOCK_VARIANCE_REVIEW_LABEL.includes('STOCK VARIANCE'), true);
  });

  it('hides valuation/margin fields from technicians', () => {
    assert.equal(technicianMaySeeMaterialField('description'), true);
    assert.equal(technicianMaySeeMaterialField('flowSource'), true);
    assert.equal(technicianMaySeeMaterialField('unitCost'), false);
    assert.equal(technicianMaySeeMaterialField('margin'), false);
    assert.equal(technicianMaySeeMaterialField('inventoryValuation'), false);
  });
});
