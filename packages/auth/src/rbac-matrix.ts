/**
 * TITAN canonical RBAC matrix (Batch 1A).
 * Single source of truth for role names, permission packs, legacy aliases,
 * experience surfaces and home paths. Used by API and frontend via @titan/auth.
 */

/** Canonical staff + client role names (Decision 1). */
export const PLATFORM_OWNER_ROLE_NAME = 'Platform Owner';
export const COMPANY_OWNER_ROLE_NAME = 'Company Owner';
export const MANAGER_ROLE_NAME = 'Manager';
export const DISPATCHER_ROLE_NAME = 'Dispatcher';
export const ACCOUNTANT_ROLE_NAME = 'Accountant';
export const TECHNICIAN_ROLE_NAME = 'Technician';
export const CLIENT_ROLE_NAME = 'Client';

/** Legacy role names preserved for compatibility until explicit user remapping. */
export const LEGACY_OWNER_ROLE_NAME = 'Owner';
export const LEGACY_ADMIN_ROLE_NAME = 'Admin';
export const LEGACY_MEMBER_ROLE_NAME = 'Member';

/** @deprecated Use COMPANY_OWNER_ROLE_NAME — kept for import compatibility. */
export const OWNER_ROLE_NAME = LEGACY_OWNER_ROLE_NAME;
/** @deprecated Use MANAGER_ROLE_NAME or LEGACY_ADMIN_ROLE_NAME. */
export const ADMIN_ROLE_NAME = LEGACY_ADMIN_ROLE_NAME;
/** @deprecated Legacy Member — ambiguous; do not auto-map to Accountant. */
export const MEMBER_ROLE_NAME = LEGACY_MEMBER_ROLE_NAME;

export type CanonicalRoleName =
  | typeof PLATFORM_OWNER_ROLE_NAME
  | typeof COMPANY_OWNER_ROLE_NAME
  | typeof MANAGER_ROLE_NAME
  | typeof DISPATCHER_ROLE_NAME
  | typeof ACCOUNTANT_ROLE_NAME
  | typeof TECHNICIAN_ROLE_NAME
  | typeof CLIENT_ROLE_NAME;

export type LegacyRoleName =
  typeof LEGACY_OWNER_ROLE_NAME | typeof LEGACY_ADMIN_ROLE_NAME | typeof LEGACY_MEMBER_ROLE_NAME;

export type StaffExperience =
  | 'platform_owner'
  | 'company_owner'
  | 'manager'
  | 'dispatcher'
  | 'accountant'
  | 'technician'
  | 'client'
  | 'staff';

export type StaffIdentity = {
  roleName: string;
  permissions: string[];
};

/**
 * Explicit legacy → canonical aliases for experience/boundary resolution only.
 * Does NOT rewrite database role rows. Member is intentionally omitted (ambiguous).
 */
export const LEGACY_ROLE_ALIASES = {
  [LEGACY_OWNER_ROLE_NAME]: COMPANY_OWNER_ROLE_NAME,
  [LEGACY_ADMIN_ROLE_NAME]: MANAGER_ROLE_NAME,
} as const satisfies Partial<Record<LegacyRoleName, CanonicalRoleName>>;

/**
 * Roles blocked from invitations (binding Batch 1A finalize).
 * Company Owner is assignable only by Platform Owner via Users & Access — never invite.
 */
export const INVITE_BLOCKED_ROLE_NAMES = new Set<string>([
  PLATFORM_OWNER_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  CLIENT_ROLE_NAME,
  LEGACY_OWNER_ROLE_NAME,
  LEGACY_ADMIN_ROLE_NAME,
  LEGACY_MEMBER_ROLE_NAME,
]);

/** Roles that may be offered on invite links. */
export const INVITE_ALLOWED_ROLE_NAMES = new Set<string>([
  MANAGER_ROLE_NAME,
  DISPATCHER_ROLE_NAME,
  ACCOUNTANT_ROLE_NAME,
  TECHNICIAN_ROLE_NAME,
]);

/**
 * Roles Company/Platform Owner may assign in Users & Access (manual).
 * Platform Owner role itself is never assignable via API (migration / ops only).
 */
