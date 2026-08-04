/**
 * Staff experience resolution — delegates to the canonical RBAC matrix.
 */

export type { StaffExperience, StaffIdentity } from './rbac-matrix.js';

export {
  resolveStaffExperience,
  isPlatformOwner,
  isPlatformOwnerRole,
  isCompanyOwnerRole,
  canWriteCompanyMemory,
  isManagerRole,
  isAccountantRole,
  isDispatcherRole,
  isTechnicianRole,
  isClientRole,
  hasUnrestrictedCompanyAccess,
  hasCrossTenantPlatformAccess,
  getStaffHomePath,
  canAccessOwnerModule,
  canAccessTechnicianMobile,
  canAccessTenant,
  resolveCanonicalRoleName,
  isAssignableRoleName,
  isInviteAssignableRoleName,
  isCompanyOwnerRoleName,
  canAssignRoleName,
  TECHNICIAN_DENIED_PERMISSIONS,
  OWNER_ROLE_NAME,
  ADMIN_ROLE_NAME,
  MEMBER_ROLE_NAME,
  TECHNICIAN_ROLE_NAME,
  DISPATCHER_ROLE_NAME,
  PLATFORM_OWNER_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  MANAGER_ROLE_NAME,
  ACCOUNTANT_ROLE_NAME,
  CLIENT_ROLE_NAME,
} from './rbac-matrix.js';
