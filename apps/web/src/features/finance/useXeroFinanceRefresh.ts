import { useCallback, useEffect, useRef, useState } from 'react';
import type { XeroFinanceFreshnessSummary, XeroIncrementalQuoteRefreshResult } from '@titan/shared';
import {
  fetchXeroFinanceFreshness,
  refreshXeroQuotesIncremental,
} from '../../lib/integrations-api';

const VISIBLE_REFRESH_MS = 90_000;
const HIDDEN_REFRESH_MS = 300_000;

type UseXeroFinanceRefreshOptions = {
  accessToken: string | null;
  enabled: boolean;
  surface: 'quotes' | 'invoices';
};

export function useXeroFinanceRefresh({
  accessToken,
  enabled,
  surface,
}: UseXeroFinanceRefreshOptions) {
  const [freshness, setFreshness] = useState<XeroFinanceFreshnessSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inflightRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const loadFreshness = useCallback(async () => {
    if (!accessToken || !enabled) return;
    const summary = await fetchXeroFinanceFreshness(accessToken);
    setFreshness(summary);
  }, [accessToken, enabled]);

  const runQuietRefresh = useCallback(async () => {
    if (!accessToken || !enabled || inflightRef.current) return;
    if (surface !== 'quotes') {
      await loadFreshness();
      return;
    }

    inflightRef.current = true;
    setRefreshing(true);
    try {
      const result: XeroIncrementalQuoteRefreshResult =
        await refreshXeroQuotesIncremental(accessToken);
      await loadFreshness();
      return result;
    } finally {
      inflightRef.current = false;
      setRefreshing(false);
    }
  }, [accessToken, enabled, loadFreshness, surface]);

  const schedule = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    const delay = document.visibilityState === 'visible' ? VISIBLE_REFRESH_MS : HIDDEN_REFRESH_MS;
    timerRef.current = window.setTimeout(() => {
      void runQuietRefresh().finally(schedule);
    }, delay);
  }, [runQuietRefresh]);

  useEffect(() => {
    if (!enabled) return;
    void loadFreshness();
    void runQuietRefresh();
    schedule();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void runQuietRefresh();
      }
      schedule();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [enabled, loadFreshness, runQuietRefresh, schedule]);

  const surfaceFreshness =
    surface === 'quotes' ? freshness?.quotes : freshness?.invoices;

  return {
    label: refreshing ? 'Refreshing quietly' : (surfaceFreshness?.label ?? null),
    refreshing,
    refreshQuietly: runQuietRefresh,
    freshness,
  };
}