export const MANUAL_ASSIGNABLE_ROLE_NAMES = new Set<string>([
  MANAGER_ROLE_NAME,
  DISPATCHER_ROLE_NAME,
  ACCOUNTANT_ROLE_NAME,
  TECHNICIAN_ROLE_NAME,
  LEGACY_MEMBER_ROLE_NAME,
]);

/** @deprecated Prefer INVITE_BLOCKED_ROLE_NAMES / isInviteAssignableRoleName. */
export const NON_ASSIGNABLE_ROLE_NAMES = INVITE_BLOCKED_ROLE_NAMES;

/** Roles that count as company ownership for last-owner protection. */
export const COMPANY_OWNER_ROLE_NAMES = new Set<string>([
  COMPANY_OWNER_ROLE_NAME,
  LEGACY_OWNER_ROLE_NAME,
]);

export const PLATFORM_CROSS_TENANT_PERMISSION = 'platform:cross_tenant';

export const OWNER_PERMISSIONS = ['*'] as const;

/** Broad operational pack shared by legacy Admin (preserved) and used as Manager base. */
export const OPERATIONAL_ADMIN_PERMISSIONS = [
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
  'communications:manage',
  'documents:read',
  'documents:write',
  'automation:read',
  'automation:write',
  'agents:read',
  'agents:write',
  'agents:manage',
  'recruiting:read',
  'recruiting:write',
  'intelligence:read',
  'intelligence:write',
  'analytics:read',
  'analytics:write',
  'mobile:read',
  'mobile:write',
  'mobile:manage',
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
  'voice_reception:read',
  'voice_reception:write',
  'voice_reception:manage',
  'document_ai:read',
  'document_ai:write',
  'document_ai:manage',
  'business_continuity:read',
  'business_continuity:write',
  'business_continuity:manage',
  'search:read',
  'search:write',
  'search:manage',
  'data_migration:read',
  'data_migration:write',
  'data_migration:manage',
  'notifications:read',
  'notifications:write',
  'notifications:manage',
  'platform_health:read',
  'platform_health:write',
  'platform_health:manage',
  'launch_center:read',
  'launch_center:write',
  'launch_center:manage',
  'release_center:read',
  'release_center:write',
  'release_center:manage',
  'production_launch:read',
  'production_launch:write',
  'production_launch:manage',
  'release_manager:read',
  'release_manager:write',
  'release_manager:manage',
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
  'customer_experience:read',
  'customer_experience:write',
  'customer_experience:manage',
  'quality:read',
  'quality:write',
  'communications_intelligence:read',
  'communications_intelligence:write',
  'asset_equipment:read',
  'asset_equipment:write',
  'asset_lifecycle:read',
  'asset_lifecycle:write',
  'asset_lifecycle:manage',
  'workforce_intelligence:read',
  'workforce_intelligence:write',
  'workforce_intelligence:manage',
  'legal_compliance:read',
  'legal_compliance:write',
  'legal_compliance:manage',
  'financial_planning:read',
  'financial_planning:write',
  'financial_planning:manage',
  'sales_intelligence:read',
  'sales_intelligence:write',
  'sales_intelligence:manage',
  'marketing_intelligence:read',
  'marketing_intelligence:write',
  'marketing_intelligence:manage',
  'service_delivery:read',
  'service_delivery:write',
  'service_delivery:manage',
  'it_operations:read',
  'it_operations:write',
  'it_operations:manage',
  'business_evolution:read',
  'business_evolution:write',
  'business_evolution:manage',
  'app_builder:read',
  'app_builder:write',
  'app_builder:manage',
  'industry_packs:read',
  'industry_packs:write',
  'industry_packs:manage',
  'public_developer:read',
  'public_developer:write',
  'public_developer:manage',
  'saas_management:read',
  'saas_management:write',
  'saas_management:manage',
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
  'platform:read',
  'platform:manage',
  'saas:read',
  'saas:manage',
  'ops:read',
  'ops:manage',
] as const;

/** Legacy Admin — full prior pack preserved (includes platform/SaaS). */
export const ADMIN_PERMISSIONS = OPERATIONAL_ADMIN_PERMISSIONS;

