import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_FINANCE_CATALOGUE,
  duplicateCatalogueSelectionWarning,
  formatFinanceCatalogueSourceLabel,
  inventoryItemToFinanceCatalogue,
  searchFinanceCatalogueItems,
} from './finance-catalogue.js';

test('catalogue search keeps duplicate items visible in results', () => {
  const labour = BUILTIN_FINANCE_CATALOGUE.find((row) => row.itemCode === 'LAB-HOURLY');
  assert.ok(labour);
  const results = searchFinanceCatalogueItems('labour', BUILTIN_FINANCE_CATALOGUE);
  assert.ok(results.some((row) => row.sourceKey === labour!.sourceKey));
});

test('duplicateCatalogueSelectionWarning is advisory and never blocks', () => {
  const warning = duplicateCatalogueSelectionWarning('builtin:LAB-HOURLY', ['builtin:LAB-HOURLY'], 'Standard labour — hourly');
  assert.match(warning ?? '', /already on the document/i);
  assert.equal(duplicateCatalogueSelectionWarning('builtin:LAB-HOURLY', []), null);
});

test('catalogue sources are inventory or approved Young Guns pricebook only', () => {
  for (const item of BUILTIN_FINANCE_CATALOGUE) {
    assert.ok(item.sourceKey.startsWith('builtin:'));
    assert.ok(item.sourceType === 'labour' || item.sourceType === 'service');
    assert.ok(item.itemCode.length > 0);
    assert.ok(item.name.length > 0);
  }
  const inventory = inventoryItemToFinanceCatalogue({
    id: 'real-item',
    sku: 'YG-001',
    name: 'Tenant copper pipe',
    description: 'Real stock item',
    unit: 'm',
    unitCostCents: 1000,
    sellPriceCents: 1500,
  });
  assert.equal(inventory.sourceType, 'inventory');
  assert.equal(inventory.sourceKey, 'inventory:real-item');
});

test('formatFinanceCatalogueSourceLabel identifies result type', () => {
  assert.equal(formatFinanceCatalogueSourceLabel('inventory'), 'Inventory');
  assert.equal(formatFinanceCatalogueSourceLabel('labour'), 'Young Guns labour');
  assert.equal(formatFinanceCatalogueSourceLabel('service'), 'Young Guns service');
});
