export function canAccessFinancialPlanning(permissions: string[]) {
  return (
    permissions.includes('financial_planning:read') ||
    permissions.includes('financial_planning:manage') ||
    permissions.includes('finance:read') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageFinancialPlanning(permissions: string[]) {
  return (
    permissions.includes('financial_planning:manage') ||
    permissions.includes('financial_planning:write') ||
    permissions.includes('finance:write') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

import { formatMoney } from '@titan/shared';

export function formatCurrency(cents: number, currency: string) {
  return formatMoney(cents, currency);
}

export function formatBudgetStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatProviderType(type: string) {
  return type.replace(/_/g, ' ');
}