/**
 * Manager — company operations without platform/SaaS administration.
 * Derived from Admin pack minus platform/SaaS/release controls.
 */
export const MANAGER_PERMISSIONS = OPERATIONAL_ADMIN_PERMISSIONS.filter(
  (permission) =>
    !permission.startsWith('saas') &&
    !permission.startsWith('platform') &&
    !permission.startsWith('platform_health') &&
    !permission.startsWith('launch_center') &&
    !permission.startsWith('release_center') &&
    !permission.startsWith('production_launch') &&
    !permission.startsWith('release_manager') &&
    !permission.startsWith('public_developer') &&
    permission !== 'ops:manage',
) as unknown as readonly string[];

/** Dispatcher — scheduling/ops; no integrations, AI admin, payroll or SaaS. */
export const DISPATCHER_PERMISSIONS = [
  'customers:read',
  'customers:write',
  'jobs:read',
  'jobs:write',
  'dispatch:read',
  'dispatch:write',
  'leads:read',
  'leads:write',
  'finance:read',
  'communications:read',
  'communications:write',
  'documents:read',
  'documents:write',
  'portal:read',
  'portal:manage',
  'mobile:read',
  'inventory:read',
  'fleet:read',
  'users:read',
  'dispatch_intelligence:read',
  'fleet_intelligence:read',
] as const;

/** Accountant — finance/Xero/reports; no dispatch, staff manage, AI admin or platform. */
export const ACCOUNTANT_PERMISSIONS = [
  'customers:read',
  'finance:read',
  'finance:write',
  'documents:read',
  'documents:write',
  'integrations:read',
  'integrations:manage',
  'analytics:read',
  'bi:read',
  'financial_planning:read',
  'financial_planning:write',
  'financial_planning:manage',
  'portal:read',
  'notifications:read',
] as const;

/** Field technician — assigned jobs only (enforced in guards/services). */
export const TECHNICIAN_PERMISSIONS = [
  'mobile:read',
  'mobile:write',
  'jobs:read',
  'jobs:write',
  'documents:read',
  'documents:write',
  'communications:read',
  'communications:write',
  'inventory:read',
] as const;

/**
 * Legacy Member — retained until manual reassignment.
 * Minimal non-sensitive access only (no finance, CRM, jobs, integrations, AI, platform).
 */
export const MEMBER_PERMISSIONS = [
  'notifications:read',
  'documents:read',
  'communications:read',
  'knowledge:read',
  'search:read',
  'portal:read',
] as const;

/** Client portal principal — not a staff JWT role; documented for the matrix. */
export const CLIENT_PERMISSIONS = [
  'portal.dashboard:read',
  'portal.appointments:read',
  'portal.jobs:read',
  'portal.quotes:read',
  'portal.invoices:read',
  'portal.payments:read',
  'portal.communications:read',
  'portal.documents:read',
] as const;

export const PLATFORM_OWNER_PERMISSIONS = ['*', PLATFORM_CROSS_TENANT_PERMISSION] as const;
export const COMPANY_OWNER_PERMISSIONS = OWNER_PERMISSIONS;

export type Permission =
  | (typeof OWNER_PERMISSIONS)[number]
  | (typeof OPERATIONAL_ADMIN_PERMISSIONS)[number]
  | (typeof MEMBER_PERMISSIONS)[number]
  | (typeof TECHNICIAN_PERMISSIONS)[number]
  | (typeof DISPATCHER_PERMISSIONS)[number]
  | (typeof ACCOUNTANT_PERMISSIONS)[number]
  | (typeof CLIENT_PERMISSIONS)[number]
  | typeof PLATFORM_CROSS_TENANT_PERMISSION
  | '*';

export type RoleTemplate = {
  name: string;
  permissions: readonly string[];
  isSystem: boolean;
  /** When false, role is documented but not seeded into `roles` for companies. */
  seedForCompanies: boolean;
  principal: 'staff' | 'portal' | 'platform';
};

