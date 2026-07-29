export function canAccessIndustryPacks(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('industry_packs:read') ||
    permissions.includes('industry_packs:manage')
  );
}

export function canManageIndustryPacks(permissions: string[]): boolean {
  return permissions.includes('*') || permissions.includes('industry_packs:manage');
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatSeverity(severity: string): string {
  return severity.replace(/_/g, ' ');
}
