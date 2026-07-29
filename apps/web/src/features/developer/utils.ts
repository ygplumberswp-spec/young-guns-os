export function canAccessPublicDeveloper(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('public_developer:read') ||
    permissions.includes('public_developer:write') ||
    permissions.includes('public_developer:manage') ||
    permissions.includes('integrations:read') ||
    permissions.includes('integrations:manage')
  );
}

export function canManagePublicDeveloper(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('public_developer:write') ||
    permissions.includes('public_developer:manage') ||
    permissions.includes('integrations:manage')
  );
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatSeverity(severity: string): string {
  return severity.replace(/_/g, ' ');
}
