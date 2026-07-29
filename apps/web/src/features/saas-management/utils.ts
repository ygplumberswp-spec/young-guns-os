export function canAccessSaasManagement(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('saas_management:read') ||
    permissions.includes('saas_management:write') ||
    permissions.includes('saas_management:manage') ||
    permissions.includes('saas:read') ||
    permissions.includes('saas:manage') ||
    permissions.includes('platform:read') ||
    permissions.includes('platform:manage')
  );
}

export function canManageSaasManagement(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('saas_management:write') ||
    permissions.includes('saas_management:manage') ||
    permissions.includes('saas:manage') ||
    permissions.includes('platform:manage')
  );
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatSeverity(severity: string): string {
  return severity.replace(/_/g, ' ');
}

export function formatCurrency(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}
