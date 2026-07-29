export const OWNER_ROLE_NAME = 'Owner';

export const ADMIN_ROLE_NAME = 'Admin';

export const MEMBER_ROLE_NAME = 'Member';

/** Owner role receives wildcard — full access within the tenant. */
export const OWNER_PERMISSIONS = ['*'] as const;

export const ADMIN_PERMISSIONS = [
  'company:manage',
  'users:read',
  'users:manage',
  'settings:manage',
  'customers:read',
  'customers:write',
  'jobs:read',
  'jobs:write',
  'dispatch:read',
  'dispatch:write',
  'finance:read',
  'finance:write',
  'inventory:read',
  'inventory:write',
  'fleet:read',
  'fleet:write',
  'integrations:read',
  'integrations:manage',
  'communications:read',
  'communications:write',
  'documents:read',
  'documents:write',
  'automation:read',
  'automation:write',
  'agents:read',
  'agents:write',
  'recruiting:read',
  'recruiting:write',
  'intelligence:read',
  'intelligence:write',
  'analytics:read',
  'analytics:write',
  'mobile:read',
  'mobile:write',
  'orchestration:read',
  'orchestration:write',
  'sales:read',
  'sales:write',
  'marketing:read',
  'marketing:write',
  'leads:read',
  'leads:write',
  'voice:read',
  'voice:write',
  'customer_support:read',
  'customer_support:write',
  'workforce:read',
  'workforce:write',
  'procurement:read',
  'procurement:write',
  'executive:read',
  'executive:write',
  'knowledge:read',
  'knowledge:write',
  'bi:read',
  'bi:write',
  'portal:read',
  'portal:manage',
  'quality:read',
  'quality:write',
  'communications_intelligence:read',
  'communications_intelligence:write',
  'asset_equipment:read',
  'asset_equipment:write',
  'ai_orchestration:read',
  'ai_orchestration:write',
  'dispatch_intelligence:read',
  'dispatch_intelligence:write',
  'fleet_intelligence:read',
  'fleet_intelligence:write',
  'personal_communications:read',
  'personal_communications:write',
  'security:read',
  'security:write',
] as const;

export const MEMBER_PERMISSIONS = [
  'users:read',
  'customers:read',
  'jobs:read',
  'dispatch:read',
  'finance:read',
  'inventory:read',
  'fleet:read',
  'integrations:read',
  'communications:read',
  'documents:read',
  'automation:read',
  'agents:read',
  'recruiting:read',
  'intelligence:read',
  'analytics:read',
  'mobile:read',
  'orchestration:read',
  'sales:read',
  'marketing:read',
  'leads:read',
  'voice:read',
  'customer_support:read',
  'workforce:read',
  'procurement:read',
  'executive:read',
  'knowledge:read',
  'bi:read',
  'portal:read',
  'quality:read',
  'communications_intelligence:read',
  'asset_equipment:read',
  'ai_orchestration:read',
  'dispatch_intelligence:read',
  'fleet_intelligence:read',
  'personal_communications:read',
  'security:read',
] as const;

export type Permission =
  | (typeof OWNER_PERMISSIONS)[number]
  | (typeof ADMIN_PERMISSIONS)[number]
  | (typeof MEMBER_PERMISSIONS)[number]
  | '*';

export const DEFAULT_TEAM_ROLES = [
  {
    name: OWNER_ROLE_NAME,
    permissions: [...OWNER_PERMISSIONS],
    isSystem: true,
  },
  {
    name: ADMIN_ROLE_NAME,
    permissions: [...ADMIN_PERMISSIONS],
    isSystem: true,
  },
  {
    name: MEMBER_ROLE_NAME,
    permissions: [...MEMBER_PERMISSIONS],
    isSystem: true,
  },
] as const;

export function hasPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes('*')) {
    return true;
  }

  return userPermissions.includes(required);
}

export function hasAnyPermission(userPermissions: string[], required: string[]): boolean {
  return required.some((permission) => hasPermission(userPermissions, permission));
}
