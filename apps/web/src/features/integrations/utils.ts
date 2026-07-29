import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessIntegrations(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['integrations:read', 'integrations:manage']);
}

export function canManageIntegrations(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['integrations:manage']);
}
