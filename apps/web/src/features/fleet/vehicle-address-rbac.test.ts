import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canReadVehicleTracking } from './VehicleTrackedPositionPanel';

/**
 * The readable vehicle address is shown only where the caller may already read the
 * Cartrack tracking context. This mirrors the permissions on
 * `GET /integrations/cartrack/tracking` — the server stays the gate; this check only
 * stops unauthorised roles polling it.
 */
describe('vehicle position address RBAC', () => {
  it('allows Owner, integrations readers and dispatchers', () => {
    assert.equal(canReadVehicleTracking(['*']), true);
    assert.equal(canReadVehicleTracking(['integrations:read']), true);
    assert.equal(canReadVehicleTracking(['integrations:manage']), true);
    assert.equal(canReadVehicleTracking(['dispatch:read']), true);
  });

  it('denies technician-only permissions a fleet-wide vehicle address view', () => {
    assert.equal(canReadVehicleTracking(['jobs:read', 'mobile:use']), false);
    assert.equal(canReadVehicleTracking(['mobile:read', 'jobs:write']), false);
    assert.equal(canReadVehicleTracking(['fleet:read']), false);
  });

  it('denies client portal and marketing entirely', () => {
    assert.equal(canReadVehicleTracking(['portal:read']), false);
    assert.equal(canReadVehicleTracking(['marketing:read', 'marketing:write']), false);
    assert.equal(canReadVehicleTracking([]), false);
  });
});
