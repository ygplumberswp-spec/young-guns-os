export function canAccessAssetIntelligence(permissions: string[]) {
  return (
    permissions.includes('asset_lifecycle:read') ||
    permissions.includes('asset_lifecycle:manage') ||
    permissions.includes('asset_equipment:read') ||
    permissions.includes('fleet:read') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageAssetIntelligence(permissions: string[]) {
  return (
    permissions.includes('asset_lifecycle:manage') ||
    permissions.includes('asset_lifecycle:write') ||
    permissions.includes('asset_equipment:write') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

export function formatAlertSeverity(severity: string) {
  return severity.replace(/_/g, ' ');
}

export function formatLifecycleStage(stage: string) {
  return stage.replace(/_/g, ' ');
}

export function formatIotProviderType(type: string) {
  return type.replace(/_/g, ' ');
}
