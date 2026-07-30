export function canAccessMissionControl(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('executive:read') ||
    permissions.includes('executive:write') ||
    permissions.includes('intelligence:read')
  );
}

export function canManageMissionControl(permissions: string[]): boolean {
  return permissions.includes('*') || permissions.includes('executive:write');
}

export function formatModuleName(module: string): string {
  if (module.startsWith('tenant_capability:')) {
    const slug = module.slice('tenant_capability:'.length);
    return slug
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  return module
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatSeverity(severity: string): string {
  return severity.replace(/_/g, ' ');
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
