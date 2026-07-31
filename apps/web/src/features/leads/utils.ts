import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessLeads(permissions: string[]) {
  return hasAnyPermission(permissions, ['leads:read', 'leads:write', '*']);
}

export function canManageLeads(permissions: string[]) {
  return hasAnyPermission(permissions, ['leads:write', '*']);
}

export function canConvertLeads(permissions: string[]) {
  return (
    hasAnyPermission(permissions, ['leads:write', '*']) &&
    hasAnyPermission(permissions, ['customers:write', '*'])
  );
}

export function newClientActionId(prefix = 'lead-convert'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
