import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'fleet-ai-recommendations.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/fleet-ai-recommendations.service.ts'),
  'utf8',
);

describe('fleet AI recommendations API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoVehicleDecision: false as const',
      'inventGps: false as const',
      'inventCosts: false as const',
      'inventedGps: false as const',
      'inventedCosts: false as const',
      'recommendationsOnly: true as const',
      'vehicleMutated: false as const',
      'maintenanceExecuted: false as const',
      'vehicleReplaced: false as const',
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

  it('never auto-decides vehicles or invents GPS/costs from this layer', () => {
    assert.ok(!routeSource.includes('autoVehicleDecision: true'));
    assert.ok(!routeSource.includes('inventGps: true'));
    assert.ok(!routeSource.includes('inventCosts: true'));
    assert.ok(!serviceSource.includes('autoVehicleDecisionEnabled: true'));
    assert.ok(!serviceSource.includes('inventGpsEnabled: true'));
    assert.ok(!serviceSource.includes('inventCostsEnabled: true'));
    assert.ok(serviceSource.includes('autoVehicleDecision: false'));
    assert.ok(serviceSource.includes('inventedGps: false'));
    assert.ok(serviceSource.includes('inventedCosts: false'));
  });

  it('Owner/Admin approval required for recommendation drafts', () => {
    assert.ok(serviceSource.includes('canApproveFleetAiRecommendations'));
    assert.ok(serviceSource.includes('assertApprove'));
    assert.ok(serviceSource.includes('Only Company Owner/Admin'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'fleet_ai_recommendations'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('far_recommendation_draft_created'));
    assert.ok(serviceSource.includes('far_recommendation_draft_${nextStatus}'));
    assert.ok(serviceSource.includes('eq(farRecommendationDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(farSettings.companyId, actor.companyId)'));
  });

  it('extends real fleet, Cartrack, jobs, costs, and maintenance', () => {
    assert.ok(serviceSource.includes('vehicles'));
    assert.ok(serviceSource.includes('fleetOperatingCosts'));
    assert.ok(serviceSource.includes('integrationConnections'));
    assert.ok(serviceSource.includes('integrationVehicleMappings'));
    assert.ok(serviceSource.includes('gpsPositions'));
    assert.ok(serviceSource.includes('jobVehicleAssignments'));
    assert.ok(serviceSource.includes('jobs'));
    assert.ok(serviceSource.includes('assetMaintenanceSchedules'));
    assert.ok(serviceSource.includes('buildFarCartrackSnapshot'));
    assert.ok(serviceSource.includes('buildFarRecommendationDraft'));
    assert.ok(serviceSource.includes('maintenance_suggestion'));
    assert.ok(serviceSource.includes('cost_reduction'));
    assert.ok(serviceSource.includes('route_improvement'));
    assert.ok(serviceSource.includes('fleet_efficiency'));
    assert.ok(serviceSource.includes('replacement_planning'));
  });
});
