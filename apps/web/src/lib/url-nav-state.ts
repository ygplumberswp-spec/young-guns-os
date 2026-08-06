/** Sync list/calendar UI state with URL search params for browser Back restoration. */

export function readSearchParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
}

export function buildSearchString(entries: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value != null && value !== '') {
      params.set(key, value);
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function mergeSearchString(
  pathname: string,
  entries: Record<string, string | null | undefined>,
  mode: 'push' | 'replace' = 'push',
): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(entries)) {
    if (value == null || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const url = `${pathname}${search ? `?${search}` : ''}`;
  if (mode === 'replace') {
    window.history.replaceState(window.history.state, '', url);
  } else {
    window.history.pushState(window.history.state, '', url);
  }
}
