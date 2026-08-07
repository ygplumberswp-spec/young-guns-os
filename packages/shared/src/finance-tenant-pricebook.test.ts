import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YOUNG_GUNS_REFERENCE_COMPANY_ID,
  YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK,
  filterFinanceCatalogueCostFields,
  isYoungGunsFinanceTenant,
  resolveYoungGunsPricebookForTenant,
  sanitizeFinanceDocumentWriteRequest,
  stripUnauthorizedFinanceLineCosts,
  canViewFinanceProfit,
} from './finance-tenant-pricebook.js';
import { financeCatalogueItemFromInventory } from './finance-catalogue.js';

const TENANT_B = '22222222-2222-4222-8222-222222222222';

test('tenant B is not treated as Young Guns finance tenant', () => {
  assert.equal(isYoungGunsFinanceTenant(TENANT_B, { slug: 'acme-plumbing', name: 'Acme Plumbing' }), false);
});

test('verified Young Guns tenant resolves approved pricebook constants', () => {
  const rows = resolveYoungGunsPricebookForTenant(YOUNG_GUNS_REFERENCE_COMPANY_ID, {
    slug: 'young-guns-plumbing',
    name: 'Young Guns Plumbing',
  });
  assert.ok(rows.some((row) => row.itemCode === 'LAB-CALLOUT'));
  assert.ok(rows.some((row) => row.itemCode === 'LAB-HOURLY'));
  assert.equal(rows.length, YOUNG_GUNS_APPROVED_FINANCE_PRICEBOOK.length);
});

test('tenant B receives empty Young Guns pricebook merge', () => {
  const rows = resolveYoungGunsPricebookForTenant(TENANT_B, {
    slug: 'acme-plumbing',
    name: 'Acme Plumbing',
  });
  assert.equal(rows.length, 0);
  assert.equal(rows.some((row) => row.itemCode === 'LAB-CALLOUT'), false);
  assert.equal(rows.some((row) => row.itemCode === 'LAB-HOURLY'), false);
});

test('filterFinanceCatalogueCostFields removes unitCostCents when unauthorized', () => {
  const item = financeCatalogueItemFromInventory({
    id: 'inv-1',
    sku: 'PVC-110',
    name: 'PVC pipe',
    description: null,
    unitCostCents: 4500,
    sellPriceCents: 7500,
  });
  const filtered = filterFinanceCatalogueCostFields([item], false);
  assert.equal(filtered[0]?.unitCostCents, null);
  assert.equal(filtered[0]?.sellPriceCents, 7500);
});

test('canViewFinanceProfit authorises owners and blocks technicians', () => {
  assert.equal(canViewFinanceProfit(['finance:read'], 'Company Owner'), true);
  // SEC-001: mis-elevated finance:write must not grant Technician profit visibility.
  assert.equal(canViewFinanceProfit(['finance:write'], 'Technician'), false);
  assert.equal(canViewFinanceProfit(['*'], 'Technician'), false);
  assert.equal(canViewFinanceProfit(['finance:write'], 'Client'), false);
  assert.equal(canViewFinanceProfit(['finance:read'], 'Technician'), false);
});

test('stripUnauthorizedFinanceLineCosts removes unitCostCents from write payloads', () => {
  const lines = [{ description: 'Labour', unitPriceCents: 10000, unitCostCents: 4500 }];
  const stripped = stripUnauthorizedFinanceLineCosts(lines, false);
  assert.equal(stripped?.[0]?.unitCostCents, undefined);
  const kept = stripUnauthorizedFinanceLineCosts(lines, true);
  assert.equal(kept?.[0]?.unitCostCents, 4500);
});

test('sanitizeFinanceDocumentWriteRequest strips line costs when unauthorized', () => {
  const sanitized = sanitizeFinanceDocumentWriteRequest(
    {
      customerId: 'cust-1',
      lineItems: [{ description: 'Part', unitPriceCents: 5000, unitCostCents: 1200 }],
    },
    false,
  );
  assert.equal(sanitized.lineItems?.[0]?.unitCostCents, undefined);
});
