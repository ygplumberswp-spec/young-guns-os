import { hasAnyPermission, resolveStaffExperience, type StaffIdentity } from '@titan/auth/browser';
import {
  CLIENT_PORTAL_NAV_ITEMS,
  OWNER_STAFF_NAV_ITEMS,
  TECHNICIAN_NAV_ITEMS,
  type NavItemConfig,
} from '@titan/shared';
import type { PortalAccessPermission } from '@titan/shared';
import type { AuthUser } from '@titan/shared';

export function toStaffIdentity(user: Pick<AuthUser, 'roleName' | 'permissions'>): StaffIdentity {
  return { roleName: user.roleName, permissions: user.permissions };
}

export function filterOwnerStaffNav(user: Pick<AuthUser, 'roleName' | 'permissions'>) {
  const identity = toStaffIdentity(user);
  const experience = resolveStaffExperience(identity);
  if (experience === 'technician') {
    return [];
  }

  const seen = new Set<string>();
  return OWNER_STAFF_NAV_ITEMS.filter((item) => {
    if (seen.has(item.href)) return false;
    if (item.experiences && !item.experiences.includes(experience)) return false;
    if (item.permissions && !hasAnyPermission(user.permissions, item.permissions)) return false;
    seen.add(item.href);
    return true;
  });
}

export function filterTechnicianNav(user: Pick<AuthUser, 'roleName' | 'permissions'>) {
  const identity = toStaffIdentity(user);
  if (!hasAnyPermission(user.permissions, ['mobile:read', 'mobile:write', 'jobs:read'])) {
    return [];
  }
  const experience = resolveStaffExperience(identity);
  return TECHNICIAN_NAV_ITEMS.filter(
    (item) => !item.experiences || item.experiences.includes(experience),
  );
}

export function filterPortalNav(permissions: PortalAccessPermission[]): NavItemConfig[] {
  const seen = new Set<string>();
  return CLIENT_PORTAL_NAV_ITEMS.filter((item) => {
    const key = `${item.href}:${item.label}`;
    if (seen.has(key)) return false;
    if (item.portalPermission && !permissions.includes(item.portalPermission)) return false;
    seen.add(key);
    return true;
  });
}
