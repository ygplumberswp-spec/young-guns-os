import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';
import { usePortalAuth } from '../lib/portal-auth-context';
import {
  portalHomeHref,
  portalLoginRedirectHref,
  toAppAbsoluteHref,
} from '../lib/portal-routing';

type PortalProtectedRouteProps = {
  children: ReactNode;
};

export function PortalProtectedRoute({ children }: PortalProtectedRouteProps) {
  const { isAuthenticated, isLoading } = usePortalAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Escape the `/my` nest with `~` so login resolves to `/my/login`, never `/my/my/login`.
      setLocation(portalLoginRedirectHref());
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return children;
}

type PortalGuestRouteProps = {
  children: ReactNode;
};

export function PortalGuestRoute({ children }: PortalGuestRouteProps) {
  const { isAuthenticated, isLoading } = usePortalAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Guest login route is outside the nest; still use app-absolute escape for safety.
      setLocation(toAppAbsoluteHref(portalHomeHref()));
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>;
  }

  if (isAuthenticated) {
    return null;
  }

  return children;
}
