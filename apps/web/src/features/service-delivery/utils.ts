export function canAccessServiceDelivery(permissions: string[]) {
  return (
    permissions.includes('service_delivery:read') ||
    permissions.includes('service_delivery:manage') ||
    permissions.includes('jobs:read') ||
    permissions.includes('quality:read') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageServiceDelivery(permissions: string[]) {
  return (
    permissions.includes('service_delivery:manage') ||
    permissions.includes('service_delivery:write') ||
    permissions.includes('jobs:write') ||
    permissions.includes('quality:write') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

export function formatWorkflowStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatInspectionStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatPercent(value: string | number | null) {
  if (value == null) return '—';
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(numeric)) return String(value);
  return `${numeric.toFixed(1)}%`;
}
