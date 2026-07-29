import { hasAnyPermission } from '@titan/auth/browser';

export function canAccessAnalytics(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['analytics:read', 'analytics:write']);
}

export function canManageAnalytics(permissions: string[]): boolean {
  return hasAnyPermission(permissions, ['analytics:write']);
}

export function formatChangePercent(value: number | null): string {
  if (value === null) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}%`;
}
