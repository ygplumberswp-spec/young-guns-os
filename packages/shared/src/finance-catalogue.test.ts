import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_FINANCE_CATALOGUE,
  collectUsedCatalogueSourceKeys,
  inventoryItemToFinanceCatalogue,
  isCatalogueSourceKeyUsed,
  searchFinanceCatalogueItems,
  buildCatalogueLineAutoFill,
} from './finance-catalogue.js';

test('searchFinanceCatalogueItems matches code, name and description', () => {
  const inventory = inventoryItemToFinanceCatalogue({
    id: 'item-1',
    sku: 'PVC-110',
    name: 'PVC pipe 110mm',
    description: 'Pressure pipe for drainage runs',
    unit: 'm',
    unitCostCents: 4500,
    sellPriceCents: 7500,
  });
  const results = searchFinanceCatalogueItems('pvc', [...BUILTIN_FINANCE_CATALOGUE, inventory]);
  assert.ok(results.some((row) => row.itemCode === 'PVC-110'));
});

test('searchFinanceCatalogueItems returns duplicate catalogue keys when already on document', () => {
  const labour = BUILTIN_FINANCE_CATALOGUE.find((row) => row.itemCode === 'LAB-HOURLY');
  assert.ok(labour);
  const results = searchFinanceCatalogueItems('labour', BUILTIN_FINANCE_CATALOGUE);
  assert.ok(results.some((row) => row.sourceKey === labour!.sourceKey));
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
    { catalogueSourceKey: 'builtin:LAB-HOURLY' },
  ]);
  assert.deepEqual(used, ['inventory:1', 'builtin:LAB-HOURLY']);
  assert.equal(isCatalogueSourceKeyUsed('inventory:1', used), true);
  assert.equal(isCatalogueSourceKeyUsed('inventory:2', used), false);
});

test('buildCatalogueLineAutoFill returns document-only defaults', () => {
  const item = BUILTIN_FINANCE_CATALOGUE.find((row) => row.itemCode === 'LAB-HOURLY');
  assert.ok(item);
  const patch = buildCatalogueLineAutoFill(item!, 1500);
  assert.equal(patch.quantity, '1');
  assert.equal(patch.unit, 'hour');
  assert.equal(patch.category, 'labour');
  assert.equal(patch.unitPriceCents, 65000);
});
