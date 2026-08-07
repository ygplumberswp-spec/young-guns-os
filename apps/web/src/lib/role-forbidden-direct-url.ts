import {
  canAccessTechnicianMobile,
  getStaffHomePath,
  isTechnicianRole,
  resolveStaffExperience,
  type StaffIdentity,
} from '@titan/auth/browser';
import {
  ACCOUNTANT_BLOCKED_ROUTE_PREFIXES,
  DISPATCHER_BLOCKED_ROUTE_PREFIXES,
  OWNER_ONLY_ROUTE_PREFIXES,
  TECHNICIAN_ALLOWED_ROUTE_PREFIXES,
  TECHNICIAN_FORBIDDEN_MOBILE_PATHS,
} from '@titan/shared';

export type ForbiddenDirectUrlDecision =
  | { allowed: true }
  | { allowed: false; redirectPath: string };

function matchesRoutePrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isOwnerOnlyPath(path: string): boolean {
  return OWNER_ONLY_ROUTE_PREFIXES.some((prefix) => matchesRoutePrefix(path, prefix));
}

export function isTechnicianAllowedPath(path: string): boolean {
  return TECHNICIAN_ALLOWED_ROUTE_PREFIXES.some((prefix) => matchesRoutePrefix(path, prefix));
}

/** Technician-only denylist inside /mobile* (owners may still peek for support). */
export function isTechnicianForbiddenMobilePath(path: string): boolean {
  return TECHNICIAN_FORBIDDEN_MOBILE_PATHS.some((prefix) => matchesRoutePrefix(path, prefix));
}

export function isDispatcherBlockedPath(path: string): boolean {
  return DISPATCHER_BLOCKED_ROUTE_PREFIXES.some((prefix) => matchesRoutePrefix(path, prefix));
}

export function isAccountantBlockedPath(path: string): boolean {
  return ACCOUNTANT_BLOCKED_ROUTE_PREFIXES.some((prefix) => matchesRoutePrefix(path, prefix));
}

/**
 * Owner/staff desktop guard — blocks direct URL access to forbidden modules by role.
 * Mirrors `OwnerStaffRoute` redirect contract for Playwright and unit tests.
 */
export function evaluateOwnerStaffDirectUrl(
  identity: StaffIdentity,
  pathname: string,
): ForbiddenDirectUrlDecision {
  const experience = resolveStaffExperience(identity);

  /**
   * YG-CUTOVER-001E — Technicians never use the staff AppLayout nest.
   * Deny-by-default (including /communications-hub and other modules missing
   * from OWNER_ONLY_ROUTE_PREFIXES). /mobile* may pass through for nested
   * routing edge cases; TechnicianRoute owns field mobile.
   */
  if (experience === 'technician') {
    if (isTechnicianAllowedPath(pathname) && !isTechnicianForbiddenMobilePath(pathname)) {
      return { allowed: true };
    }
    return { allowed: false, redirectPath: getStaffHomePath(identity) };
  }

  if (experience === 'dispatcher' && isDispatcherBlockedPath(pathname)) {
    return { allowed: false, redirectPath: '/' };
  }

  if (experience === 'accountant' && isAccountantBlockedPath(pathname)) {
    return { allowed: false, redirectPath: getStaffHomePath(identity) };
  }

  return { allowed: true };
}

/**
 * Field mobile guard — blocks non-mobile roles from guessing `/mobile/*` URLs.
 * Mirrors `TechnicianRoute` redirect contract.
 */
export function evaluateTechnicianDirectUrl(
  identity: StaffIdentity,
  pathname: string,
): ForbiddenDirectUrlDecision {
  if (!canAccessTechnicianMobile(identity)) {
    return { allowed: false, redirectPath: '/' };
  }

  // Technicians: stay on /mobile* and never open denylisted analytics surfaces.
  if (isTechnicianRole(identity)) {
    if (!isTechnicianAllowedPath(pathname) || isTechnicianForbiddenMobilePath(pathname)) {
      return { allowed: false, redirectPath: '/mobile' };
    }
    return { allowed: true };
  }

  // Owners/support may open field mobile including Performance peek.
  if (!isTechnicianAllowedPath(pathname)) {
    return { allowed: false, redirectPath: '/' };
  }

  return { allowed: true };
}
