import { useCallback, useEffect, useRef, useState } from 'react';
import type { FleetTrackingContext } from '@titan/shared';
import { isFleetPositionStale } from '@titan/shared';
import { fetchCartrackTracking } from '../../lib/integrations-api';

/** Aggressive poll only while Cartrack live polling is allowed. */
const LIVE_POLL_MS = 3_000;
const HIDDEN_POLL_MS = 60_000;
/** When disconnected / credentials missing — slow health check only. */
const DISCONNECTED_POLL_MS = 60_000;

type UseCartrackLivePositionsOptions = {
  accessToken: string | null;
  enabled?: boolean;
};

type UseCartrackLivePositionsResult = {
  tracking: FleetTrackingContext | null;
  isPolling: boolean;
  lastFetchedAt: string | null;
  error: string | null;
  isStale: (recordedAt: string) => boolean;
  refresh: () => Promise<void>;
};

export function useCartrackLivePositions({
  accessToken,
  enabled = true,
}: UseCartrackLivePositionsOptions): UseCartrackLivePositionsResult {
  const [tracking, setTracking] = useState<FleetTrackingContext | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const liveAllowedRef = useRef(false);

  const isStale = useCallback((recordedAt: string) => isFleetPositionStale(recordedAt), []);

  const refresh = useCallback(async () => {
    if (!accessToken || !enabled) {
      return;
    }

    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }

    const run = (async () => {
      setIsPolling(true);
      try {
        const next = await fetchCartrackTracking(accessToken);
        setTracking(next);
        liveAllowedRef.current = next.livePollingAllowed;
        setLastFetchedAt(new Date().toISOString());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to refresh vehicle positions');
      } finally {
        setIsPolling(false);
        inflightRef.current = null;
      }
    })();

    inflightRef.current = run;
    await run;
  }, [accessToken, enabled]);

  useEffect(() => {
    if (!accessToken || !enabled) {
      return;
    }

    let timer: number | undefined;
    let cancelled = false;

    const nextDelayMs = () => {
      if (document.visibilityState !== 'visible') return HIDDEN_POLL_MS;
      return liveAllowedRef.current ? LIVE_POLL_MS : DISCONNECTED_POLL_MS;
    };

    const schedule = (delayMs: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        await refresh();
        if (cancelled) return;
        schedule(nextDelayMs());
      }, delayMs);
    };

    void refresh().then(() => {
      if (!cancelled) schedule(nextDelayMs());
    });

    function handleVisibilityChange() {
      if (cancelled) return;
      schedule(nextDelayMs());
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [accessToken, enabled, refresh]);

  return {
    tracking,
    isPolling,
    lastFetchedAt,
    error,
    isStale,
    refresh,
  };
}
