import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNTANT_PERMISSIONS,
  ACCOUNTANT_ROLE_NAME,
  ADMIN_PERMISSIONS,
  canAccessOwnerModule,
  canAccessTenant,
  canAssignRoleName,
  CLIENT_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  DEFAULT_TEAM_ROLES,
  DISPATCHER_PERMISSIONS,
  DISPATCHER_ROLE_NAME,
  getStaffHomePath,
  hasCrossTenantPlatformAccess,
  hasPermission,
  hasUnrestrictedCompanyAccess,
  isAssignableRoleName,
  isCompanyOwnerRole,
  isLegacyRoleName,
  isPlatformOwnerRole,
  isTechnicianRole,
  LEGACY_ADMIN_ROLE_NAME,
  LEGACY_MEMBER_ROLE_NAME,
  LEGACY_OWNER_ROLE_NAME,
  LEGACY_ROLE_ALIASES,
  MANAGER_PERMISSIONS,
  MANAGER_ROLE_NAME,
  MEMBER_PERMISSIONS,
  PENDING_USER_MAPPING_DECISIONS,
  PLATFORM_CROSS_TENANT_PERMISSION,
  PLATFORM_OWNER_ROLE_NAME,
  resolveCanonicalRoleName,
  resolveStaffExperience,
  ROLE_MATRIX,
  TECHNICIAN_PERMISSIONS,
  TECHNICIAN_ROLE_NAME,
} from './rbac-matrix.js';

describe('RBAC matrix — canonical roles', () => {
  it('defines all seven canonical roles in the matrix', () => {
    const names = new Set(ROLE_MATRIX.map((role) => role.name));
    for (const required of [
      PLATFORM_OWNER_ROLE_NAME,
      COMPANY_OWNER_ROLE_NAME,
      MANAGER_ROLE_NAME,
      DISPATCHER_ROLE_NAME,
      ACCOUNTANT_ROLE_NAME,
      TECHNICIAN_ROLE_NAME,
      CLIENT_ROLE_NAME,
    ]) {
      assert.equal(names.has(required), true, `missing ${required}`);
    }
  });

  it('seeds company roles including legacy compatibility roles', () => {
    const seeded = new Set(DEFAULT_TEAM_ROLES.map((role) => role.name));
    assert.equal(seeded.has(COMPANY_OWNER_ROLE_NAME), true);
    assert.equal(seeded.has(PLATFORM_OWNER_ROLE_NAME), true);
    assert.equal(seeded.has(MANAGER_ROLE_NAME), true);
    assert.equal(seeded.has(ACCOUNTANT_ROLE_NAME), true);
    assert.equal(seeded.has(LEGACY_OWNER_ROLE_NAME), true);
    assert.equal(seeded.has(LEGACY_ADMIN_ROLE_NAME), true);
    assert.equal(seeded.has(LEGACY_MEMBER_ROLE_NAME), true);
    assert.equal(seeded.has(CLIENT_ROLE_NAME), false);
  });

  it('does not silently alias Member', () => {
    assert.equal(LEGACY_ROLE_ALIASES[LEGACY_OWNER_ROLE_NAME], COMPANY_OWNER_ROLE_NAME);
    assert.equal(LEGACY_ROLE_ALIASES[LEGACY_ADMIN_ROLE_NAME], MANAGER_ROLE_NAME);
    assert.equal(
      Object.prototype.hasOwnProperty.call(LEGACY_ROLE_ALIASES, LEGACY_MEMBER_ROLE_NAME),
      false,
    );
    assert.equal(resolveCanonicalRoleName(LEGACY_MEMBER_ROLE_NAME), LEGACY_MEMBER_ROLE_NAME);
    assert.ok(PENDING_USER_MAPPING_DECISIONS.some((item) => item.from === LEGACY_MEMBER_ROLE_NAME));
  });
});

