export function canAccessProductionLaunch(permissions: string[]): boolean {
  return (
    permissions.includes('production_launch:read') ||
    permissions.includes('production_launch:write') ||
    permissions.includes('production_launch:manage') ||
    permissions.includes('ops:read') ||
    permissions.includes('release_center:read') ||
    permissions.includes('*')
  );
}

export function canManageProductionLaunch(permissions: string[]): boolean {
  return (
    permissions.includes('production_launch:write') ||
    permissions.includes('production_launch:manage') ||
    permissions.includes('ops:manage') ||
    permissions.includes('*')
  );
}

export function canAdministerProductionLaunch(permissions: string[]): boolean {
  return (
    permissions.includes('production_launch:manage') ||
    permissions.includes('ops:manage') ||
    permissions.includes('*')
  );
}

export function formatLaunchStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDeploymentStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatWizardStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatValidationStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
