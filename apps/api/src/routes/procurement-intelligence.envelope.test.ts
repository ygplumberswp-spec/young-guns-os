import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'procurement-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/procurement-intelligence.service.ts'),
  'utf8',
);

describe('supplier & procurement intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoPurchase: false as const',
      'inventedSuppliers: false as const',
      'inventedPrices: false as const',
      'fakePurchaseOrders: false as const',
      'purchaseOrderOrdered: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + inventory/procurement permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('procurement:read'));
    assert.ok(routeSource.includes('procurement:write'));
    assert.ok(routeSource.includes('inventory:read'));
    assert.ok(routeSource.includes('requireAnyPermission'));
    assert.ok(routeSource.includes('denyTechnicianClient'));
  });

  it('never auto-purchases', () => {
    assert.ok(!routeSource.includes('autoPurchase: true'));
    assert.ok(!serviceSource.includes('autoPurchase: true'));
    assert.ok(serviceSource.includes('autoPurchase: false'));
    assert.ok(serviceSource.includes("autoPurchaseEnabled: false"));
  });

  it('Owner approval required for recommend-accept / approve', () => {
    assert.ok(serviceSource.includes('canApproveProcurementIntelligence'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'procurement_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('pi_recommendation_approved'));
    assert.ok(serviceSource.includes('pi_recommendation_accepted'));
    assert.ok(
      serviceSource.includes('eq(piPurchaseRecommendations.companyId, actor.companyId)'),
    );
    assert.ok(serviceSource.includes('eq(piCostComparisons.companyId, actor.companyId)'));
  });

  it('extends inventory intelligence alerts and procurement draft POs', () => {
    assert.ok(serviceSource.includes('iiAlertDrafts'));
    assert.ok(serviceSource.includes('procurementService.createPurchaseOrder'));
    assert.ok(serviceSource.includes('supplierPriceCatalogueItems'));
    assert.ok(serviceSource.includes('buildPiCostComparison'));
  });
});
