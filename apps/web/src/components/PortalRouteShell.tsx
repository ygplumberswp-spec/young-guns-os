import { type ReactNode } from 'react';
import { PortalAuthProvider } from '../lib/portal-auth-context';
import { PortalPreloadCoordinator } from './PortalPreloadCoordinator';

export function PortalRouteShell({ children }: { children: ReactNode }) {
  return (
    <PortalAuthProvider>
      <PortalPreloadCoordinator />
      {children}
    </PortalAuthProvider>
  );
}
