export function canAccessReleaseCenter(permissions: string[]): boolean {
  return (
    permissions.includes('release_center:read') ||
    permissions.includes('release_center:write') ||
    permissions.includes('release_center:manage') ||
    permissions.includes('ops:read') ||
    permissions.includes('launch_center:read') ||
    permissions.includes('*')
  );
}

export function canManageReleaseCenter(permissions: string[]): boolean {
  return (
    permissions.includes('release_center:write') ||
    permissions.includes('release_center:manage') ||
    permissions.includes('ops:manage') ||
    permissions.includes('*')
  );
}

export function canAdministerReleaseCenter(permissions: string[]): boolean {
  return (
    permissions.includes('release_center:manage') ||
    permissions.includes('ops:manage') ||
    permissions.includes('*')
  );
}

export function formatReleaseStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatValidationStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatChecklistStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
