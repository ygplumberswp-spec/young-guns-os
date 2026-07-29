export function canAccessMarketingIntelligence(permissions: string[]) {
  return (
    permissions.includes('marketing_intelligence:read') ||
    permissions.includes('marketing_intelligence:manage') ||
    permissions.includes('marketing:read') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageMarketingIntelligence(permissions: string[]) {
  return (
    permissions.includes('marketing_intelligence:manage') ||
    permissions.includes('marketing_intelligence:write') ||
    permissions.includes('marketing:write') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

export function formatCurrency(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export function formatWorkflowStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatLifecycleStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatProviderType(type: string) {
  return type.replace(/_/g, ' ');
}
