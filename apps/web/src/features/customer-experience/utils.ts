export function canAccessCustomerExperience(permissions: string[]) {
  return (
    permissions.includes('customer_experience:read') ||
    permissions.includes('customer_experience:manage') ||
    permissions.includes('portal:read') ||
    permissions.includes('portal:manage') ||
    permissions.includes('platform:read') ||
    permissions.includes('*')
  );
}

export function canManageCustomerExperience(permissions: string[]) {
  return (
    permissions.includes('customer_experience:manage') ||
    permissions.includes('customer_experience:write') ||
    permissions.includes('portal:manage') ||
    permissions.includes('platform:manage') ||
    permissions.includes('*')
  );
}

export function formatBookingStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function formatReviewType(type: string) {
  return type.replace(/_/g, ' ');
}
