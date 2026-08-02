import { hasAnyPermission, isDispatcherRole } from '@titan/auth/browser';
import type { StaffIdentity } from '@titan/auth/browser';

export function canAccessFinance(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['finance:read', 'finance:write', '*']);
}

/** Executive receivables ageing — excluded from dispatcher finance:read scope. */
export function canAccessFinanceReceivables(identity: StaffIdentity): boolean {
  if (isDispatcherRole(identity)) return false;
  return hasAnyPermission(identity.permissions, [
    'finance:read',
    'finance:write',
    'executive:read',
    '*',
  ]);
}

export function canManageFinance(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['finance:write', '*']);
}

/** Internal cost/margin/profit — never show to clients or technicians. */
export function canViewFinanceProfit(
  permissions: string[],
  roleName?: string | null,
): boolean {
  if (hasAnyPermission(permissions, ['finance:write', '*'])) return true;
  return ['Company Owner', 'Accountant', 'Manager'].includes(roleName ?? '');
}

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
