import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';
import { getStaffHomePath } from '@titan/auth/browser';
import { useAuth } from '../lib/auth-context';
import { toStaffIdentity } from '../lib/role-experience';

type ProtectedRouteProps = {
  children: ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/auth/login');
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

type GuestRouteProps = {
  children: ReactNode;
};

export function GuestRoute({ children }: GuestRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      setLocation(getStaffHomePath(toStaffIdentity(user)));
    }
  }, [isAuthenticated, isLoading, setLocation, user]);

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
