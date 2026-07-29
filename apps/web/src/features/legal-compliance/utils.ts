export function canAccessLegalCompliance(permissions: string[]) {
  return (
    permissions.includes('legal_compliance:read') ||
    permissions.includes('legal_compliance:manage') ||
    permissions.includes('documents:read') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageLegalCompliance(permissions: string[]) {
  return (
    permissions.includes('legal_compliance:manage') ||
    permissions.includes('legal_compliance:write') ||
    permissions.includes('documents:write') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

export function formatContractStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatRiskCategory(category: string) {
  return category.replace(/_/g, ' ');
}

export function formatProviderType(type: string) {
  return type.replace(/_/g, ' ');
}
