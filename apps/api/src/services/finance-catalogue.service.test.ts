import test from 'node:test';
import assert from 'node:assert/strict';
import { financeCatalogueItemFromInventory, searchFinanceCatalogueItems, YOUNG_GUNS_REFERENCE_COMPANY_ID } from '@titan/shared';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FinanceService } from './finance.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const financeServiceSource = readFileSync(join(repoRoot, 'apps/api/src/services/finance.service.ts'), 'utf8');
const financeRouteSource = readFileSync(join(repoRoot, 'apps/api/src/routes/finance.ts'), 'utf8');

function createCatalogueSearchDb(
  inventoryRows: Array<{
    id: string;
    sku: string;
    name: string;
    description: string | null;
    unit: string;
    unitCostCents: number;
    sellPriceCents: number;
  }>,
  company?: { id: string; slug?: string | null; name?: string | null } | null,
) {
  return {
    query: {
      inventoryItems: {
        findMany: async ({ where }: { where: unknown }) => {
          void where;
          return inventoryRows.map((row) => ({
            ...row,
            companyId: company?.id ?? TENANT_A,
            status: 'active' as const,
            reorderLevel: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
        },
      },
      companies: {
        findFirst: async () =>
          company
            ? {
                id: company.id,
                slug: company.slug ?? null,
                name: company.name ?? null,
              }
            : null,
      },
    },
  } as unknown as ConstructorParameters<typeof FinanceService>[0];
}

function createEmptyCatalogueSearchDb(companyId = TENANT_B) {
  return createCatalogueSearchDb([], { id: companyId, slug: 'acme-plumbing', name: 'Acme Plumbing' });
}

test('finance catalogue search returns tenant inventory rows only', async () => {
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
  const results = await service.searchCatalogueItems(TENANT_A, 'PVC');
  assert.ok(results.some((row) => row.itemCode === 'PVC-110'));
  assert.ok(results.every((row) => row.sourceKey.startsWith('inventory:')));
});

test('finance catalogue search does not merge hardcoded pricebook items globally', () => {
  assert.doesNotMatch(financeServiceSource, /BUILTIN_FINANCE_CATALOGUE/);
  assert.match(financeServiceSource, /resolveYoungGunsPricebookForTenant/);
});

test('finance catalogue search returns duplicate inventory items for repeat use', async () => {
  const db = createCatalogueSearchDb([
    {
      id: 'lab-1',
      sku: 'LAB-HOURLY',
      name: 'Standard labour — hourly',
      description: 'Qualified plumber labour per hour',
      unit: 'hour',
      unitCostCents: 0,
      sellPriceCents: 65000,
    },
  ]);
  const service = new FinanceService(db);
  const results = await service.searchCatalogueItems(TENANT_A, 'labour');
  assert.ok(results.some((row) => row.sourceKey === 'inventory:lab-1'));
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
  ], { id: TENANT_A, slug: 'tenant-a', name: 'Tenant A' });
  const dbB = createEmptyCatalogueSearchDb(TENANT_B);
  const serviceA = new FinanceService(dbA);
  const serviceB = new FinanceService(dbB);
  const resultsA = await serviceA.searchCatalogueItems(TENANT_A, 'TENANT-A-ONLY');
  const resultsB = await serviceB.searchCatalogueItems(TENANT_B, 'TENANT-A-ONLY');
  assert.ok(resultsA.some((row) => row.itemCode === 'TENANT-A-ONLY'));
  assert.equal(resultsB.some((row) => row.itemCode === 'TENANT-A-ONLY'), false);
});

test('tenant B cannot search or receive Young Guns pricebook entries', async () => {
  const dbB = createEmptyCatalogueSearchDb(TENANT_B);
  const serviceB = new FinanceService(dbB);

  for (const query of ['LAB-CALLOUT', 'LAB-HOURLY', 'callout', 'hourly labour']) {
    const results = await serviceB.searchCatalogueItems(TENANT_B, query);
    assert.equal(
      results.some((row) => row.itemCode === 'LAB-CALLOUT' || row.itemCode === 'LAB-HOURLY'),
      false,
      `tenant B must not receive YG pricebook for query "${query}"`,
    );
    assert.ok(results.every((row) => !row.sourceKey.startsWith('pricebook:')));
  }
});

test('verified Young Guns tenant receives approved pricebook rows when inventory is empty', async () => {
  const db = createEmptyCatalogueSearchDb(YOUNG_GUNS_REFERENCE_COMPANY_ID);
  const service = new FinanceService({
    ...db,
    query: {
      ...db.query,
      companies: {
        findFirst: async () => ({
          id: YOUNG_GUNS_REFERENCE_COMPANY_ID,
          slug: 'young-guns-plumbing',
          name: 'Young Guns Plumbing',
        }),
      },
    },
  } as unknown as ConstructorParameters<typeof FinanceService>[0]);

  const results = await service.searchCatalogueItems(YOUNG_GUNS_REFERENCE_COMPANY_ID, 'LAB-CALLOUT');
  assert.ok(results.some((row) => row.itemCode === 'LAB-CALLOUT' && row.sourceKey.startsWith('pricebook:')));
});

test('catalogue search strips unitCostCents unless includeCost is authorised', async () => {
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
  ], { id: TENANT_A, slug: 'tenant-a', name: 'Tenant A' });
  const service = new FinanceService(db);
  const authorised = await service.searchCatalogueItems(TENANT_A, 'PVC', { includeCost: true });
  const restricted = await service.searchCatalogueItems(TENANT_A, 'PVC', { includeCost: false });
  assert.equal(authorised[0]?.unitCostCents, 4500);
  assert.equal(restricted[0]?.unitCostCents, null);
});

