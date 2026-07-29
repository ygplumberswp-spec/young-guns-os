import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessFinance(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['finance:read', 'finance:write']);
}

export function canManageFinance(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['finance:write']);
}
