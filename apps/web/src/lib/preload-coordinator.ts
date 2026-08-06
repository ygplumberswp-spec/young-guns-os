import { useEffect, useMemo, useRef } from 'react';
import type { QueryCacheScope } from '@titan/shared';
import { resolveStaffExperience } from '@titan/auth/browser';
import { useAuth } from './auth-context';
import { usePortalAuth } from './portal-auth-context';
import { useAppPathname } from './nested-routing';
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
  const pathname = useAppPathname();
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
    if (pathname !== home && pathname !== '/') {
      return;
    }

    // Defer idle prefetch on owner dashboard so executive summary wins the network (PERF-001).
    const idleDelayMs = pathname === '/' ? 3_500 : 1_200;

    const timer = window.setTimeout(() => {
      startedRef.current = true;
      startIdleRoutePreload(context, pathname);
    }, idleDelayMs);

    return () => window.clearTimeout(timer);
  }, [context, pathname]);
}

export function usePortalIdlePreload(): void {
  const context = usePortalPreloadContext();
  const pathname = useAppPathname();
  const startedRef = useRef(false);

  useEffect(() => {
    // Nest-relative portal home is `/`; app pathname remains `/portal`.
    if (!context || startedRef.current || pathname !== '/portal') {
      return;
    }

    const timer = window.setTimeout(() => {
      startedRef.current = true;
      startIdleRoutePreload(context, pathname);
    }, 1_200);

    return () => window.clearTimeout(timer);
  }, [context, pathname]);
}

export function useNavTiming(): void {
  const pathname = useAppPathname();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (previousPath.current === pathname) {
      return;
    }

    const kind = previousPath.current === null ? 'cold' : 'warm';
    recordNavVisit(pathname, kind);
    previousPath.current = pathname;
  }, [pathname]);
}

export function resetPreloadSession(): void {
  resetRoutePrefetchState();
  resetDataPrefetchState();
  cancelAllBackgroundTasks();
}
