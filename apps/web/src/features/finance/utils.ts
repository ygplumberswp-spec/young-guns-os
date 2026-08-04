import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessFinance(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['finance:read', 'finance:write', '*']);
}

export function canManageFinance(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['finance:write', '*']);
}

export function canCreateCustomer(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['customers:write', '*']);
}

export { canViewFinanceProfit } from '@titan/shared';

export function canViewJobCosting(permissions: string[]): boolean {
  return hasAnyPermission(permissions, [
    'finance:read',
    'finance:write',
    'inventory:write',
    'procurement:read',
    '*',
  ]);
}

export function newFinanceClientActionId(prefix = 'finance'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
