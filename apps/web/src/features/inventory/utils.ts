import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessInventory(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['inventory:read', 'inventory:write']);
}

export function canManageInventory(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['inventory:write']);
}
