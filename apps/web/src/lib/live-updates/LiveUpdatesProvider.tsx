import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { buildQueryKey, invalidateQueryCachePrefix } from '../query-cache';
import { useAuth } from '../auth-context';
import { useStaffCacheScope } from '../use-scoped-cached-query';
import {
  computeReconnectDelayMs,
  liveUpdateInvalidationPrefixes,
  parseLiveUpdateSseChunk,
} from './live-update-map';
import { hasDirtyForms } from './dirty-form-registry';
import type { LiveConnectionState, LiveUpdateEvent } from './live-updates-types';

type LiveUpdatesContextValue = {
  state: LiveConnectionState;
  pendingRefresh: boolean;
  acknowledgePendingRefresh: () => void;
  applyPendingRefresh: () => void;
};

const LiveUpdatesContext = createContext<LiveUpdatesContextValue | null>(null);

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const scope = useStaffCacheScope();
  const [state, setState] = useState<LiveConnectionState>('disconnected');
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pollingRef = useRef<number | null>(null);
  const pendingPrefixesRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef(false);

  const invalidatePrefixes = useCallback(
    (prefixes: string[]) => {
      if (!accessToken) return;
      for (const prefix of prefixes) {
        invalidateQueryCachePrefix(buildQueryKey(accessToken, prefix, scope));
      }
    },
    [accessToken, scope],
  );

  const flushPendingPrefixes = useCallback(() => {
    const prefixes = [...pendingPrefixesRef.current];
    pendingPrefixesRef.current.clear();
    if (prefixes.length) invalidatePrefixes(prefixes);
  }, [invalidatePrefixes]);

  const handleEvent = useCallback(
    (event: LiveUpdateEvent) => {
      const prefixes = liveUpdateInvalidationPrefixes(event);
      if (!prefixes.length) return;

      if (hasDirtyForms()) {
        for (const prefix of prefixes) pendingPrefixesRef.current.add(prefix);
        setPendingRefresh(true);
        return;
      }

      invalidatePrefixes(prefixes);
      setState('live');
    },
    [invalidatePrefixes],
  );

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    clearPolling();
    pollingRef.current = window.setInterval(() => {
      if (document.hidden || !pendingPrefixesRef.current.size) return;
      setState('stale');
    }, 15000);
  }, [clearPolling]);

  const connect = useCallback(async () => {
    if (!accessToken || !isAuthenticated || inflightRef.current) return;
    inflightRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState('syncing');

    try {
      const response = await fetch('/api/v1/live-updates/stream', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('stream unavailable');
      }

      reconnectAttemptRef.current = 0;
      clearPolling();
      setState('live');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseLiveUpdateSseChunk(buffer);
        buffer = parsed.remainder;
        for (const event of parsed.events) handleEvent(event);
      }

      throw new Error('stream closed');
    } catch (error) {
      if (controller.signal.aborted) return;
      setState('degraded');
      startPolling();
      const delay = computeReconnectDelayMs(reconnectAttemptRef.current);
      reconnectAttemptRef.current += 1;
      window.setTimeout(() => {
        inflightRef.current = false;
        void connect();
      }, delay);
      return;
    } finally {
      inflightRef.current = false;
    }
  }, [accessToken, clearPolling, handleEvent, isAuthenticated, startPolling]);

  useEffect(() => {
    if (!accessToken || !isAuthenticated) {
      setState('disconnected');
      abortRef.current?.abort();
      clearPolling();
      return;
    }

    void connect();

    function onVisibilityChange() {
      if (document.hidden) {
        clearPolling();
        return;
      }
      if (pendingPrefixesRef.current.size && !hasDirtyForms()) {
        flushPendingPrefixes();
      }
      if (state === 'degraded' || state === 'stale') void connect();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      abortRef.current?.abort();
      clearPolling();
    };
  }, [accessToken, clearPolling, connect, flushPendingPrefixes, isAuthenticated]);

  const value = useMemo<LiveUpdatesContextValue>(
    () => ({
      state,
      pendingRefresh,
      acknowledgePendingRefresh: () => setPendingRefresh(false),
      applyPendingRefresh: () => {
        flushPendingPrefixes();
        setPendingRefresh(false);
        setState('live');
      },
    }),
    [flushPendingPrefixes, pendingRefresh, state],
  );

  return <LiveUpdatesContext.Provider value={value}>{children}</LiveUpdatesContext.Provider>;
}

export function useLiveUpdatesContext(): LiveUpdatesContextValue {
  const ctx = useContext(LiveUpdatesContext);
  if (!ctx) {
    return {
      state: 'disconnected',
      pendingRefresh: false,
      acknowledgePendingRefresh: () => {},
      applyPendingRefresh: () => {},
    };
  }
  return ctx;
}

export function LiveUpdatesBanner() {
  const { pendingRefresh, applyPendingRefresh, acknowledgePendingRefresh } = useLiveUpdatesContext();
  if (!pendingRefresh) return null;

  return (
    <div className="live-updates-banner" role="status">
      <span>New data is available.</span>
      <button type="button" onClick={applyPendingRefresh}>
        Refresh
      </button>
      <button type="button" onClick={acknowledgePendingRefresh}>
        Dismiss
      </button>
    </div>
  );
}
