import {
  ADMIN_ROLE_NAME,
  MEMBER_ROLE_NAME,
  OWNER_ROLE_NAME,
  TECHNICIAN_ROLE_NAME,
  hasAnyPermission,
  hasPermission,
} from './permissions.js';

export type StaffExperience = 'platform_owner' | 'technician' | 'staff';

export type StaffIdentity = {
  roleName: string;
  permissions: string[];
};

export function isPlatformOwner(identity: StaffIdentity): boolean {
  return hasPermission(identity.permissions, '*') || identity.roleName === OWNER_ROLE_NAME;
}

export function isTechnicianRole(identity: StaffIdentity): boolean {
  return identity.roleName === TECHNICIAN_ROLE_NAME;
}

export function resolveStaffExperience(identity: StaffIdentity): StaffExperience {
  if (isPlatformOwner(identity)) {
    return 'platform_owner';
  }
  if (isTechnicianRole(identity)) {
    return 'technician';
  }
  return 'staff';
}

export function getStaffHomePath(identity: StaffIdentity): string {
  return resolveStaffExperience(identity) === 'technician' ? '/mobile' : '/';
}

/** Permissions technicians must never hold for owner-only modules. */
export const TECHNICIAN_DENIED_PERMISSIONS = [
  'company:manage',
  'users:manage',
  'settings:manage',
  'finance:read',
  'finance:write',
  'analytics:read',
  'analytics:write',
  'marketing:read',
  'marketing:write',
  'leads:read',
  'leads:write',
  'executive:read',
  'executive:write',
  'bi:read',
  'bi:write',
  'integrations:manage',
  'security:write',
  'platform:manage',
  'saas:manage',
  'ops:manage',
  'agents:write',
  'mission-control',
] as const;

export function canAccessOwnerModule(identity: StaffIdentity, requiredPermissions: string[]): boolean {
  if (isPlatformOwner(identity)) {
    return true;
  }
  if (isTechnicianRole(identity)) {
    return false;
  }
  return hasAnyPermission(identity.permissions, requiredPermissions);
}

export function canAccessTechnicianMobile(identity: StaffIdentity): boolean {
  if (isPlatformOwner(identity) || isTechnicianRole(identity)) {
    return true;
  }
  return hasAnyPermission(identity.permissions, ['mobile:read', 'mobile:write', 'jobs:read', 'jobs:write']);
}

export {
  OWNER_ROLE_NAME,
  ADMIN_ROLE_NAME,
  MEMBER_ROLE_NAME,
  TECHNICIAN_ROLE_NAME,
};
