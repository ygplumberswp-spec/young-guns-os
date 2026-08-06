import { type ReactNode, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { resolveStaffExperience, type StaffIdentity } from '@titan/auth/browser';
import { useAuth } from '../lib/auth-context';
import { toAppAbsoluteHref, useAppPathname } from '../lib/nested-routing';
import {
  evaluateOwnerStaffDirectUrl,
  evaluateTechnicianDirectUrl,
} from '../lib/role-forbidden-direct-url';

function toStaffIdentity(user: { roleName: string; permissions: string[] }): StaffIdentity {
  return { roleName: user.roleName, permissions: user.permissions };
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
    const decision = evaluateOwnerStaffDirectUrl(toStaffIdentity(user), pathname);
    if (!decision.allowed) {
      setLocation(toAppAbsoluteHref(decision.redirectPath));
    }
  }, [experience, isAuthenticated, isLoading, pathname, setLocation, user]);

  // ProtectedRoute already gates session bootstrap — avoid a second full-page wait here.
  if (!isAuthenticated || !user) {
    return null;
  }

  const ownerStaffDecision = evaluateOwnerStaffDirectUrl(toStaffIdentity(user), pathname);
  if (!ownerStaffDecision.allowed) {
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
    const decision = evaluateTechnicianDirectUrl(toStaffIdentity(user), pathname);
    if (!decision.allowed) {
      setLocation(toAppAbsoluteHref(decision.redirectPath));
    }
  }, [isAuthenticated, isLoading, pathname, setLocation, user]);

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>;
  }

  const technicianDecision = user
    ? evaluateTechnicianDirectUrl(toStaffIdentity(user), pathname)
    : { allowed: false as const, redirectPath: '/' };

  if (!isAuthenticated || !user || !technicianDecision.allowed) {
    return null;
  }

  return children;
}
