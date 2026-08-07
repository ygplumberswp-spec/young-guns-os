import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'inventory-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/inventory-intelligence.service.ts'),
  'utf8',
);

describe('inventory intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoReorder: false as const',
      'autoStockMutation: false as const',
      'inventedStock: false as const',
      'fakeStock: false as const',
      'purchaseOrderCreated: false as const',
      'inventedUsage: false as const',
      'invented: false as const',
      'ownerControlled: true as const',
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

  it('never auto-reorders or mutates stock from this layer', () => {
    assert.ok(!routeSource.includes('autoReorder: true'));
    assert.ok(!routeSource.includes('autoStockMutation: true'));
    assert.ok(!serviceSource.includes('autoReorderEnabled: true'));
    assert.ok(!serviceSource.includes('autoStockMutationEnabled: true'));
    assert.ok(serviceSource.includes('autoReorder: false'));
    assert.ok(serviceSource.includes('autoStockMutation: false'));
    assert.ok(serviceSource.includes('purchaseOrderCreated: false'));
  });

  it('Owner approval required for alert drafts', () => {
    assert.ok(serviceSource.includes('canApproveInventoryIntelligenceDrafts'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'inventory_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('ii_alert_draft_${nextStatus}'));
    assert.ok(serviceSource.includes('ii_alert_draft_created'));
    assert.ok(serviceSource.includes('eq(iiAlertDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(iiUsageSignals.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(iiSettings.companyId, actor.companyId)'));
  });

  it('extends real inventory, movements, job materials, suppliers, and POs', () => {
    assert.ok(serviceSource.includes('inventoryItems'));
    assert.ok(serviceSource.includes('inventoryStockLevels'));
    assert.ok(serviceSource.includes('inventoryStockMovements'));
    assert.ok(serviceSource.includes('jobMaterialLines'));
    assert.ok(serviceSource.includes('suppliers'));
    assert.ok(serviceSource.includes('purchaseOrders'));
    assert.ok(serviceSource.includes('buildInvIntelStockSnapshot'));
    assert.ok(serviceSource.includes('buildShortageAlertDraft'));
  });
});
