import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDriBehaviourSnapshot,
  buildDriCartrackSnapshot,
  buildDriRecommendationDraft,
  buildDriRouteEfficiencyRow,
  buildDriTripSnapshot,
  buildDriUsageSnapshot,
  canAccessDriverIntelligence,
  canManageDriverIntelligenceSettings,
  canWriteDriverIntelligence,
  computeIdleRatio,
  defaultDriSettings,
  DRI_PRODUCT_COPY,
  listDriAuraConnections,
} from './driver-intelligence.js';

describe('driver intelligence foundation', () => {
  it('RBAC: Owner/Admin only; Technician/Client denied', () => {
    assert.equal(
      canAccessDriverIntelligence({ roleName: 'Company Owner', permissions: ['fleet:read'] }),
      true,
    );
    assert.equal(canAccessDriverIntelligence({ roleName: 'Admin', permissions: [] }), true);
    assert.equal(
      canAccessDriverIntelligence({
        roleName: 'Manager',
        permissions: ['fleet:write', 'fleet_intelligence:write'],
      }),
      false,
    );
    assert.equal(
      canAccessDriverIntelligence({ roleName: 'Technician', permissions: ['*', 'fleet:write'] }),
      false,
    );
    assert.equal(
      canAccessDriverIntelligence({ roleName: 'Client', permissions: ['fleet:read'] }),
      false,
    );
    assert.equal(
      canAccessDriverIntelligence({ roleName: 'Manager', permissions: ['*'] }),
      true,
    );
    assert.equal(
      canWriteDriverIntelligence({ roleName: 'Platform Owner', permissions: [] }),
      true,
    );
    assert.equal(
      canManageDriverIntelligenceSettings({ roleName: 'Owner', permissions: [] }),
      true,
    );
  });

  it('Cartrack/trips/behaviour/usage stay unavailable without real signals', () => {
    const cartrack = buildDriCartrackSnapshot({
      cartrackConnected: false,
      connectionStatus: null,
      mappedVehicleCount: 0,
      gpsPositionCount: 0,
      lastSyncAt: null,
    });
    assert.equal(cartrack.availability, 'unavailable');
    assert.match(cartrack.rationale, /not invented/i);

    assert.equal(buildDriTripSnapshot({ tripCount: 0, totalDistanceKm: 0 }).availability, 'unavailable');
    assert.equal(
      buildDriBehaviourSnapshot({ eventCount: 0, distinctDrivers: 0 }).availability,
      'unavailable',
    );
    assert.equal(
      buildDriUsageSnapshot({
        assignmentCount: 0,
        distinctDrivers: 0,
        distinctVehicles: 0,
      }).availability,
      'unavailable',
    );
  });

  it('route efficiency and recommendations never imply auto-discipline', () => {
    assert.equal(computeIdleRatio(45, 55), 0.45);
    const idleHeavy = buildDriRouteEfficiencyRow({
      driverUserId: 'u1',
      driverName: 'Alex',
      vehicleId: 'v1',
      vehicleName: 'Van 1',
      tripCount: 3,
      totalDistanceKm: 40,
      totalDrivingMinutes: 40,
      totalIdleMinutes: 60,
    });
    assert.equal(idleHeavy.efficiencyLabel, 'idle_heavy');
    assert.match(idleHeavy.rationale, /not a disciplinary/i);

    const draft = buildDriRecommendationDraft({
      kind: 'risk_pattern',
      driverName: 'Alex',
      detail: 'Repeated speeding events on real GPS-derived behaviour rows.',
    });
    assert.match(draft.body, /Does not auto-discipline/i);
    assert.match(draft.title, /Risk pattern/);

    const settings = defaultDriSettings();
    assert.equal(settings.autoDisciplineEnabled, false);
    assert.equal(settings.inventGpsEnabled, false);
    assert.match(DRI_PRODUCT_COPY.thisLayer, /Never auto-discipline/);
    assert.ok(listDriAuraConnections().some((c) => c.target === 'fleet_intelligence'));
  });
});
