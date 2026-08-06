import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasAnyPermission } from '@titan/auth/browser';
import { canAccessFinance, canViewFinanceProfit } from '../finance/utils';

function canManageJobs(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['jobs:write']);
}

/**
 * M2 Job 360 role boundaries for office Job File surfaces.
 * Customer portal uses separate routes; technicians use mobile workspace.
 */
describe('Job 360 RBAC boundaries', () => {
  it('Owner can manage jobs and view finance', () => {
    const permissions = ['*'];
    assert.equal(canManageJobs(permissions), true);
    assert.equal(canAccessFinance(permissions), true);
    assert.equal(canViewFinanceProfit(permissions, 'Company Owner'), true);
  });

  it('Office Staff with jobs write can edit job notes but needs finance perm for ledger', () => {
    const office = ['jobs:read', 'jobs:write', 'crm:read'];
    assert.equal(canManageJobs(office), true);
    assert.equal(canAccessFinance(office), false);
  });

  it('Technician without finance cannot see payment ledger or margins', () => {
    const tech = ['jobs:read', 'mobile:use'];
    assert.equal(canManageJobs(tech), false);
    assert.equal(canAccessFinance(tech), false);
    assert.equal(canViewFinanceProfit(tech, 'Technician'), false);
  });

  it('Customer portal permissions do not unlock office Job 360 finance', () => {
    const customer = ['portal.jobs:read', 'portal.documents:read'];
    assert.equal(canManageJobs(customer), false);
    assert.equal(canAccessFinance(customer), false);
  });
});
