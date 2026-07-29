export function canAccessDataMigration(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('data_migration:read') ||
    permissions.includes('data_migration:write') ||
    permissions.includes('data_migration:manage') ||
    permissions.includes('integrations:read') ||
    permissions.includes('integrations:manage')
  );
}

export function canManageDataMigration(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('data_migration:write') ||
    permissions.includes('data_migration:manage') ||
    permissions.includes('integrations:manage')
  );
}

export function canApproveDataMigration(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('data_migration:manage') ||
    permissions.includes('integrations:manage')
  );
}

export function formatStatus(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatSeverity(value: string): string {
  return formatStatus(value);
}

export function formatEntityType(value: string): string {
  return formatStatus(value);
}

export function formatSourceFormat(value: string): string {
  return value.toUpperCase();
}
