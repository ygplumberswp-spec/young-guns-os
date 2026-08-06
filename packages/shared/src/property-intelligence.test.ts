import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPriDocumentSnapshot,
  buildPriEquipmentSnapshot,
  buildPriInsightDraft,
  buildPriMapsSnapshot,
  buildPriWorkSnapshot,
  canAccessPropertyIntelligence,
  canApprovePropertyIntelligenceDrafts,
  canManagePropertyIntelligenceSettings,
  canWritePropertyIntelligence,
  defaultPriSettings,
  formatPriAddress,
  listPriAuraConnections,
  PRI_PRODUCT_COPY,
  PROPERTY_INTELLIGENCE_KEY,
} from './property-intelligence.js';

describe('property intelligence foundation', () => {
  it('module key is stable', () => {
    assert.equal(PROPERTY_INTELLIGENCE_KEY, 'property-intelligence');
  });

  it('RBAC: Technician/Client denied; write needs customers/ops write; Owner approves', () => {
    assert.equal(
      canAccessPropertyIntelligence({
        roleName: 'Manager',
        permissions: ['customers:read'],
      }),
      true,
    );
    assert.equal(
      canAccessPropertyIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'customers:write'],
      }),
      false,
    );
    assert.equal(
      canAccessPropertyIntelligence({
        roleName: 'Client',
        permissions: ['customers:read'],
      }),
      false,
    );
    assert.equal(
      canWritePropertyIntelligence({
        roleName: 'Manager',
        permissions: ['customers:read'],
      }),
      false,
    );
    assert.equal(
      canWritePropertyIntelligence({
        roleName: 'Manager',
        permissions: ['customers:write'],
      }),
      true,
    );
    assert.equal(
      canApprovePropertyIntelligenceDrafts({
        roleName: 'Company Owner',
        permissions: ['customers:write'],
      }),
      true,
    );
    assert.equal(
      canApprovePropertyIntelligenceDrafts({
        roleName: 'Manager',
        permissions: ['customers:write'],
      }),
      false,
    );
    assert.equal(
      canManagePropertyIntelligenceSettings({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      true,
    );
  });

  it('maps/equipment/docs/work stay unavailable without real signals', () => {
    const maps = buildPriMapsSnapshot({
      googleMapsConnected: false,
      connectionStatus: 'disconnected',
      propertiesWithCoordinates: 0,
      propertiesWithoutCoordinates: 2,
      lastSyncAt: null,
    });
    assert.equal(maps.availability, 'unavailable');
    assert.ok(/not invented/i.test(maps.rationale));

    const equipment = buildPriEquipmentSnapshot({ equipmentCount: 0, geyserCount: 0 });
    assert.equal(equipment.availability, 'unavailable');

    const docs = buildPriDocumentSnapshot({ cocCount: 0, photoCount: 0 });
    assert.equal(docs.availability, 'unavailable');

    const work = buildPriWorkSnapshot({
      jobCount: 0,
      maintenancePlanCount: 0,
      maintenanceRunCount: 0,
    });
    assert.equal(work.availability, 'unavailable');

    const availableMaps = buildPriMapsSnapshot({
      googleMapsConnected: true,
      connectionStatus: 'connected',
      propertiesWithCoordinates: 3,
      propertiesWithoutCoordinates: 1,
      lastSyncAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(availableMaps.availability, 'available');
    assert.equal(availableMaps.propertiesWithCoordinates, 3);
  });

  it('insight drafts are drafts only — never invent properties or auto-send', () => {
    const draft = buildPriInsightDraft({
      kind: 'maintenance_opportunity',
      propertyName: '12 Oak St',
      detail: 'Geyser plan overdue from real recurring maintenance row.',
    });
    assert.equal(draft.kind, 'maintenance_opportunity');
    assert.ok(draft.title.includes('12 Oak St'));
    assert.ok(/Owner approval/i.test(draft.body));
    assert.ok(/not invented/i.test(draft.body));
    assert.ok(/Does not auto-send/i.test(draft.body));
  });

  it('settings invariants lock auto-send and invent flags', () => {
    const settings = defaultPriSettings({ insightDraftsEnabled: true });
    assert.equal(settings.autoSendEnabled, false);
    assert.equal(settings.inventPropertiesEnabled, false);
    assert.equal(settings.insightDraftsEnabled, true);
  });

  it('aura connections include CRM, Customer 360 coexistence, jobs, docs, maintenance', () => {
    const connections = listPriAuraConnections();
    const hrefs = connections.map((c) => c.href);
    assert.ok(hrefs.includes('/crm'));
    assert.ok(hrefs.includes('/customer-360-intelligence'));
    assert.ok(hrefs.includes('/jobs'));
    assert.ok(hrefs.includes('/documents'));
    assert.ok(hrefs.includes('/recurring-maintenance'));
    assert.ok(PRI_PRODUCT_COPY.thisLayer.includes('Property Intelligence'));
  });

  it('formatPriAddress prefers formattedAddress then composed parts', () => {
    assert.equal(
      formatPriAddress({ formattedAddress: '1 Main Rd, Cape Town' }),
      '1 Main Rd, Cape Town',
    );
    assert.equal(
      formatPriAddress({
        unitNumber: '2',
        addressLine1: 'Main Rd',
        city: 'Cape Town',
      }),
      'Unit 2, Main Rd, Cape Town',
    );
    assert.equal(formatPriAddress({}), null);
  });
});
