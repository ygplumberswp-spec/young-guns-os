import { useCallback } from 'react';
import { useLocation } from 'wouter';

const PARENT_ROUTE_MAP: Array<{ match: RegExp; fallback: string | ((path: string) => string) }> = [
  { match: /^\/finance\/quotes\/new$/, fallback: '/finance/quotes' },
  {
    match: /^\/finance\/quotes\/([^/]+)\/edit$/,
    fallback: (path) => {
      const id = path.split('/')[3];
      return id ? `/finance/quotes/${id}` : '/finance/quotes';
    },
  },
  { match: /^\/finance\/quotes\/[^/]+$/, fallback: '/finance/quotes' },
  { match: /^\/finance\/invoices\/new$/, fallback: '/finance/invoices' },
  { match: /^\/finance\/invoices\/[^/]+$/, fallback: '/finance/invoices' },
  { match: /^\/jobs\/new$/, fallback: '/jobs' },
  { match: /^\/jobs\/[^/]+$/, fallback: '/jobs' },
  { match: /^\/crm\/new$/, fallback: '/crm' },
  { match: /^\/crm\/[^/]+$/, fallback: '/crm' },
  { match: /^\/drafts$/, fallback: '/' },
  { match: /^\/settings\//, fallback: '/settings' },
];

const SCROLL_STORAGE_PREFIX = 'titan:scroll:';

export function resolveSmartBackFallback(pathname: string): string {
  for (const entry of PARENT_ROUTE_MAP) {
    if (entry.match.test(pathname)) {
      return typeof entry.fallback === 'function' ? entry.fallback(pathname) : entry.fallback;
    }
  }
  return '/';
}

function restoreListState(fallback: string): void {
  try {
    const raw = sessionStorage.getItem(`titan:nav-state:${fallback}`);
    if (!raw) return;
    const state = JSON.parse(raw) as { scrollY?: number; tab?: string };
    if (typeof state.scrollY === 'number') {
      sessionStorage.setItem(`${SCROLL_STORAGE_PREFIX}${fallback}`, String(state.scrollY));
    }
  } catch {
    // ignore corrupt session state
  }
}

export function useSmartBack(explicitFallback?: string) {
  const [location, navigate] = useLocation();

  const fallback = explicitFallback ?? resolveSmartBackFallback(location);

  const goBack = useCallback(() => {
    restoreListState(fallback);
    if (typeof window !== 'undefined' && window.history.length > 1) {
      const referrer = document.referrer;
      if (referrer && referrer.includes(window.location.origin)) {
        window.history.back();
        return;
      }
    }
    navigate(fallback);
  }, [fallback, navigate]);

  return { fallback, goBack };
}
