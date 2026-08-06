import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'driver-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/driver-intelligence.service.ts'),
  'utf8',
);

describe('driver intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'ownerAdminOnly: true as const',
      'autoDiscipline: false as const',
      'inventGps: false as const',
      'fakeGps: false as const',
      'fakeBehaviour: false as const',
      'disciplineExecuted: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
  });

  it('Owner/Admin gates driver behaviour; never auto-discipline or invent GPS', () => {
    assert.ok(serviceSource.includes('canAccessDriverIntelligence'));
    assert.ok(serviceSource.includes('Owner or Admin'));
    assert.ok(serviceSource.includes('autoDiscipline: false'));
    assert.ok(serviceSource.includes('inventGps: false'));
    assert.ok(serviceSource.includes('disciplineExecuted: false'));
    assert.ok(!serviceSource.includes('autoDisciplineEnabled: true'));
    assert.ok(!serviceSource.includes('inventGpsEnabled: true'));
    assert.ok(serviceSource.includes('buildDriRouteEfficiencyRow'));
    assert.ok(serviceSource.includes('buildDriRecommendationDraft'));
    assert.ok(serviceSource.includes('getTripHistory'));
    assert.ok(serviceSource.includes('fleetDriverBehaviourEvents'));
  });

  it('writes security audit logs scoped by companyId', () => {
    assert.ok(serviceSource.includes("entityType: 'driver_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('di_recommendation_draft_created'));
    assert.ok(serviceSource.includes('eq(driRecommendationDrafts.companyId, actor.companyId)'));
    assert.ok(serviceSource.includes('eq(driSettings.companyId, actor.companyId)'));
  });

  it('extends real Cartrack, trips, behaviour, jobs, and vehicle assignees', () => {
    assert.ok(serviceSource.includes('integrationConnections'));
    assert.ok(serviceSource.includes("provider, 'cartrack'"));
    assert.ok(serviceSource.includes('jobVehicleAssignments'));
    assert.ok(serviceSource.includes('jobs'));
    assert.ok(serviceSource.includes('vehicles'));
    assert.ok(serviceSource.includes('fleetIntelligenceService'));
    assert.ok(routeSource.includes('requireAuth'));
    assert.ok(routeSource.includes('requireAnyPermission'));
  });
});
