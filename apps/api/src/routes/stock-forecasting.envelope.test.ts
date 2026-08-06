import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'stock-forecasting.ts'), 'utf8');
const serviceSource = readFileSync(join(here, '../services/stock-forecasting.service.ts'), 'utf8');

describe('stock forecasting API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoReorder: false as const',
      'autoPurchase: false as const',
      'inventedDemand: false as const',
      'purchaseOrderCreated: false as const',
      'fakeStock: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + inventory/procurement permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('inventory:read'));
    assert.ok(routeSource.includes('inventory:write'));
    assert.ok(routeSource.includes('procurement:read'));
    assert.ok(routeSource.includes('procurement:write'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-reorders or auto-purchases', () => {
    assert.ok(!routeSource.includes('autoReorder: true'));
    assert.ok(!routeSource.includes('autoPurchase: true'));
    assert.ok(!serviceSource.includes('autoReorder: true'));
    assert.ok(!serviceSource.includes('autoPurchase: true'));
    assert.ok(serviceSource.includes('autoReorder: false'));
    assert.ok(serviceSource.includes('autoPurchase: false'));
  });

  it('Owner approval required for reorder recommendations', () => {
    assert.ok(serviceSource.includes('canApproveStockForecasting'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'stock_forecasting'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('sf_recommendation_approved'));
    assert.ok(serviceSource.includes('eq(sfReorderRecommendations.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(sfItemForecasts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(sfSettings.companyId, actor.companyId)'));
  });

  it('extends inventory movements, procurement intel, and maintenance signals', () => {
    assert.ok(serviceSource.includes('inventoryStockMovements'));
    assert.ok(serviceSource.includes('iiAlertDrafts'));
    assert.ok(serviceSource.includes('piPurchaseRecommendations'));
    assert.ok(serviceSource.includes('opsRecurringMaintenancePlans'));
    assert.ok(serviceSource.includes('supplierProducts'));
    assert.ok(serviceSource.includes('computeAvgDailyDemand'));
    assert.ok(serviceSource.includes('computeSeasonalDemand'));
    assert.ok(serviceSource.includes('createDraftPurchaseOrder'));
    assert.ok(serviceSource.includes('createPurchaseOrder'));
  });
});
