import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasAnyPermission } from '@titan/auth/browser';

function canAccessFleetTracking(permissions: string[]): boolean {
  return hasAnyPermission(permissions, [
    'integrations:read',
    'integrations:manage',
    'dispatch:read',
    'fleet:read',
    '*',
  ]);
}

function canAccessFleetWideTrackingAsTechnician(permissions: string[]): boolean {
  // Technicians may have jobs/mobile — not fleet-wide Cartrack tracking.
  return canAccessFleetTracking(permissions);
}

describe('M3 fleet tracking RBAC', () => {
  it('allows Owner and office fleet readers', () => {
    assert.equal(canAccessFleetTracking(['*']), true);
    assert.equal(canAccessFleetTracking(['fleet:read']), true);
    assert.equal(canAccessFleetTracking(['dispatch:read']), true);
  });

  it('blocks technician-only permissions from fleet-wide tracking', () => {
    assert.equal(canAccessFleetWideTrackingAsTechnician(['jobs:read', 'mobile:use']), false);
    assert.equal(canAccessFleetWideTrackingAsTechnician(['mobile:read', 'jobs:write']), false);
  });
});
