import type { QueryCacheScope } from '@titan/shared';
import { useMemo } from 'react';
import { useAuth } from './auth-context';
import { usePortalAuth } from './portal-auth-context';
import {
  useCachedQuery,
  type UseCachedQueryOptions,
  type UseCachedQueryResult,
} from './use-cached-query';

export function useStaffCacheScope(): QueryCacheScope | null {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user) return null;
    return {
      tenantId: user.companyId,
      actorId: user.id,
      actorKind: 'staff',
      roleName: user.roleName,
    };
  }, [user]);
}

export function usePortalCacheScope(): QueryCacheScope | null {
  const { user } = usePortalAuth();

  return useMemo(() => {
    if (!user) return null;
    return {
      tenantId: user.companyId,
      actorId: user.id,
      actorKind: 'portal',
      customerId: user.customerId,
    };
  }, [user]);
}

export function useStaffCachedQuery<T>(
  options: Omit<UseCachedQueryOptions<T>, 'accessToken' | 'scope'>,
): UseCachedQueryResult<T> {
  const { accessToken } = useAuth();
  const scope = useStaffCacheScope();
  return useCachedQuery({ ...options, accessToken, scope });
}

export function usePortalCachedQuery<T>(
  options: Omit<UseCachedQueryOptions<T>, 'accessToken' | 'scope'>,
): UseCachedQueryResult<T> {
  const { accessToken } = usePortalAuth();
  const scope = usePortalCacheScope();
  return useCachedQuery({ ...options, accessToken, scope });
}