export const ROLE_MATRIX: readonly RoleTemplate[] = [
  {
    name: PLATFORM_OWNER_ROLE_NAME,
    permissions: PLATFORM_OWNER_PERMISSIONS,
    isSystem: true,
    seedForCompanies: true,
    principal: 'platform',
  },
  {
    name: COMPANY_OWNER_ROLE_NAME,
    permissions: COMPANY_OWNER_PERMISSIONS,
    isSystem: true,
    seedForCompanies: true,
    principal: 'staff',
  },
  {
    name: MANAGER_ROLE_NAME,
    permissions: MANAGER_PERMISSIONS,
    isSystem: true,
    seedForCompanies: true,
    principal: 'staff',
  },
  {
    name: DISPATCHER_ROLE_NAME,
    permissions: DISPATCHER_PERMISSIONS,
    isSystem: true,
    seedForCompanies: true,
    principal: 'staff',
  },
  {
    name: ACCOUNTANT_ROLE_NAME,
    permissions: ACCOUNTANT_PERMISSIONS,
    isSystem: true,
    seedForCompanies: true,
    principal: 'staff',
  },
  {
    name: TECHNICIAN_ROLE_NAME,
    permissions: TECHNICIAN_PERMISSIONS,
    isSystem: true,
    seedForCompanies: true,
    principal: 'staff',
  },
  {
    name: CLIENT_ROLE_NAME,
    permissions: CLIENT_PERMISSIONS,
    isSystem: true,
    seedForCompanies: false,
    principal: 'portal',
  },
  // Legacy compatibility seeds — preserve access; do not auto-reassign users.
  {
    name: LEGACY_OWNER_ROLE_NAME,
    permissions: OWNER_PERMISSIONS,
    isSystem: true,
    seedForCompanies: true,
    principal: 'staff',
  },
  {
    name: LEGACY_ADMIN_ROLE_NAME,
    permissions: ADMIN_PERMISSIONS,
    isSystem: true,
    seedForCompanies: true,
    principal: 'staff',
  },
  {
    name: LEGACY_MEMBER_ROLE_NAME,
    permissions: MEMBER_PERMISSIONS,
    isSystem: true,
    seedForCompanies: true,
    principal: 'staff',
  },
] as const;

/** Roles inserted/synced for each company via ensureDefaultRoles / signup. */
export const DEFAULT_TEAM_ROLES = ROLE_MATRIX.filter((role) => role.seedForCompanies).map(
  (role) => ({
    name: role.name,
    permissions: [...role.permissions],
    isSystem: role.isSystem,
  }),
);

export function resolveCanonicalRoleName(roleName: string): string {
  if (roleName in LEGACY_ROLE_ALIASES) {
    return LEGACY_ROLE_ALIASES[roleName as keyof typeof LEGACY_ROLE_ALIASES];
  }
  return roleName;
}

export function isLegacyRoleName(roleName: string): boolean {
  return (
    roleName === LEGACY_OWNER_ROLE_NAME ||
    roleName === LEGACY_ADMIN_ROLE_NAME ||
    roleName === LEGACY_MEMBER_ROLE_NAME
  );
}

/** True only for canonical Platform Owner (cross-tenant). Legacy Owner is NOT platform. */
export function isPlatformOwnerRole(identity: StaffIdentity): boolean {
  return resolveCanonicalRoleName(identity.roleName) === PLATFORM_OWNER_ROLE_NAME;
}

export function isCompanyOwnerRole(identity: StaffIdentity): boolean {
  const canonical = resolveCanonicalRoleName(identity.roleName);
  return canonical === COMPANY_OWNER_ROLE_NAME || identity.roleName === LEGACY_OWNER_ROLE_NAME;
}

export function isManagerRole(identity: StaffIdentity): boolean {
  const canonical = resolveCanonicalRoleName(identity.roleName);
  return canonical === MANAGER_ROLE_NAME;
}

export function isAccountantRole(identity: StaffIdentity): boolean {
  return resolveCanonicalRoleName(identity.roleName) === ACCOUNTANT_ROLE_NAME;
}

export function isDispatcherRole(identity: StaffIdentity): boolean {
  return resolveCanonicalRoleName(identity.roleName) === DISPATCHER_ROLE_NAME;
}

export function isTechnicianRole(identity: StaffIdentity): boolean {
  return resolveCanonicalRoleName(identity.roleName) === TECHNICIAN_ROLE_NAME;
}

