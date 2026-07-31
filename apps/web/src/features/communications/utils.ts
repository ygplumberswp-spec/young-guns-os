import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessCommunications(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['communications:read', 'communications:write']);
}

export function canManageCommunications(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['communications:write']);
}

export function newCommunicationClientActionId(prefix = 'comm'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
