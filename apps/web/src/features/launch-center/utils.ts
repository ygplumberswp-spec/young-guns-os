export function canAccessLaunchCenter(permissions: string[]): boolean {
  return (
    permissions.includes('launch_center:read') ||
    permissions.includes('launch_center:write') ||
    permissions.includes('launch_center:manage') ||
    permissions.includes('ops:read') ||
    permissions.includes('platform_health:read') ||
    permissions.includes('*')
  );
}

export function canManageLaunchCenter(permissions: string[]): boolean {
  return (
    permissions.includes('launch_center:write') ||
    permissions.includes('launch_center:manage') ||
    permissions.includes('ops:manage') ||
    permissions.includes('*')
  );
}

export function canAdministerLaunchCenter(permissions: string[]): boolean {
  return (
    permissions.includes('launch_center:manage') ||
    permissions.includes('ops:manage') ||
    permissions.includes('*')
  );
}

export function formatReadinessStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCheckStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatWizardStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