export function isClientRole(identity: StaffIdentity): boolean {
  return resolveCanonicalRoleName(identity.roleName) === CLIENT_ROLE_NAME;
}

/** In-tenant full access (Company Owner, Platform Owner, or wildcard permissions). */
export function hasUnrestrictedCompanyAccess(identity: StaffIdentity): boolean {
  return (
    isPlatformOwnerRole(identity) ||
    isCompanyOwnerRole(identity) ||
    identity.permissions.includes('*')
  );
}

/**
 * Cross-tenant platform access — Platform Owner role only.
 * SaaS tenant_kind=platform_owner remains a separate company-level flag.
 */
export function hasCrossTenantPlatformAccess(identity: StaffIdentity): boolean {
  return (
    isPlatformOwnerRole(identity) || identity.permissions.includes(PLATFORM_CROSS_TENANT_PERMISSION)
  );
}

/**
 * Backward-compatible alias used by existing guards.
 * Means unrestricted in-tenant access — NOT cross-tenant Platform Owner.
 */
export function isPlatformOwner(identity: StaffIdentity): boolean {
  return hasUnrestrictedCompanyAccess(identity);
}

export function resolveStaffExperience(identity: StaffIdentity): StaffExperience {
  const canonical = resolveCanonicalRoleName(identity.roleName);

  if (canonical === PLATFORM_OWNER_ROLE_NAME) return 'platform_owner';
  if (canonical === COMPANY_OWNER_ROLE_NAME || identity.roleName === LEGACY_OWNER_ROLE_NAME) {
    return 'company_owner';
  }
  if (canonical === MANAGER_ROLE_NAME) return 'manager';
  if (canonical === DISPATCHER_ROLE_NAME) return 'dispatcher';
  if (canonical === ACCOUNTANT_ROLE_NAME) return 'accountant';
  if (canonical === TECHNICIAN_ROLE_NAME) return 'technician';
  if (canonical === CLIENT_ROLE_NAME) return 'client';
  if (identity.permissions.includes('*')) return 'company_owner';
  return 'staff';
}

export function getStaffHomePath(identity: StaffIdentity): string {
  const experience = resolveStaffExperience(identity);
  switch (experience) {
    case 'technician':
      return '/mobile';
    case 'client':
      return '/my';
    case 'accountant':
      return '/finance/invoices';
    case 'platform_owner':
      return '/saas-management';
    default:
      return '/';
  }
}

/** Invite-link assignability. */
export function isInviteAssignableRoleName(roleName: string): boolean {
  return INVITE_ALLOWED_ROLE_NAMES.has(roleName);
}

/** @deprecated Use isInviteAssignableRoleName for invites. */
export function isAssignableRoleName(roleName: string): boolean {
  return isInviteAssignableRoleName(roleName);
}

export function isCompanyOwnerRoleName(roleName: string): boolean {
  return COMPANY_OWNER_ROLE_NAMES.has(roleName);
}

/**
 * Whether actor may assign targetRoleName to another user (not self).
 * - Never Platform Owner / Client / legacy Owner / legacy Admin via API
 * - Company Owner only by Platform Owner
 * - Other manual roles by Company Owner or Platform Owner
 */
export function canAssignRoleName(
  actor: StaffIdentity,
  targetRoleName: string,
): { allowed: boolean; reason?: string } {
  if (targetRoleName === PLATFORM_OWNER_ROLE_NAME) {
    return { allowed: false, reason: 'Platform Owner cannot be assigned via the application' };
  }
  if (targetRoleName === CLIENT_ROLE_NAME) {
    return { allowed: false, reason: 'Client is a portal principal, not a staff role' };
  }
  if (targetRoleName === LEGACY_OWNER_ROLE_NAME || targetRoleName === LEGACY_ADMIN_ROLE_NAME) {
    return { allowed: false, reason: 'Legacy Owner/Admin roles are closed to new assignments' };
  }
  if (targetRoleName === COMPANY_OWNER_ROLE_NAME) {
    if (!isPlatformOwnerRole(actor)) {
      return { allowed: false, reason: 'Only Platform Owner may assign Company Owner' };
    }
    return { allowed: true };
  }
  if (!MANUAL_ASSIGNABLE_ROLE_NAMES.has(targetRoleName)) {
    return { allowed: false, reason: `Role ${targetRoleName} is not manually assignable` };
  }
  if (!isPlatformOwnerRole(actor) && !isCompanyOwnerRole(actor)) {
    return { allowed: false, reason: 'Only Company Owner or Platform Owner may assign roles' };
  }
  return { allowed: true };
}

