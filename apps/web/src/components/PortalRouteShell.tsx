import { type ReactNode } from 'react';
import { PortalAuthProvider } from '../lib/portal-auth-context';

export function PortalRouteShell({ children }: { children: ReactNode }) {
  return <PortalAuthProvider>{children}</PortalAuthProvider>;
}