test('finance catalogue route passes includeCost from canViewFinanceProfit', () => {
  assert.match(financeRouteSource, /searchCatalogueItems\(companyId, q, \{\s*includeCost: canViewFinanceProfit/);
});

test('finance catalogue search limits results to twelve items', () => {
  const inventory = Array.from({ length: 20 }, (_, index) =>
    financeCatalogueItemFromInventory({
      id: String(index),
      sku: `SKU-${index}`,
      name: `Matching item ${index}`,
      description: 'labour spare part',
      sellPriceCents: 1000,
      unitCostCents: 500,
    }),
  );
  const results = searchFinanceCatalogueItems('Matching', inventory, { limit: 12 });
  assert.equal(results.length, 12);
});

test('shared catalogue search ranks code matches ahead of description matches', () => {
  const exact = financeCatalogueItemFromInventory({
    id: '1',
    sku: 'LAB-HOURLY',
    name: 'Hourly labour',
    description: 'misc',
    sellPriceCents: 65000,
  });
  const fuzzy = financeCatalogueItemFromInventory({
    id: '2',
    sku: 'LAB-TEST',
    name: 'Misc fitting',
    description: 'labour spare part',
    sellPriceCents: 1000,
    unitCostCents: 500,
  });
  const results = searchFinanceCatalogueItems('LAB-HOURLY', [exact, fuzzy]);
  assert.equal(results[0]?.itemCode, 'LAB-HOURLY');
});

test('createQuote path does not mutate inventory master records', () => {
  const createQuoteBlock = financeServiceSource.match(/async createQuote[\s\S]*?(?=\n  async createInvoice)/)?.[0] ?? '';
  assert.ok(createQuoteBlock.length > 0, 'createQuote block not found');
  assert.doesNotMatch(createQuoteBlock, /inventoryItems\.(update|insert|delete)\(|deductStock|stockMovement/i);
});

test('searchCatalogueItems reads inventory rows without mutating them', () => {
  const searchBlock = financeServiceSource.match(/async searchCatalogueItems[\s\S]*?(?=\n  async buildAuraContext)/)?.[0] ?? '';
  assert.ok(searchBlock.length > 0, 'searchCatalogueItems block not found');
  assert.match(searchBlock, /query\.inventoryItems\.findMany/);
  assert.doesNotMatch(searchBlock, /inventoryItems\.(update|insert|delete)\(/);
});
