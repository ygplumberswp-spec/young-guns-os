import { useCallback, useEffect, useRef, useState } from 'react';
import type { FleetTrackingContext } from '@titan/shared';
import { fetchCartrackTracking } from '../../lib/integrations-api';

const LIVE_POLL_MS = 3_000;
const HIDDEN_POLL_MS = 60_000;
const STALE_POSITION_MS = 120_000;

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

  const isStale = useCallback((recordedAt: string) => {
    return Date.now() - new Date(recordedAt).getTime() > STALE_POSITION_MS;
  }, []);

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
        setLastFetchedAt(new Date().toISOString());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to refresh live positions');
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

    const schedule = (delayMs: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        await refresh();
        if (cancelled) return;
        const hidden = document.visibilityState !== 'visible';
        schedule(hidden ? HIDDEN_POLL_MS : LIVE_POLL_MS);
      }, delayMs);
    };

    void refresh();
    schedule(LIVE_POLL_MS);

    function handleVisibilityChange() {
      if (cancelled) return;
      schedule(document.visibilityState === 'visible' ? LIVE_POLL_MS : HIDDEN_POLL_MS);
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
