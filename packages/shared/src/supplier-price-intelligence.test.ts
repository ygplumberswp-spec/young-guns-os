import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySupplierPriceDedup,
  normalizeSupplierPriceDescription,
} from './supplier-price-intelligence.js';

describe('normalizeSupplierPriceDescription', () => {
  it('lowercases and collapses whitespace', () => {
    assert.equal(normalizeSupplierPriceDescription('  15mm   COPPER  '), '15mm copper');
  });
});

describe('classifySupplierPriceDedup', () => {
  const candidates = [
    {
      id: 'cat-1',
      canonicalCode: 'ABC-100',
      description: '15mm Copper Pipe',
      normalizedDescription: '15mm copper pipe',
      unit: 'm',
      packSize: '6m',
      unitCostCents: 4500,
      version: 1,
    },
  ];

  it('marks exact code+description match as duplicate', () => {
    const result = classifySupplierPriceDedup({
      line: {
        description: '15mm Copper Pipe',
        supplierCode: 'ABC-100',
        unit: 'm',
        packSize: '6m',
        unitCostCents: 4500,
      },
      candidates,
    });

    assert.equal(result.verdict, 'duplicate');
    assert.equal(result.matchedCatalogueItemId, 'cat-1');
    assert.equal(result.requiresReview, false);
  });

  it('routes price changes to review without silent overwrite', () => {
    const result = classifySupplierPriceDedup({
      line: {
        description: '15mm Copper Pipe',
        supplierCode: 'ABC-100',
        unitCostCents: 5200,
      },
      candidates,
    });

    assert.equal(result.verdict, 'variant');
    assert.equal(result.requiresReview, true);
    assert.ok(result.reasons.includes('price_change'));
  });

  it('classifies unknown lines as new', () => {
    const result = classifySupplierPriceDedup({
      line: {
        description: 'Unique Widget XL',
        unitCostCents: 1000,
      },
      candidates,
    });

    assert.equal(result.verdict, 'new');
    assert.equal(result.requiresReview, false);
  });
});
