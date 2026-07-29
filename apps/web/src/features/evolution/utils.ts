export function canAccessEvolution(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('intelligence:read') ||
    permissions.includes('executive:read') ||
    permissions.includes('executive:write') ||
    permissions.includes('ai_orchestration:read')
  );
}

export function canManageEvolution(permissions: string[]): boolean {
  return permissions.includes('*') || permissions.includes('executive:write');
}

export function formatCategory(category: string): string {
  return category.replace(/_/g, ' ');
}

export function formatSourceType(sourceType: string): string {
  return sourceType.replace(/_/g, ' ');
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
