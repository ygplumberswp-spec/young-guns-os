export function canAccessDeveloperPlatform(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('integrations:read') ||
    permissions.includes('integrations:manage') ||
    permissions.includes('agents:read')
  );
}

export function canManageDeveloperPlatform(permissions: string[]): boolean {
  return permissions.includes('*') || permissions.includes('integrations:manage');
}

export function formatExtensionType(type: string): string {
  return type.replace(/_/g, ' ');
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
