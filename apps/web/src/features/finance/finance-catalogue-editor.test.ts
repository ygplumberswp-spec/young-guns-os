import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_FINANCE_CATALOGUE } from '@titan/shared';
import {
  applyCatalogueItemToEditorLine,
  applyManualLineDescription,
  newFinanceEditorLine,
  parseEditorLinesForDraft,
} from './finance-editor-utils.js';

test('catalogue selection auto-fills description, category, qty, unit, price and cost', () => {
  const inventoryItem = {
    sourceKey: 'inventory:abc',
    sourceType: 'inventory' as const,
    itemCode: 'TAP-001',
    name: 'Basin tap',
    shortDescription: 'Chrome basin mixer',
    sellPriceCents: 18500,
    unitCostCents: 12000,
    unit: 'each',
    category: 'materials' as const,
  };
  const line = newFinanceEditorLine();
  const filled = applyCatalogueItemToEditorLine(line, inventoryItem, {
    priceMode: 'excluding_vat',
    vatMode: 'standard',
  });
  assert.equal(filled.description, 'Basin tap');
  assert.equal(filled.category, 'materials');
  assert.equal(filled.quantity, '1');
  assert.equal(filled.unit, 'each');
  assert.equal(filled.unitPrice, '185.00');
  assert.equal(filled.unitCost, '120.00');
  assert.equal(filled.vatRateBps, '1500');
  assert.equal(filled.catalogueSourceKey, 'inventory:abc');
});

test('manual fallback clears catalogue key and keeps typed description', () => {
  const line = applyCatalogueItemToEditorLine(newFinanceEditorLine(), BUILTIN_FINANCE_CATALOGUE[0]!, {
    priceMode: 'excluding_vat',
    vatMode: 'standard',
  });
  const manual = applyManualLineDescription(line, 'Custom pipe fitting');
  assert.equal(manual.description, 'Custom pipe fitting');
  assert.equal(manual.catalogueSourceKey, null);
  assert.equal(manual.isManualLine, true);
});

test('draft round-trip accepts catalogue and manual lines without inventory mutation', () => {
  const catalogueLine = applyCatalogueItemToEditorLine(newFinanceEditorLine(), BUILTIN_FINANCE_CATALOGUE[1]!, {
    priceMode: 'excluding_vat',
    vatMode: 'standard',
  });
  const manualLine = applyManualLineDescription(newFinanceEditorLine(), 'Site-specific adapter');
  manualLine.unitPrice = '50.00';
  const parsed = parseEditorLinesForDraft([catalogueLine, manualLine], { vatMode: 'standard' });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]!.description, 'Standard labour — hourly');
  assert.equal(parsed[1]!.description, 'Site-specific adapter');
});
