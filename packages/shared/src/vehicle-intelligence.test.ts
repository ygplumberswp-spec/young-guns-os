import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildViCartrackSnapshot,
  buildViCostSnapshot,
  buildViFuelSnapshot,
  buildViInsightDraft,
  buildViMaintenanceSnapshot,
  buildViUsageSnapshot,
  canAccessVehicleIntelligence,
  canApproveVehicleIntelligenceDrafts,
  canManageVehicleIntelligenceSettings,
  canWriteVehicleIntelligence,
  defaultViSettings,
  listViAuraConnections,
  VI_PRODUCT_COPY,
} from './vehicle-intelligence.js';

describe('vehicle intelligence foundation', () => {
  it('RBAC: Technician/Client denied; write needs fleet write; Owner approves', () => {
    assert.equal(
      canAccessVehicleIntelligence({
        roleName: 'Manager',
        permissions: ['fleet:read'],
      }),
      true,
    );
    assert.equal(
      canAccessVehicleIntelligence({
        roleName: 'Technician',
        permissions: ['*', 'fleet:write'],
      }),
      false,
    );
    assert.equal(
      canAccessVehicleIntelligence({
        roleName: 'Client',
        permissions: ['fleet:read'],
      }),
      false,
    );
    assert.equal(
      canWriteVehicleIntelligence({
        roleName: 'Manager',
        permissions: ['fleet:read'],
      }),
      false,
    );
    assert.equal(
      canWriteVehicleIntelligence({
        roleName: 'Manager',
        permissions: ['fleet:write'],
      }),
      true,
    );
    assert.equal(
      canApproveVehicleIntelligenceDrafts({
        roleName: 'Company Owner',
        permissions: ['fleet:write'],
      }),
      true,
    );
    assert.equal(
      canApproveVehicleIntelligenceDrafts({
        roleName: 'Manager',
        permissions: ['fleet:write'],
      }),
      false,
    );
    assert.equal(
      canManageVehicleIntelligenceSettings({
        roleName: 'Company Owner',
        permissions: ['*'],
      }),
      true,
    );
  });

  it('Cartrack/fuel/usage/cost/maintenance stay unavailable without real signals', () => {
    const cartrack = buildViCartrackSnapshot({
      cartrackConnected: false,
      connectionStatus: 'disconnected',
      mappedVehicleCount: 0,
      gpsPositionCount: 0,
      lastSyncAt: null,
    });
    assert.equal(cartrack.availability, 'unavailable');
    assert.ok(/not invented/i.test(cartrack.rationale));

    const fuel = buildViFuelSnapshot({ fuelRecordCount: 0, totalFuelCostCents: 0 });
    assert.equal(fuel.availability, 'unavailable');
    assert.ok(/not invented/i.test(fuel.rationale));

    const usage = buildViUsageSnapshot({
      assignmentCount: 0,
      distinctVehicles: 0,
      distinctJobs: 0,
    });
    assert.equal(usage.availability, 'unavailable');

    const costs = buildViCostSnapshot({ costRecordCount: 0, totalCostCents: 0 });
    assert.equal(costs.availability, 'unavailable');

    const maintenance = buildViMaintenanceSnapshot({
      signalCount: 0,
      vehiclesInMaintenance: 0,
    });
    assert.equal(maintenance.availability, 'unavailable');

    const availableFuel = buildViFuelSnapshot({
      fuelRecordCount: 2,
      totalFuelCostCents: 5000,
    });
    assert.equal(availableFuel.availability, 'available');
    assert.equal(availableFuel.totalFuelCostCents, 5000);
  });

  it('insight drafts are drafts only — never invent tracking or auto-mutate fleet', () => {
    const draft = buildViInsightDraft({
      kind: 'maintenance_need',
      vehicleName: 'Van 1',
      detail: 'Vehicle status is maintenance.',
    });
    assert.equal(draft.kind, 'maintenance_need');
    assert.ok(/draft|Owner approval|not invented/i.test(draft.body));
    assert.ok(!/auto-dispatch|invented GPS/i.test(draft.title));

    const settings = defaultViSettings();
    assert.equal(settings.autoFleetMutationEnabled, false);
    assert.equal(settings.inventTrackingEnabled, false);

    const connections = listViAuraConnections();
    assert.ok(connections.some((c) => c.href === '/fleet'));
    assert.ok(connections.some((c) => c.href === '/fleet-intelligence'));
    assert.ok(VI_PRODUCT_COPY.thisLayer.includes('No fake GPS'));
  });
});
