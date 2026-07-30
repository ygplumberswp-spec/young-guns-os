export function canAccessPlatform(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('platform:read') ||
    permissions.includes('platform:manage') ||
    permissions.includes('saas:read') ||
    permissions.includes('saas:manage') ||
    permissions.includes('agents:read')
  );
}

export function canManagePlatform(permissions: string[]): boolean {
  return permissions.includes('*') || permissions.includes('platform:manage');
}

export function canManageSaas(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('saas:manage') ||
    permissions.includes('platform:manage')
  );
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

import { formatMoney } from '@titan/shared';

export function formatCents(cents: number, currency = 'ZAR'): string {
  return formatMoney(cents, currency);
}