describe('RBAC matrix — access boundaries', () => {
  it('allows Platform Owner cross-tenant and blocks Company Owner', () => {
    const platform = {
      roleName: PLATFORM_OWNER_ROLE_NAME,
      permissions: ['*', PLATFORM_CROSS_TENANT_PERMISSION],
      companyId: 'tenant-a',
    };
    const companyOwner = {
      roleName: COMPANY_OWNER_ROLE_NAME,
      permissions: ['*'],
      companyId: 'tenant-a',
    };

    assert.equal(hasCrossTenantPlatformAccess(platform), true);
    assert.equal(canAccessTenant(platform, 'tenant-b'), true);
    assert.equal(hasCrossTenantPlatformAccess(companyOwner), false);
    assert.equal(canAccessTenant(companyOwner, 'tenant-b'), false);
    assert.equal(canAccessTenant(companyOwner, 'tenant-a'), true);
  });

  it('treats legacy Owner as Company Owner, not Platform Owner', () => {
    const legacy = { roleName: LEGACY_OWNER_ROLE_NAME, permissions: ['*'] };
    assert.equal(isPlatformOwnerRole(legacy), false);
    assert.equal(isCompanyOwnerRole(legacy), true);
    assert.equal(resolveStaffExperience(legacy), 'company_owner');
    assert.equal(hasUnrestrictedCompanyAccess(legacy), true);
    assert.equal(hasCrossTenantPlatformAccess(legacy), false);
  });

  it('maps legacy Admin experience to Manager without remapping DB name helpers', () => {
    const admin = { roleName: LEGACY_ADMIN_ROLE_NAME, permissions: [...ADMIN_PERMISSIONS] };
    assert.equal(resolveCanonicalRoleName(LEGACY_ADMIN_ROLE_NAME), MANAGER_ROLE_NAME);
    assert.equal(resolveStaffExperience(admin), 'manager');
    assert.equal(isLegacyRoleName(LEGACY_ADMIN_ROLE_NAME), true);
  });

  it('enforces Manager vs Accountant vs Dispatcher permission boundaries', () => {
    const manager = MANAGER_PERMISSIONS as readonly string[];
    const accountant = ACCOUNTANT_PERMISSIONS as readonly string[];
    const dispatcher = DISPATCHER_PERMISSIONS as readonly string[];

    assert.equal(manager.includes('saas:manage'), false);
    assert.equal(manager.includes('platform:manage'), false);
    assert.equal(manager.includes('users:manage'), true);
    assert.equal(manager.includes('jobs:write'), true);

    assert.equal(accountant.includes('finance:write'), true);
    assert.equal(accountant.includes('integrations:manage'), true);
    assert.equal(accountant.includes('dispatch:write'), false);
    assert.equal(accountant.includes('users:manage'), false);
    assert.equal(accountant.includes('agents:manage'), false);

    assert.equal(dispatcher.includes('dispatch:write'), true);
    assert.equal(dispatcher.includes('integrations:manage'), false);
    assert.equal(dispatcher.includes('agents:manage'), false);
    assert.equal(dispatcher.includes('saas:manage'), false);
  });

  it('blocks technician from owner modules and finances', () => {
    const technician = {
      roleName: TECHNICIAN_ROLE_NAME,
      permissions: [...TECHNICIAN_PERMISSIONS],
    };
    assert.equal(isTechnicianRole(technician), true);
    assert.equal(canAccessOwnerModule(technician, ['finance:read']), false);
    assert.equal(canAccessOwnerModule(technician, ['customers:read']), false);
    assert.equal(hasPermission(technician.permissions, 'finance:read'), false);
    assert.equal(getStaffHomePath(technician), '/mobile');
  });

  it('sets login home paths by role', () => {
    assert.equal(
      getStaffHomePath({ roleName: PLATFORM_OWNER_ROLE_NAME, permissions: ['*'] }),
      '/saas-management',
    );
    assert.equal(getStaffHomePath({ roleName: COMPANY_OWNER_ROLE_NAME, permissions: ['*'] }), '/');
    assert.equal(
      getStaffHomePath({
        roleName: ACCOUNTANT_ROLE_NAME,
        permissions: [...ACCOUNTANT_PERMISSIONS],
      }),
      '/finance/invoices',
    );
    assert.equal(
      getStaffHomePath({
        roleName: DISPATCHER_ROLE_NAME,
        permissions: [...DISPATCHER_PERMISSIONS],
      }),
      '/',
    );
    assert.equal(getStaffHomePath({ roleName: CLIENT_ROLE_NAME, permissions: [] }), '/my');
  });

  it('blocks Owner/Admin/Member/Client/Platform Owner invites', () => {
    assert.equal(isAssignableRoleName(PLATFORM_OWNER_ROLE_NAME), false);
    assert.equal(isAssignableRoleName(COMPANY_OWNER_ROLE_NAME), false);
    assert.equal(isAssignableRoleName(LEGACY_OWNER_ROLE_NAME), false);
    assert.equal(isAssignableRoleName(LEGACY_ADMIN_ROLE_NAME), false);
    assert.equal(isAssignableRoleName(LEGACY_MEMBER_ROLE_NAME), false);
    assert.equal(isAssignableRoleName(CLIENT_ROLE_NAME), false);
    assert.equal(isAssignableRoleName(MANAGER_ROLE_NAME), true);
    assert.equal(isAssignableRoleName(TECHNICIAN_ROLE_NAME), true);
  });

  it('restricts Legacy Member to minimal non-sensitive permissions', () => {
    const member = MEMBER_PERMISSIONS as readonly string[];
    assert.equal(member.includes('finance:read'), false);
    assert.equal(member.includes('customers:read'), false);
    assert.equal(member.includes('jobs:read'), false);
    assert.equal(member.includes('integrations:read'), false);
    assert.equal(member.includes('notifications:read'), true);
  });

  it('allows only Platform Owner to assign Company Owner; blocks self-serve Platform Owner', () => {
    const platform = {
      roleName: PLATFORM_OWNER_ROLE_NAME,
      permissions: ['*', 'platform:cross_tenant'],
    };
    const companyOwner = { roleName: COMPANY_OWNER_ROLE_NAME, permissions: ['*'] };
    const manager = { roleName: MANAGER_ROLE_NAME, permissions: ['users:manage'] };

    assert.equal(canAssignRoleName(platform, COMPANY_OWNER_ROLE_NAME).allowed, true);
    assert.equal(canAssignRoleName(companyOwner, COMPANY_OWNER_ROLE_NAME).allowed, false);
    assert.equal(canAssignRoleName(manager, MANAGER_ROLE_NAME).allowed, false);
    assert.equal(canAssignRoleName(companyOwner, MANAGER_ROLE_NAME).allowed, true);
    assert.equal(canAssignRoleName(platform, PLATFORM_OWNER_ROLE_NAME).allowed, false);
  });
});
