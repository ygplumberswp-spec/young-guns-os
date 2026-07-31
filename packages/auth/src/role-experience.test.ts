import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNTANT_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  DISPATCHER_ROLE_NAME,
  LEGACY_OWNER_ROLE_NAME,
  MANAGER_ROLE_NAME,
  PLATFORM_OWNER_ROLE_NAME,
  TECHNICIAN_ROLE_NAME,
  hasAgentManagePermission,
} from './permissions.js';
import {
  canAccessOwnerModule,
  canAccessTechnicianMobile,
  getStaffHomePath,
  hasCrossTenantPlatformAccess,
  isCompanyOwnerRole,
  isDispatcherRole,
  isPlatformOwner,
  isPlatformOwnerRole,
  isTechnicianRole,
  resolveStaffExperience,
} from './role-experience.js';

describe('role experience', () => {
  it('identifies Platform Owner with cross-tenant access', () => {
    const owner = {
      roleName: PLATFORM_OWNER_ROLE_NAME,
      permissions: ['*', 'platform:cross_tenant'],
    };
    assert.equal(resolveStaffExperience(owner), 'platform_owner');
    assert.equal(isPlatformOwnerRole(owner), true);
    assert.equal(hasCrossTenantPlatformAccess(owner), true);
    assert.equal(canAccessOwnerModule(owner, ['finance:read']), true);
    assert.equal(getStaffHomePath(owner), '/saas-management');
  });

  it('identifies Company Owner without cross-tenant access', () => {
    const owner = { roleName: COMPANY_OWNER_ROLE_NAME, permissions: ['*'] };
    assert.equal(resolveStaffExperience(owner), 'company_owner');
    assert.equal(isCompanyOwnerRole(owner), true);
    assert.equal(isPlatformOwnerRole(owner), false);
    assert.equal(isPlatformOwner(owner), true); // unrestricted company access alias
    assert.equal(hasCrossTenantPlatformAccess(owner), false);
    assert.equal(getStaffHomePath(owner), '/');
  });

  it('maps legacy Owner to company_owner experience', () => {
    const owner = { roleName: LEGACY_OWNER_ROLE_NAME, permissions: ['*'] };
    assert.equal(resolveStaffExperience(owner), 'company_owner');
    assert.equal(isCompanyOwnerRole(owner), true);
    assert.equal(isPlatformOwnerRole(owner), false);
  });

  it('identifies technician role and home path', () => {
    const technician = {
      roleName: TECHNICIAN_ROLE_NAME,
      permissions: ['mobile:read', 'jobs:read', 'jobs:write'],
    };
    assert.equal(resolveStaffExperience(technician), 'technician');
    assert.equal(isTechnicianRole(technician), true);
    assert.equal(canAccessOwnerModule(technician, ['finance:read']), false);
    assert.equal(canAccessTechnicianMobile(technician), true);
    assert.equal(getStaffHomePath(technician), '/mobile');
  });

  it('blocks technician from owner modules while allowing mobile', () => {
    const technician = {
      roleName: TECHNICIAN_ROLE_NAME,
      permissions: ['mobile:read', 'jobs:read'],
    };
    assert.equal(canAccessOwnerModule(technician, ['customers:read']), false);
    assert.equal(canAccessTechnicianMobile(technician), true);
  });

  it('treats manager as manager experience with permission-scoped access', () => {
    const manager = {
      roleName: MANAGER_ROLE_NAME,
      permissions: ['finance:read', 'customers:read'],
    };
    assert.equal(resolveStaffExperience(manager), 'manager');
    assert.equal(canAccessOwnerModule(manager, ['finance:read']), true);
    assert.equal(canAccessOwnerModule(manager, ['platform:manage']), false);
  });

  it('identifies dispatcher and accountant experiences', () => {
    const dispatcher = {
      roleName: DISPATCHER_ROLE_NAME,
      permissions: ['customers:read', 'jobs:read', 'dispatch:read'],
    };
    assert.equal(resolveStaffExperience(dispatcher), 'dispatcher');
    assert.equal(isDispatcherRole(dispatcher), true);
    assert.equal(getStaffHomePath(dispatcher), '/');

    const accountant = {
      roleName: ACCOUNTANT_ROLE_NAME,
      permissions: ['finance:read', 'finance:write'],
    };
    assert.equal(resolveStaffExperience(accountant), 'accountant');
    assert.equal(getStaffHomePath(accountant), '/finance/invoices');
  });

  it('normalises agent manage permission aliases', () => {
    assert.equal(hasAgentManagePermission(['agents:manage']), true);
    assert.equal(hasAgentManagePermission(['agents:write']), true);
    assert.equal(hasAgentManagePermission(['agents:read']), false);
    assert.equal(hasAgentManagePermission(['*']), true);
  });
});
