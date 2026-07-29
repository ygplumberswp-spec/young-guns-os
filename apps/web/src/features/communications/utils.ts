import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessCommunications(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['communications:read', 'communications:write']);
}

export function canManageCommunications(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['communications:write']);
}
