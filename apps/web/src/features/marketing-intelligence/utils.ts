export function canAccessMarketingIntelligence(permissions: string[]) {
  return (
    permissions.includes('marketing_intelligence:read') ||
    permissions.includes('marketing_intelligence:manage') ||
    permissions.includes('marketing:read') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageMarketingIntelligence(permissions: string[]) {
  return (
    permissions.includes('marketing_intelligence:manage') ||
    permissions.includes('marketing_intelligence:write') ||
    permissions.includes('marketing:write') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

import { formatMoney } from '@titan/shared';

export function formatCurrency(cents: number, currency: string) {
  return formatMoney(cents, currency);
}

export function formatWorkflowStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatLifecycleStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatProviderType(type: string) {
  return type.replace(/_/g, ' ');
}
