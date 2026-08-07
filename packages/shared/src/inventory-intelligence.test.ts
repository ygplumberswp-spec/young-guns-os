import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildInvIntelStockSnapshot,
  buildInvIntelUsageSnapshot,
  buildShortageAlertDraft,
  buildUsageSignalDraft,
  canAccessInventoryIntelligence,
  canApproveInventoryIntelligenceDrafts,
  canManageInventoryIntelligenceSettings,
  canWriteInventoryIntelligence,
  defaultInvIntelSettings,
  INV_INTEL_PRODUCT_COPY,
  listInvIntelAuraConnections,
} from './inventory-intelligence.js';

describe('inventory intelligence foundation', () => {
  it('RBAC: Technician/Client denied; write needs inventory/procurement write; Owner approves', () => {
    assert.equal(
      canAccessInventoryIntelligence({
        roleName: 'Manager',
        permissions: ['inventory:read'],
      }),
      true,
    );
    assert.equal(
      canAccessInventoryIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'inventory:write'],
      }),
      false,
    );
    assert.equal(
      canAccessInventoryIntelligence({
        roleName: 'Client',
        permissions: ['inventory:read'],
      }),
      false,
    );
    assert.equal(
      canWriteInventoryIntelligence({
        roleName: 'Manager',
        permissions: ['inventory:read'],
      }),
      false,
    );
    assert.equal(
      canWriteInventoryIntelligence({
        roleName: 'Manager',
        permissions: ['inventory:write'],
      }),
      true,
    );
    assert.equal(
      canApproveInventoryIntelligenceDrafts({
        roleName: 'Company Owner',
        permissions: ['inventory:write'],
      }),
      true,
    );
    assert.equal(
      canApproveInventoryIntelligenceDrafts({
        roleName: 'Manager',
        permissions: ['inventory:write'],
      }),
      false,
    );
    assert.equal(
      canManageInventoryIntelligenceSettings({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      true,
    );
  });

  it('stock/usage snapshots stay unavailable without real records — never invent levels', () => {
    const emptyStock = buildInvIntelStockSnapshot({
      itemCount: 0,
      locationCount: 0,
      lowStockCount: 0,
      totalUnitsOnHand: 0,
    });
    assert.equal(emptyStock.availability, 'unavailable');
    assert.equal(emptyStock.lowStockCount, 0);
    assert.ok(/not invented/i.test(emptyStock.rationale));

    const emptyUsage = buildInvIntelUsageSnapshot({
      movementCount: 0,
      materialLineCount: 0,
      jobsWithUsage: 0,
    });
    assert.equal(emptyUsage.availability, 'unavailable');
    assert.ok(/not invented/i.test(emptyUsage.rationale));

    const available = buildInvIntelStockSnapshot({
      itemCount: 2,
      locationCount: 1,
      lowStockCount: 1,
      totalUnitsOnHand: 12,
    });
    assert.equal(available.availability, 'available');
    assert.equal(available.lowStockCount, 1);
  });

  it('alert and usage drafts are drafts only — never auto-reorder language as execution', () => {
    const alert = buildShortageAlertDraft({
      sku: 'PIPE-20',
      name: '20mm pipe',
      quantityOnHand: 0,
      reorderLevel: 5,
      locationName: 'Main warehouse',
    });
    assert.equal(alert.kind, 'zero_stock');
    assert.ok(/draft|not a purchase order|Owner approval/i.test(alert.body));

    const usage = buildUsageSignalDraft({
      kind: 'net_consumption',
      sku: 'PIPE-20',
      name: '20mm pipe',
      netQuantityDelta: -8,
      movementCount: 3,
      windowDays: 30,
      jobId: null,
    });
    assert.ok(/not an auto-reorder|real ledger/i.test(usage.body));

    const settings = defaultInvIntelSettings();
    assert.equal(settings.autoReorderEnabled, false);
    assert.equal(settings.autoStockMutationEnabled, false);
    assert.ok(INV_INTEL_PRODUCT_COPY.thisLayer.includes('No fake stock'));
    assert.ok(listInvIntelAuraConnections().some((c) => c.target === 'procurement'));
  });
});
