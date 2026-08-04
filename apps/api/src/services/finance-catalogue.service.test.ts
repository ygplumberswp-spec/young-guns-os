import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_FINANCE_CATALOGUE, searchFinanceCatalogueItems } from '@titan/shared';
import { FinanceService } from './finance.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';

function createCatalogueSearchDb(inventoryRows: Array<{
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  unitCostCents: number;
  sellPriceCents: number;
}>) {
  return {
    query: {
      inventoryItems: {
        findMany: async ({ where }: { where: unknown }) => {
          void where;
          return inventoryRows.map((row) => ({
            ...row,
            companyId: TENANT_A,
            status: 'active' as const,
            reorderLevel: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
        },
      },
    },
  } as unknown as ConstructorParameters<typeof FinanceService>[0];
}

test('finance catalogue search merges inventory and built-in labour/service items', async () => {
  const db = createCatalogueSearchDb([
    {
      id: 'inv-1',
      sku: 'PVC-110',
      name: 'PVC pipe 110mm',
      description: 'Drainage pipe',
      unit: 'm',
      unitCostCents: 4500,
      sellPriceCents: 7500,
    },
  ]);
  const service = new FinanceService(db);
  const results = await service.searchCatalogueItems(TENANT_A, 'geyser');
  assert.ok(results.some((row) => row.itemCode === 'SRV-GEYSER-INSTALL'));
});

test('finance catalogue search excludes duplicate source keys', async () => {
  const db = createCatalogueSearchDb([]);
  const service = new FinanceService(db);
  const hourly = BUILTIN_FINANCE_CATALOGUE.find((row) => row.itemCode === 'LAB-HOURLY');
  assert.ok(hourly);
  const results = await service.searchCatalogueItems(TENANT_A, 'labour', [hourly!.sourceKey]);
  assert.equal(results.some((row) => row.sourceKey === hourly!.sourceKey), false);
});

test('shared catalogue search ranks code matches ahead of description matches', () => {
  const inventory = {
    sourceKey: 'inventory:1',
    sourceType: 'inventory' as const,
    itemCode: 'LAB-TEST',
    name: 'Misc fitting',
    shortDescription: 'labour spare part',
    sellPriceCents: 1000,
    unitCostCents: 500,
    unit: 'each',
    category: 'materials' as const,
  };
  const results = searchFinanceCatalogueItems('LAB-HOURLY', [...BUILTIN_FINANCE_CATALOGUE, inventory]);
  assert.equal(results[0]?.itemCode, 'LAB-HOURLY');
});
