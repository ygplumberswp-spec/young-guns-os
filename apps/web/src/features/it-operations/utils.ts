export function canAccessItOperations(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('it_operations:read') ||
    permissions.includes('it_operations:manage') ||
    permissions.includes('ops:read') ||
    permissions.includes('ops:manage')
  );
}

export function canManageItOperations(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('it_operations:manage') ||
    permissions.includes('it_operations:write') ||
    permissions.includes('ops:manage')
  );
}

export function formatHealthStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatWorkflowStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatSeverity(severity: string): string {
  return severity.replace(/_/g, ' ');
}
