export function canAccessSalesIntelligence(permissions: string[]) {
  return (
    permissions.includes('sales_intelligence:read') ||
    permissions.includes('sales_intelligence:manage') ||
    permissions.includes('sales:read') ||
    permissions.includes('leads:read') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageSalesIntelligence(permissions: string[]) {
  return (
    permissions.includes('sales_intelligence:manage') ||
    permissions.includes('sales_intelligence:write') ||
    permissions.includes('sales:write') ||
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

export function formatProviderType(type: string) {
  return type.replace(/_/g, ' ');
}

export function formatPercent(value: string | number | null) {
  if (value == null) return '—';
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(numeric)) return String(value);
  return `${numeric.toFixed(1)}%`;
}
