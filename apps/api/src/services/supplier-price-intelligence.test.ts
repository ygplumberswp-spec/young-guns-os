import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySupplierPriceDedup } from '@titan/shared';

test('SPI dedup never marks price change as duplicate without review', () => {
  const result = classifySupplierPriceDedup({
    line: {
      description: '15mm Copper Pipe',
      supplierCode: 'ABC-100',
      unitCostCents: 9999,
    },
    candidates: [
      {
        id: 'cat-1',
        canonicalCode: 'ABC-100',
        description: '15mm Copper Pipe',
        normalizedDescription: '15mm copper pipe',
        unit: 'm',
        packSize: null,
        unitCostCents: 4500,
        version: 1,
      },
    ],
  });

  assert.notEqual(result.verdict, 'duplicate');
  assert.equal(result.requiresReview, true);
});
