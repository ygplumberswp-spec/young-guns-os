import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectUsedCatalogueSourceKeys,
  duplicateCatalogueSelectionWarning,
  financeCatalogueItemFromInventory,
  inventoryItemToFinanceCatalogue,
  isCatalogueSourceKeyUsed,
  searchFinanceCatalogueItems,
  buildCatalogueLineAutoFill,
  FINANCE_CATALOGUE_DATA_SOURCES,
} from './finance-catalogue.js';

const sampleInventory = financeCatalogueItemFromInventory({
  id: 'item-1',
  sku: 'PVC-110',
  name: 'PVC pipe 110mm',
  description: 'Pressure pipe for drainage runs',
  unit: 'm',
  unitCostCents: 4500,
  sellPriceCents: 7500,
});

test('searchFinanceCatalogueItems matches code, name and description on inventory rows', () => {
  const results = searchFinanceCatalogueItems('pvc', [sampleInventory]);
  assert.ok(results.some((row) => row.itemCode === 'PVC-110'));
});

test('searchFinanceCatalogueItems returns duplicate inventory keys when already on document', () => {
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

test('inventory items map to materials category with sell and cost cents', () => {
  const mapped = inventoryItemToFinanceCatalogue({
    id: 'abc',
    sku: 'TAP-001',
    name: 'Basin tap',
    description: 'Chrome basin mixer',
    unit: 'each',
    unitCostCents: 12000,
    sellPriceCents: 18500,
  });
  assert.equal(mapped.category, 'materials');
  assert.equal(mapped.sourceKey, 'inventory:abc');
  assert.equal(mapped.sellPriceCents, 18500);
  assert.equal(mapped.unitCostCents, 12000);
});

test('collectUsedCatalogueSourceKeys and duplicate guard', () => {
  const used = collectUsedCatalogueSourceKeys([
    { catalogueSourceKey: 'inventory:1' },
    { catalogueSourceKey: null },
    { catalogueSourceKey: 'inventory:lab-1' },
  ]);
  assert.deepEqual(used, ['inventory:1', 'inventory:lab-1']);
  assert.equal(isCatalogueSourceKeyUsed('inventory:1', used), true);
  assert.equal(isCatalogueSourceKeyUsed('inventory:2', used), false);
});

test('buildCatalogueLineAutoFill returns document-only defaults', () => {
  const item = financeCatalogueItemFromInventory({
    id: 'lab-1',
    sku: 'LAB-HOURLY',
    name: 'Standard labour — hourly',
    unit: 'hour',
    sellPriceCents: 65000,
  });
  const patch = buildCatalogueLineAutoFill(item, 1500);
  assert.equal(patch.quantity, '1');
  assert.equal(patch.unit, 'hour');
  assert.equal(patch.unitPriceCents, 65000);
});

test('catalogue data sources document inventory-only search until YGP-001', () => {
  assert.equal(FINANCE_CATALOGUE_DATA_SOURCES.inventoryTable, 'inventory_items');
  assert.equal(FINANCE_CATALOGUE_DATA_SOURCES.pricebookTable, null);
  assert.match(FINANCE_CATALOGUE_DATA_SOURCES.pricebookStatus, /YGP-001/);
});

test('duplicateCatalogueSelectionWarning is advisory only', () => {
  const warning = duplicateCatalogueSelectionWarning('inventory:1', ['inventory:1'], 'Basin tap');
  assert.match(warning ?? '', /already on the document/i);
});
