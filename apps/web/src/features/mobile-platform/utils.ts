export function canAccessMobilePlatform(permissions: string[]) {
  return (
    permissions.includes('mobile:read') ||
    permissions.includes('mobile:manage') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageMobilePlatform(permissions: string[]) {
  return (
    permissions.includes('mobile:manage') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

export function formatDevicePlatform(platform: string) {
  return platform.replace(/_/g, ' ');
}

export function formatDeviceStatus(status: string) {
  return status.replace(/_/g, ' ');
}
