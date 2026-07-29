export function canAccessWorkforceIntelligence(permissions: string[]) {
  return (
    permissions.includes('workforce_intelligence:read') ||
    permissions.includes('workforce_intelligence:manage') ||
    permissions.includes('workforce:read') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageWorkforceIntelligence(permissions: string[]) {
  return (
    permissions.includes('workforce_intelligence:manage') ||
    permissions.includes('workforce_intelligence:write') ||
    permissions.includes('workforce:write') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

export function formatLifecycleStage(stage: string) {
  return stage.replace(/_/g, ' ');
}

export function formatProviderType(type: string) {
  return type.replace(/_/g, ' ');
}

export function formatCurrency(cents: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}
