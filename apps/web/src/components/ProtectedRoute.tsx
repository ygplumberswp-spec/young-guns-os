import { type ReactNode, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { LoadingState } from '@titan/ui';
import { useAuth } from '../lib/auth-context';
import { toAppAbsoluteHref, useAppPathname } from '../lib/nested-routing';
import {
  clearStaffAuthReturnPath,
  resolveStaffPostLoginPath,
  staffAuthReturnFromSearch,
} from '../lib/staff-auth-return-routing';
import {
  isSessionExpiredLoginReason,
  staffLoginRedirectHref,
} from '../lib/session-expiry-routing';

type ProtectedRouteProps = {
  children: ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, sessionBootstrap } = useAuth();
  const [, setLocation] = useLocation();
  const pathname = useAppPathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Session expiry → role home after re-auth (no deep-page restore).
      // Missing/unreachable may keep returnTo for intentional deep links.
      if (sessionBootstrap === 'expired') {
        clearStaffAuthReturnPath();
        setLocation(staffLoginRedirectHref('expired'));
        return;
      }
      setLocation(staffLoginRedirectHref(sessionBootstrap, pathname));
    }
  }, [isAuthenticated, isLoading, pathname, sessionBootstrap, setLocation]);

  if (isLoading) {
    return (
      <div style={{ padding: '2rem' }}>
        <LoadingState label="Restoring Your Session…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return children;
}

type GuestRouteProps = {
  children: ReactNode;
};

export function GuestRoute({ children }: GuestRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const reason = new URLSearchParams(search).get('reason');
      if (isSessionExpiredLoginReason(reason)) {
        clearStaffAuthReturnPath();
        setLocation(toAppAbsoluteHref(resolveStaffPostLoginPath(user, null)));
        return;
      }
      staffAuthReturnFromSearch(search);
      setLocation(toAppAbsoluteHref(resolveStaffPostLoginPath(user)));
    }
  }, [isAuthenticated, isLoading, search, setLocation, user]);

  if (isLoading) {
    return (
      <div className="auth-stage">
        <LoadingState label="Opening TITAN…" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return children;
}
