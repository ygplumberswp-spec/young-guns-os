import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessPortalSettings(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['portal:read', 'portal:manage']);
}

export function canManagePortalSettings(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['portal:manage']);
}
