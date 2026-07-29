export function canAccessAppBuilder(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('app_builder:read') ||
    permissions.includes('app_builder:manage') ||
    permissions.includes('platform:manage')
  );
}

export function canManageAppBuilder(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('app_builder:manage') ||
    permissions.includes('platform:manage')
  );
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatRiskLevel(riskLevel: string): string {
  return riskLevel.replace(/_/g, ' ');
}

export function formatSeverity(severity: string): string {
  return severity.replace(/_/g, ' ');
}