/**
 * Whether auth.companyId may access a resource owned by resourceCompanyId.
 * Platform Owner may cross tenants; everyone else must match exactly.
 */
export function canAccessTenant(
  identity: StaffIdentity & { companyId: string },
  resourceCompanyId: string,
): boolean {
  if (identity.companyId === resourceCompanyId) return true;
  return hasCrossTenantPlatformAccess(identity);
}

export function hasPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes('*')) {
    return true;
  }
  return userPermissions.includes(required);
}

export function hasAnyPermission(userPermissions: string[], required: string[]): boolean {
  return required.some((permission) => hasPermission(userPermissions, permission));
}

export function hasAgentManagePermission(userPermissions: string[]): boolean {
  return hasAnyPermission(userPermissions, ['agents:manage', 'agents:write', '*']);
}

/** Permissions technicians must never hold for owner-only modules. */
export const TECHNICIAN_DENIED_PERMISSIONS = [
  'company:manage',
  'users:manage',
  'settings:manage',
  'finance:read',
  'finance:write',
  'analytics:read',
  'analytics:write',
  'marketing:read',
  'marketing:write',
  'leads:read',
  'leads:write',
  'executive:read',
  'executive:write',
  'bi:read',
  'bi:write',
  'integrations:manage',
  'security:write',
  'platform:manage',
  'saas:manage',
  'ops:manage',
  'agents:write',
  'agents:manage',
  'mission-control',
] as const;

export function canAccessOwnerModule(
  identity: StaffIdentity,
  requiredPermissions: string[],
): boolean {
  if (hasUnrestrictedCompanyAccess(identity) || isPlatformOwnerRole(identity)) {
    return true;
  }
  if (isTechnicianRole(identity) || isClientRole(identity)) {
    return false;
  }
  return hasAnyPermission(identity.permissions, requiredPermissions);
}

export function canAccessTechnicianMobile(identity: StaffIdentity): boolean {
  if (hasUnrestrictedCompanyAccess(identity) || isTechnicianRole(identity)) {
    return true;
  }
  return hasAnyPermission(identity.permissions, [
    'mobile:read',
    'mobile:write',
    'jobs:read',
    'jobs:write',
  ]);
}

/**
 * Binding migration decisions (Batch 1A finalize).
 * Member remains manual; Owner/Admin are migrated by 0094 using tenant_kind + role name (never email).
 */
export const BINDING_ROLE_MIGRATION_DECISIONS = [
  {
    from: LEGACY_OWNER_ROLE_NAME,
    to: PLATFORM_OWNER_ROLE_NAME,
    when: 'saas_tenant_profiles.tenant_kind = platform_owner',
    authority: 'immutable user.id + company.id + tenant_kind (never email)',
  },
  {
    from: LEGACY_OWNER_ROLE_NAME,
    to: COMPANY_OWNER_ROLE_NAME,
    when: 'normal / customer tenant (or missing saas profile)',
    authority: 'immutable user.id + company.id + tenant_kind (never email)',
  },
  {
    from: LEGACY_ADMIN_ROLE_NAME,
    to: MANAGER_ROLE_NAME,
    when: 'all tenants',
    authority: 'immutable user.id + role name',
  },
  {
    from: LEGACY_MEMBER_ROLE_NAME,
    to: LEGACY_MEMBER_ROLE_NAME,
    when: 'all tenants — retain until manual reassignment',
    authority: 'manual Users & Access only',
  },
] as const;

/** @deprecated Binding decisions supersede pending guesses — Member still manual. */
export const PENDING_USER_MAPPING_DECISIONS = [
  {
    from: LEGACY_MEMBER_ROLE_NAME,
    reason: 'Retain as restricted Legacy Member until manually reassigned in Users & Access.',
  },
] as const;
