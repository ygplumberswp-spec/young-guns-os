export function canAccessDigitalTwin(permissions: string[]): boolean {
  return (
    permissions.includes('*') ||
    permissions.includes('executive:read') ||
    permissions.includes('executive:write') ||
    permissions.includes('intelligence:read')
  );
}

export function canManageDigitalTwin(permissions: string[]): boolean {
  return permissions.includes('*') || permissions.includes('executive:write');
}

export function formatSimulationType(type: string): string {
  return type.replace(/_/g, ' ');
}

export function formatRiskLevel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}
