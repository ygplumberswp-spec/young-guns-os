import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OWNER_ROLE_NAME, TECHNICIAN_ROLE_NAME, DISPATCHER_ROLE_NAME } from './permissions.js';
import {
  canAccessOwnerModule,
  canAccessTechnicianMobile,
  getStaffHomePath,
  isDispatcherRole,
  isPlatformOwner,
  isTechnicianRole,
  resolveStaffExperience,
} from './role-experience.js';
import { hasAgentManagePermission } from './permissions.js';

describe('role experience', () => {
  it('identifies platform owner with unrestricted access', () => {
    const owner = { roleName: OWNER_ROLE_NAME, permissions: ['*'] };
    assert.equal(resolveStaffExperience(owner), 'platform_owner');
    assert.equal(isPlatformOwner(owner), true);
    assert.equal(canAccessOwnerModule(owner, ['finance:read']), true);
    assert.equal(getStaffHomePath(owner), '/');
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
    const technician = { roleName: TECHNICIAN_ROLE_NAME, permissions: ['mobile:read', 'jobs:read'] };
    assert.equal(canAccessOwnerModule(technician, ['customers:read']), false);
    assert.equal(canAccessTechnicianMobile(technician), true);
  });

  it('treats admin as staff with permission-scoped access', () => {
    const admin = { roleName: 'Admin', permissions: ['finance:read', 'customers:read'] };
    assert.equal(resolveStaffExperience(admin), 'staff');
    assert.equal(canAccessOwnerModule(admin, ['finance:read']), true);
    assert.equal(canAccessOwnerModule(admin, ['platform:manage']), false);
  });

  it('identifies dispatcher experience', () => {
    const dispatcher = {
      roleName: DISPATCHER_ROLE_NAME,
      permissions: ['customers:read', 'jobs:read', 'dispatch:read'],
    };
    assert.equal(resolveStaffExperience(dispatcher), 'dispatcher');
    assert.equal(isDispatcherRole(dispatcher), true);
    assert.equal(getStaffHomePath(dispatcher), '/');
  });

  it('normalises agent manage permission aliases', () => {
    assert.equal(hasAgentManagePermission(['agents:manage']), true);
    assert.equal(hasAgentManagePermission(['agents:write']), true);
    assert.equal(hasAgentManagePermission(['agents:read']), false);
    assert.equal(hasAgentManagePermission(['*']), true);
  });
});
