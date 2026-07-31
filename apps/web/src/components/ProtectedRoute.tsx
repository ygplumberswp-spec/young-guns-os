import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';
import { LoadingState } from '@titan/ui';
import { getStaffHomePath } from '@titan/auth/browser';
import { useAuth } from '../lib/auth-context';
import { toAppAbsoluteHref } from '../lib/nested-routing';
import { toStaffIdentity } from '../lib/role-experience';

type ProtectedRouteProps = {
  children: ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, sessionBootstrap } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Only label true refresh rejections as expired — missing/unreachable are plain sign-in.
      const href =
        sessionBootstrap === 'expired'
          ? '/auth/login?reason=session_expired'
          : '/auth/login';
      setLocation(toAppAbsoluteHref(href));
    }
  }, [isAuthenticated, isLoading, sessionBootstrap, setLocation]);

  if (isLoading) {
    return (
      <div style={{ padding: '2rem' }}>
        <LoadingState label="Opening TITAN…" />
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

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      setLocation(toAppAbsoluteHref(getStaffHomePath(toStaffIdentity(user))));
    }
  }, [isAuthenticated, isLoading, setLocation, user]);

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
