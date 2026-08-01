import { useCallback, useEffect, useRef, useState } from 'react';
import type { FleetLiveMapSnapshot } from '@titan/shared';
import { fetchFleetLiveMap } from '../../lib/fleet-api';

const LIVE_POLL_MS = 3_000;
const HIDDEN_POLL_MS = 60_000;

type UseFleetLiveMapOptions = {
  accessToken: string | null;
  enabled?: boolean;
};

type UseFleetLiveMapResult = {
  snapshot: FleetLiveMapSnapshot | null;
  isPolling: boolean;
  lastFetchedAt: string | null;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useFleetLiveMap({
  accessToken,
  enabled = true,
}: UseFleetLiveMapOptions): UseFleetLiveMapResult {
  const [snapshot, setSnapshot] = useState<FleetLiveMapSnapshot | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const lastPayloadRef = useRef<string>('');

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
        const next = await fetchFleetLiveMap(accessToken);
        const serialized = JSON.stringify(next);
        if (serialized !== lastPayloadRef.current) {
          lastPayloadRef.current = serialized;
          setSnapshot(next);
        }
        setLastFetchedAt(new Date().toISOString());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to refresh fleet live map');
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
    snapshot,
    isPolling,
    lastFetchedAt,
    error,
    refresh,
  };
}
