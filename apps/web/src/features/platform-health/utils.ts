export function canAccessPlatformHealth(permissions: string[]): boolean {
  return (
    permissions.includes('platform_health:read') ||
    permissions.includes('platform_health:write') ||
    permissions.includes('platform_health:manage') ||
    permissions.includes('it_operations:read') ||
    permissions.includes('integrations:read') ||
    permissions.includes('*')
  );
}

export function canManagePlatformHealth(permissions: string[]): boolean {
  return (
    permissions.includes('platform_health:write') ||
    permissions.includes('platform_health:manage') ||
    permissions.includes('it_operations:write') ||
    permissions.includes('integrations:manage') ||
    permissions.includes('*')
  );
}

export function canAdministerPlatformHealth(permissions: string[]): boolean {
  return (
    permissions.includes('platform_health:manage') ||
    permissions.includes('it_operations:manage') ||
    permissions.includes('integrations:manage') ||
    permissions.includes('*')
  );
}

export function formatHealthStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatSeverity(severity: string): string {
  return severity.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatInsightType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
