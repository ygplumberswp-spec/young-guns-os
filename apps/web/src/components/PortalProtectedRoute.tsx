import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';
import { usePortalAuth } from '../lib/portal-auth-context';

type PortalProtectedRouteProps = {
  children: ReactNode;
};

export function PortalProtectedRoute({ children }: PortalProtectedRouteProps) {
  const { isAuthenticated, isLoading } = usePortalAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/portal/login');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>
    );
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
      setLocation('/portal');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return children;
}
