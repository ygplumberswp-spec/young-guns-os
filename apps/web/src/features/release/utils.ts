export function canAccessReleaseManagement(permissions: string[]): boolean {
  return (
    permissions.includes('release_manager:read') ||
    permissions.includes('release_manager:write') ||
    permissions.includes('release_manager:manage') ||
    permissions.includes('ops:read') ||
    permissions.includes('production_launch:read') ||
    permissions.includes('*')
  );
}

export function canManageReleaseManagement(permissions: string[]): boolean {
  return (
    permissions.includes('release_manager:write') ||
    permissions.includes('release_manager:manage') ||
    permissions.includes('ops:manage') ||
    permissions.includes('*')
  );
}

export function canAdministerReleaseManagement(permissions: string[]): boolean {
  return (
    permissions.includes('release_manager:manage') ||
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

export function formatStorePlatform(platform: string): string {
  return platform === 'apple_app_store'
    ? 'Apple App Store'
    : platform === 'google_play_store'
      ? 'Google Play Store'
      : platform;
}
