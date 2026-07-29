import type { GsEntityType, GsSearchMode } from '@titan/shared';

export function canAccessGlobalSearch(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('search:read') ||
    permissions.includes('search:write') ||
    permissions.includes('search:manage') ||
    permissions.includes('intelligence:read') ||
    permissions.includes('ops:read') ||
    permissions.includes('ops:manage')
  );
}

export function canManageGlobalSearch(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('search:write') ||
    permissions.includes('search:manage') ||
    permissions.includes('ops:manage')
  );
}

export function formatStatus(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatSeverity(value: string): string {
  return formatStatus(value);
}

export function formatEntityType(value: GsEntityType | string): string {
  return formatStatus(value);
}

export function formatSearchMode(value: GsSearchMode | string): string {
  return formatStatus(value);
}

export function formatRelevanceScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}
