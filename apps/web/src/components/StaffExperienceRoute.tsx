import { type ReactNode, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  canAccessTechnicianMobile,
  getStaffHomePath,
  isTechnicianRole,
  resolveStaffExperience,
  type StaffIdentity,
} from '@titan/auth/browser';
import {
  ACCOUNTANT_BLOCKED_ROUTE_PREFIXES,
  OWNER_ONLY_ROUTE_PREFIXES,
  DISPATCHER_BLOCKED_ROUTE_PREFIXES,
  TECHNICIAN_ALLOWED_ROUTE_PREFIXES,
} from '@titan/shared';
import { useAuth } from '../lib/auth-context';
import { toAppAbsoluteHref, useAppPathname } from '../lib/nested-routing';

function toStaffIdentity(user: { roleName: string; permissions: string[] }): StaffIdentity {
  return { roleName: user.roleName, permissions: user.permissions };
}

function isOwnerOnlyPath(path: string): boolean {
  return OWNER_ONLY_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function isTechnicianAllowedPath(path: string): boolean {
  return TECHNICIAN_ALLOWED_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function isDispatcherBlockedPath(path: string): boolean {
  return DISPATCHER_BLOCKED_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function isAccountantBlockedPath(path: string): boolean {
  return ACCOUNTANT_BLOCKED_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

type OwnerStaffRouteProps = {
  children: ReactNode;
};

/** Blocks technicians from owner/staff desktop modules — redirects to role home. */
export function OwnerStaffRoute({ children }: OwnerStaffRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const pathname = useAppPathname();

  const experience = useMemo(
    () => (user ? resolveStaffExperience(toStaffIdentity(user)) : null),
    [user],
  );

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    const identity = toStaffIdentity(user);
    if (experience === 'technician' && (isOwnerOnlyPath(pathname) || pathname === '/')) {
      setLocation(toAppAbsoluteHref(getStaffHomePath(identity)));
      return;
    }
    if (experience === 'dispatcher' && isDispatcherBlockedPath(pathname)) {
      setLocation(toAppAbsoluteHref('/'));
      return;
    }
    if (experience === 'accountant' && isAccountantBlockedPath(pathname)) {
      setLocation(toAppAbsoluteHref(getStaffHomePath(identity)));
    }
  }, [experience, isAuthenticated, isLoading, pathname, setLocation, user]);

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (experience === 'technician' && (isOwnerOnlyPath(pathname) || pathname === '/')) {
    return null;
  }

  if (experience === 'dispatcher' && isDispatcherBlockedPath(pathname)) {
    return null;
  }

  if (experience === 'accountant' && isAccountantBlockedPath(pathname)) {
    return null;
  }

  return children;
}

type TechnicianRouteProps = {
  children: ReactNode;
};

/** Ensures only technicians and company/platform owners access field mobile routes. */
export function TechnicianRoute({ children }: TechnicianRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const pathname = useAppPathname();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (!canAccessTechnicianMobile(toStaffIdentity(user))) {
      setLocation(toAppAbsoluteHref('/'));
      return;
    }
    if (!isTechnicianRole(toStaffIdentity(user)) && !isTechnicianAllowedPath(pathname)) {
      setLocation(toAppAbsoluteHref('/'));
    }
  }, [isAuthenticated, isLoading, pathname, setLocation, user]);

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>;
  }

  if (!isAuthenticated || !user || !canAccessTechnicianMobile(toStaffIdentity(user))) {
    return null;
  }

  return children;
}
