import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import type { QueryCacheScope } from '@titan/shared';
import { resolveStaffExperience } from '@titan/auth/browser';
import { useAuth } from './auth-context';
import { usePortalAuth } from './portal-auth-context';
import {
  resetRoutePrefetchState,
  startIdleRoutePreload,
  type PortalPreloadContext,
  type StaffPreloadContext,
} from './route-prefetch-registry';
import { resetDataPrefetchState } from './data-prefetch';
import { cancelAllBackgroundTasks } from './background-scheduler';
import { recordNavVisit } from './nav-performance';

export function useStaffPreloadContext(): StaffPreloadContext | null {
  const { user, accessToken } = useAuth();

  return useMemo(() => {
    if (!user || !accessToken) {
      return null;
    }

    const scope: QueryCacheScope = {
      tenantId: user.companyId,
      actorId: user.id,
      actorKind: 'staff',
      roleName: user.roleName,
    };

    return {
      kind: 'staff' as const,
      user,
      accessToken,
      scope,
    };
  }, [user, accessToken]);
}

export function usePortalPreloadContext(): PortalPreloadContext | null {
  const { user, accessToken } = usePortalAuth();

  return useMemo(() => {
    if (!user || !accessToken) {
      return null;
    }

    const scope: QueryCacheScope = {
      tenantId: user.companyId,
      actorId: user.id,
      actorKind: 'portal',
      customerId: user.customerId,
    };

    return {
      kind: 'portal' as const,
      user,
      accessToken,
      scope,
    };
  }, [user, accessToken]);
}

export function useStaffIdlePreload(): void {
  const context = useStaffPreloadContext();
  const [location] = useLocation();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!context || startedRef.current) {
      return;
    }

    const experience = resolveStaffExperience({
      roleName: context.user.roleName,
      permissions: context.user.permissions,
    });

    const home = experience === 'technician' ? '/mobile' : '/';
    if (location !== home && location !== '/') {
      return;
    }

    const timer = window.setTimeout(() => {
      startedRef.current = true;
      startIdleRoutePreload(context, location);
    }, 1_200);

    return () => window.clearTimeout(timer);
  }, [context, location]);
}

export function usePortalIdlePreload(): void {
  const context = usePortalPreloadContext();
  const [location] = useLocation();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!context || startedRef.current || location !== '/portal') {
      return;
    }

    const timer = window.setTimeout(() => {
      startedRef.current = true;
      startIdleRoutePreload(context, location);
    }, 1_200);

    return () => window.clearTimeout(timer);
  }, [context, location]);
}

export function useNavTiming(): void {
  const [location] = useLocation();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (previousPath.current === location) {
      return;
    }

    const kind = previousPath.current === null ? 'cold' : 'warm';
    recordNavVisit(location, kind);
    previousPath.current = location;
  }, [location]);
}

export function resetPreloadSession(): void {
  resetRoutePrefetchState();
  resetDataPrefetchState();
  cancelAllBackgroundTasks();
}
