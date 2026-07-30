import { type ReactNode, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  canAccessTechnicianMobile,
  getStaffHomePath,
  isTechnicianRole,
  resolveStaffExperience,
  type StaffIdentity,
} from '@titan/auth/browser';
import { OWNER_ONLY_ROUTE_PREFIXES, TECHNICIAN_ALLOWED_ROUTE_PREFIXES } from '@titan/shared';
import { useAuth } from '../lib/auth-context';

function toStaffIdentity(user: { roleName: string; permissions: string[] }): StaffIdentity {
  return { roleName: user.roleName, permissions: user.permissions };
}

function isOwnerOnlyPath(path: string): boolean {
  return OWNER_ONLY_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isTechnicianAllowedPath(path: string): boolean {
  return TECHNICIAN_ALLOWED_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

type OwnerStaffRouteProps = {
  children: ReactNode;
};

/** Blocks technicians from owner/staff desktop modules — redirects to /mobile. */
export function OwnerStaffRoute({ children }: OwnerStaffRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  const experience = useMemo(
    () => (user ? resolveStaffExperience(toStaffIdentity(user)) : null),
    [user],
  );

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user || experience !== 'technician') return;
    if (isOwnerOnlyPath(location) || location === '/') {
      setLocation(getStaffHomePath(toStaffIdentity(user)));
    }
  }, [experience, isAuthenticated, isLoading, location, setLocation, user]);

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (experience === 'technician' && (isOwnerOnlyPath(location) || location === '/')) {
    return null;
  }

  return children;
}

type TechnicianRouteProps = {
  children: ReactNode;
};

/** Ensures only technicians and platform owners access field mobile routes. */
export function TechnicianRoute({ children }: TechnicianRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (!canAccessTechnicianMobile(toStaffIdentity(user))) {
      setLocation('/');
      return;
    }
    if (!isTechnicianRole(toStaffIdentity(user)) && !isTechnicianAllowedPath(location)) {
      setLocation('/');
    }
  }, [isAuthenticated, isLoading, location, setLocation, user]);

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>;
  }

  if (!isAuthenticated || !user || !canAccessTechnicianMobile(toStaffIdentity(user))) {
    return null;
  }

  return children;
}
