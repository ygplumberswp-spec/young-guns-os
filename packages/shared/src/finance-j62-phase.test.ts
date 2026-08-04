import test from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicateCatalogueSelectionWarning,
  financeCatalogueItemFromInventory,
  formatFinanceCatalogueSourceLabel,
  searchFinanceCatalogueItems,
  FINANCE_CATALOGUE_DATA_SOURCES,
} from './finance-catalogue.js';

test('catalogue search keeps duplicate inventory items visible in results', () => {
  const labour = financeCatalogueItemFromInventory({
    id: 'lab-1',
    sku: 'LAB-HOURLY',
    name: 'Standard labour — hourly',
    description: 'Qualified plumber labour per hour',
    unit: 'hour',
    sellPriceCents: 65000,
  });
  const results = searchFinanceCatalogueItems('labour', [labour]);
  assert.ok(results.some((row) => row.sourceKey === 'inventory:lab-1'));
});

test('duplicateCatalogueSelectionWarning is advisory and never blocks', () => {
  const warning = duplicateCatalogueSelectionWarning('inventory:lab-1', ['inventory:lab-1'], 'Standard labour — hourly');
  assert.match(warning ?? '', /already on the document/i);
  assert.equal(duplicateCatalogueSelectionWarning('inventory:lab-1', []), null);
});

test('catalogue sources are tenant inventory only until YGP-001 pricebook exists', () => {
  const inventory = financeCatalogueItemFromInventory({
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
  assert.equal(FINANCE_CATALOGUE_DATA_SOURCES.inventoryTable, 'inventory_items');
  assert.equal(FINANCE_CATALOGUE_DATA_SOURCES.pricebookTable, null);
});

test('formatFinanceCatalogueSourceLabel identifies result type', () => {
  assert.equal(formatFinanceCatalogueSourceLabel('inventory'), 'Inventory');
  assert.equal(formatFinanceCatalogueSourceLabel('labour'), 'Young Guns labour');
  assert.equal(formatFinanceCatalogueSourceLabel('service'), 'Young Guns service');
});
