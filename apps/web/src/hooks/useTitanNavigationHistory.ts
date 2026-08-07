import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { rememberLastModule } from '../lib/back-navigation';

export type TitanNavState = {
  tab?: string;
  search?: string;
  filters?: Record<string, string>;
  pagination?: { page?: number; pageSize?: number };
  scrollY?: number;
  calendarDate?: string;
};

const NAV_STATE_PREFIX = 'titan:nav-state:';
const SCROLL_STORAGE_PREFIX = 'titan:scroll:';

function navStateKey(pathname: string): string {
  return `${NAV_STATE_PREFIX}${pathname}`;
}

function scrollStateKey(pathname: string): string {
  return `${SCROLL_STORAGE_PREFIX}${pathname}`;
}

export function readNavState(pathname: string): TitanNavState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(navStateKey(pathname));
    if (!raw) return null;
    return JSON.parse(raw) as TitanNavState;
  } catch {
    return null;
  }
}

export function writeNavState(pathname: string, patch: Partial<TitanNavState>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readNavState(pathname) ?? {};
    sessionStorage.setItem(navStateKey(pathname), JSON.stringify({ ...current, ...patch }));
  } catch {
    // ignore quota errors
  }
}

export function captureScrollForPath(pathname: string): void {
  if (typeof window === 'undefined') return;
  writeNavState(pathname, { scrollY: window.scrollY });
  try {
    sessionStorage.setItem(scrollStateKey(pathname), String(window.scrollY));
  } catch {
    // ignore
  }
}

export function restoreScrollForPath(pathname: string): void {
  if (typeof window === 'undefined') return;
  const state = readNavState(pathname);
  const stored = state?.scrollY ?? Number(sessionStorage.getItem(scrollStateKey(pathname)));
  if (!Number.isFinite(stored) || stored <= 0) return;

  requestAnimationFrame(() => {
    window.scrollTo({ top: stored, behavior: 'auto' });
  });
}

export function stageNavStateForFallback(fallback: string): void {
  const state = readNavState(fallback);
  if (!state?.scrollY) return;
  try {
    sessionStorage.setItem(scrollStateKey(fallback), String(state.scrollY));
  } catch {
    // ignore
  }
}

export function useTitanNavigationHistory() {
  const [location] = useLocation();
  const previousPathRef = useRef(location);

  useEffect(() => {
    rememberLastModule(location);
    restoreScrollForPath(location);
    const previous = previousPathRef.current;
    if (previous !== location) {
      captureScrollForPath(previous);
      previousPathRef.current = location;
    }
  }, [location]);

  useEffect(() => {
    function handleBeforeUnload() {
      captureScrollForPath(location);
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [location]);

  useEffect(() => {
    function handlePopState() {
      restoreScrollForPath(window.location.pathname);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const saveListState = useCallback(
    (patch: Partial<TitanNavState>) => {
      writeNavState(location, patch);
    },
    [location],
  );

  return { location, saveListState, readNavState: () => readNavState(location) };
}

export function TitanNavigationHistoryProvider({ children }: { children: React.ReactNode }) {
  useTitanNavigationHistory();
  return children;
}
