import { useEffect, useRef } from 'react';
import type { TenantBackgroundWorkStatusResponse } from '@titan/shared';
import { fetchBackgroundWorkStatus } from '../lib/background-work-api-client';
import { invalidateAfterXeroSyncSettled } from '../lib/cache-invalidation';
import { useAuth } from '../lib/auth-context';
import { useStaffCacheScope } from '../lib/use-scoped-cached-query';

const ACTIVE_POLL_MS = 15_000;
const IDLE_POLL_MS = 60_000;

function isXeroSyncActive(status: TenantBackgroundWorkStatusResponse): boolean {
  if (status.integrationAutoSync === 'updating' || status.integrationAutoSync === 'waiting') {
    return true;
  }

  return status.items.some(
    (item) =>
      item.kind === 'integration_sync' &&
      item.workType.includes('xero') &&
      (item.uiState === 'updating' || item.uiState === 'waiting'),
  );
}

/** Poll background work and refetch finance/CRM caches when Xero sync settles. */
export function useXeroSyncCacheRefresh(): void {
  const { accessToken } = useAuth();
  const scope = useStaffCacheScope();
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (!accessToken || !scope) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (!accessToken || !scope) {
        return;
      }

      try {
        const status = await fetchBackgroundWorkStatus(accessToken);
        if (cancelled) {
          return;
        }

        const active = isXeroSyncActive(status);
        if (wasActiveRef.current && !active) {
          invalidateAfterXeroSyncSettled(scope, accessToken);
        }
        wasActiveRef.current = active;

        timer = setTimeout(poll, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
      } catch {
        if (!cancelled) {
          timer = setTimeout(poll, IDLE_POLL_MS);
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [accessToken, scope]);
}
