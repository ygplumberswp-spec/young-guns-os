export function canAccessBusinessContinuity(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('business_continuity:read') ||
    permissions.includes('business_continuity:write') ||
    permissions.includes('business_continuity:manage') ||
    permissions.includes('ops:read') ||
    permissions.includes('ops:manage') ||
    permissions.includes('it_operations:read') ||
    permissions.includes('it_operations:manage')
  );
}

export function canManageBusinessContinuity(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('business_continuity:write') ||
    permissions.includes('business_continuity:manage') ||
    permissions.includes('ops:manage')
  );
}

export function formatStatus(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatSeverity(value: string): string {
  return formatStatus(value);
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatScenarioKey(value: string): string {
  return formatStatus(value);
}

export function formatScheduleType(value: string): string {
  return formatStatus(value);
}

export function formatPercent(value: number | null): string {
  if (value == null) return '—';
  return `${value}%`;
}
