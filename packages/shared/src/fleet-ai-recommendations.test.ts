import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFarCartrackSnapshot,
  buildFarCostSnapshot,
  buildFarEfficiencySnapshot,
  buildFarMaintenanceSnapshot,
  buildFarRecommendationDraft,
  buildFarUsageSnapshot,
  canAccessFleetAiRecommendations,
  canApproveFleetAiRecommendations,
  canManageFleetAiRecommendationsSettings,
  canWriteFleetAiRecommendations,
  defaultFarSettings,
  FAR_PRODUCT_COPY,
  listFarAuraConnections,
} from './fleet-ai-recommendations.js';

describe('fleet AI recommendations', () => {
  it('RBAC: Technician/Client denied; write needs fleet write; Owner/Admin approves', () => {
    assert.equal(
      canAccessFleetAiRecommendations({ roleName: 'Manager', permissions: ['fleet:read'] }),
      true,
    );
    assert.equal(
      canAccessFleetAiRecommendations({ roleName: 'Technician', permissions: ['*', 'fleet:write'] }),
      false,
    );
    assert.equal(
      canAccessFleetAiRecommendations({ roleName: 'Client', permissions: ['fleet:read'] }),
      false,
    );
    assert.equal(
      canAccessFleetAiRecommendations({ roleName: 'Admin', permissions: [] }),
      true,
    );
    assert.equal(
      canWriteFleetAiRecommendations({ roleName: 'Manager', permissions: ['fleet:read'] }),
      false,
    );
    assert.equal(
      canWriteFleetAiRecommendations({ roleName: 'Manager', permissions: ['fleet:write'] }),
      true,
    );
    assert.equal(
      canApproveFleetAiRecommendations({ roleName: 'Company Owner', permissions: ['fleet:write'] }),
      true,
    );
    assert.equal(
      canApproveFleetAiRecommendations({ roleName: 'Admin', permissions: ['fleet:write'] }),
      true,
    );
    assert.equal(
      canApproveFleetAiRecommendations({ roleName: 'Manager', permissions: ['fleet:write'] }),
      false,
    );
    assert.equal(
      canManageFleetAiRecommendationsSettings({ roleName: 'Company Owner', permissions: ['*'] }),
      true,
    );
  });

  it('Cartrack/cost/usage/maintenance/efficiency stay unavailable without real signals', () => {
    const cartrack = buildFarCartrackSnapshot({
      cartrackConnected: false,
      connectionStatus: 'disconnected',
      mappedVehicleCount: 0,
      gpsPositionCount: 0,
      lastSyncAt: null,
    });
    assert.equal(cartrack.availability, 'unavailable');
    assert.ok(/not invented/i.test(cartrack.rationale));

    const costs = buildFarCostSnapshot({ costRecordCount: 0, totalCostCents: 0 });
    assert.equal(costs.availability, 'unavailable');

    const usage = buildFarUsageSnapshot({
      assignmentCount: 0,
      distinctVehicles: 0,
      distinctJobs: 0,
    });
    assert.equal(usage.availability, 'unavailable');

    const maintenance = buildFarMaintenanceSnapshot({
      signalCount: 0,
      vehiclesInMaintenance: 0,
    });
    assert.equal(maintenance.availability, 'unavailable');

    const efficiency = buildFarEfficiencySnapshot({
      vehicleCount: 0,
      mappedVehicleCount: 0,
      assignedVehicleCount: 0,
    });
    assert.equal(efficiency.availability, 'unavailable');

    const availableCosts = buildFarCostSnapshot({ costRecordCount: 3, totalCostCents: 12000 });
    assert.equal(availableCosts.availability, 'available');
    assert.equal(availableCosts.totalCostCents, 12000);
  });

  it('recommendation drafts are drafts only — never invent GPS/costs or auto-decide', () => {
    const draft = buildFarRecommendationDraft({
      kind: 'maintenance_suggestion',
      vehicleName: 'Van 1',
      detail: 'Vehicle status is maintenance.',
    });
    assert.equal(draft.kind, 'maintenance_suggestion');
    assert.ok(/draft|Owner\/Admin approval|not invented/i.test(draft.body));

    const settings = defaultFarSettings();
    assert.equal(settings.autoVehicleDecisionEnabled, false);
    assert.equal(settings.inventGpsEnabled, false);
    assert.equal(settings.inventCostsEnabled, false);

    const connections = listFarAuraConnections();
    assert.ok(connections.some((c) => c.href === '/fleet'));
    assert.ok(connections.some((c) => c.href === '/vehicle-intelligence'));
    assert.ok(FAR_PRODUCT_COPY.thisLayer.includes('Recommendations only'));
  });
});
