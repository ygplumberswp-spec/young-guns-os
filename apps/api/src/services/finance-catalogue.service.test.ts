import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_FINANCE_CATALOGUE, searchFinanceCatalogueItems } from '@titan/shared';
import { FinanceService } from './finance.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

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

function createEmptyCatalogueSearchDb() {
  return {
    query: {
      inventoryItems: {
        findMany: async () => [],
      },
    },
  } as unknown as ConstructorParameters<typeof FinanceService>[0];
}

test('finance catalogue search merges tenant inventory and Young Guns pricebook items', async () => {
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
  assert.ok(results.some((row) => row.sourceType === 'service'));
});

test('finance catalogue search returns duplicate pricebook items for repeat use', async () => {
  const db = createEmptyCatalogueSearchDb();
  const service = new FinanceService(db);
  const hourly = BUILTIN_FINANCE_CATALOGUE.find((row) => row.itemCode === 'LAB-HOURLY');
  assert.ok(hourly);
  const results = await service.searchCatalogueItems(TENANT_A, 'labour');
  assert.ok(results.some((row) => row.sourceKey === hourly!.sourceKey));
});

test('tenant B search does not return tenant A inventory rows', async () => {
  const dbA = createCatalogueSearchDb([
    {
      id: 'inv-a-only',
      sku: 'TENANT-A-ONLY',
      name: 'Tenant A exclusive fitting',
      description: 'Must not leak to tenant B',
      unit: 'each',
      unitCostCents: 1000,
      sellPriceCents: 2000,
    },
  ]);
  const dbB = createEmptyCatalogueSearchDb();
  const serviceA = new FinanceService(dbA);
  const serviceB = new FinanceService(dbB);
  const resultsA = await serviceA.searchCatalogueItems(TENANT_A, 'TENANT-A-ONLY');
  const resultsB = await serviceB.searchCatalogueItems(TENANT_B, 'TENANT-A-ONLY');
  assert.ok(resultsA.some((row) => row.itemCode === 'TENANT-A-ONLY'));
  assert.equal(resultsB.some((row) => row.itemCode === 'TENANT-A-ONLY'), false);
});

test('finance catalogue search limits results to twelve items', () => {
  const inventory = Array.from({ length: 20 }, (_, index) => ({
    sourceKey: `inventory:${index}`,
    sourceType: 'inventory' as const,
    itemCode: `SKU-${index}`,
    name: `Matching item ${index}`,
    shortDescription: 'labour spare part',
    sellPriceCents: 1000,
    unitCostCents: 500,
    unit: 'each',
    category: 'materials' as const,
  }));
  const results = searchFinanceCatalogueItems('Matching', [...BUILTIN_FINANCE_CATALOGUE, ...inventory], {
    limit: 12,
  });
  assert.equal(results.length, 12);
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
