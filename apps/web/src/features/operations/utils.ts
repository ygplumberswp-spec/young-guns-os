export function canAccessOperations(permissions: string[]) {
  return (
    permissions.includes('ops:read') ||
    permissions.includes('ops:manage') ||
    permissions.includes('platform:read') ||
    permissions.includes('platform:manage') ||
    permissions.includes('executive:read') ||
    permissions.includes('*')
  );
}

export function canManageOperations(permissions: string[]) {
  return (
    permissions.includes('ops:manage') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

export function formatHealthStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatModuleKey(key: string) {
  return key.replace(/_/g, ' ');
}
