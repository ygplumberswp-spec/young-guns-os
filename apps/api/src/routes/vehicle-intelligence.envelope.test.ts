import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'vehicle-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/vehicle-intelligence.service.ts'),
  'utf8',
);

describe('vehicle intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoFleetMutation: false as const',
      'inventTracking: false as const',
      'inventedGps: false as const',
      'inventedFuel: false as const',
      'fakeTracking: false as const',
      'fleetMutated: false as const',
      'invented: false as const',
      'ownerControlled: true as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('requires auth + fleet permissions', () => {
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('fleet:read'));
    assert.ok(routeSource.includes('fleet:write'));
    assert.ok(routeSource.includes('fleet_intelligence:read'));
    assert.ok(routeSource.includes('fleet_intelligence:write'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });

  it('never auto-mutates fleet or invents tracking from this layer', () => {
    assert.ok(!routeSource.includes('autoFleetMutation: true'));
    assert.ok(!routeSource.includes('inventTracking: true'));
    assert.ok(!serviceSource.includes('autoFleetMutationEnabled: true'));
    assert.ok(!serviceSource.includes('inventTrackingEnabled: true'));
    assert.ok(serviceSource.includes('autoFleetMutation: false'));
    assert.ok(serviceSource.includes('inventedTracking: false'));
  });

  it('Owner approval required for insight drafts', () => {
    assert.ok(serviceSource.includes('canApproveVehicleIntelligenceDrafts'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'vehicle_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('vi_insight_draft_${nextStatus}'));
    assert.ok(serviceSource.includes('vi_insight_draft_created'));
    assert.ok(serviceSource.includes('eq(viInsightDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(viSettings.companyId, actor.companyId)'));
  });

  it('extends real fleet, Cartrack, jobs, technicians, and costs', () => {
    assert.ok(serviceSource.includes('vehicles'));
    assert.ok(serviceSource.includes('fleetOperatingCosts'));
    assert.ok(serviceSource.includes('integrationConnections'));
    assert.ok(serviceSource.includes('integrationVehicleMappings'));
    assert.ok(serviceSource.includes('gpsPositions'));
    assert.ok(serviceSource.includes('jobVehicleAssignments'));
    assert.ok(serviceSource.includes('jobs'));
    assert.ok(serviceSource.includes('assetMaintenanceSchedules'));
    assert.ok(serviceSource.includes('buildViCartrackSnapshot'));
    assert.ok(serviceSource.includes('buildViInsightDraft'));
  });
});
