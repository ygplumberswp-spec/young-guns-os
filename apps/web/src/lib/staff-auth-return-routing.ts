import { getStaffHomePath } from '@titan/auth/browser';
import type { AuthUser } from '@titan/shared';
import { toStaffIdentity } from './role-experience.js';
import { toAppAbsoluteHref } from './nested-routing.js';

/** Query param and sessionStorage key for deep-link restore after sign-in. */
export const STAFF_AUTH_RETURN_QUERY = 'returnTo';
export const STAFF_AUTH_RETURN_STORAGE_KEY = 'titan_staff_auth_return';

/**
 * Paths we must never send users back to after login (auth loops, guest-only shells).
 */
const BLOCKED_RETURN_PREFIXES = ['/auth/'] as const;

export function normalizeStaffAuthReturnPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') {
    return null;
  }

  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }

  for (const blocked of BLOCKED_RETURN_PREFIXES) {
    if (trimmed === blocked.slice(0, -1) || trimmed.startsWith(blocked)) {
      return null;
    }
  }

  return trimmed;
}

export function rememberStaffAuthReturnPath(path: string): void {
  const normalized = normalizeStaffAuthReturnPath(path);
  if (!normalized || typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.setItem(STAFF_AUTH_RETURN_STORAGE_KEY, normalized);
}

export function peekStaffAuthReturnPath(): string | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  return normalizeStaffAuthReturnPath(sessionStorage.getItem(STAFF_AUTH_RETURN_STORAGE_KEY));
}

export function consumeStaffAuthReturnPath(): string | null {
  const stored = peekStaffAuthReturnPath();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(STAFF_AUTH_RETURN_STORAGE_KEY);
  }
  return stored;
}

export function staffAuthReturnFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(STAFF_AUTH_RETURN_QUERY);
  const normalized = normalizeStaffAuthReturnPath(value);
  if (normalized) {
    rememberStaffAuthReturnPath(normalized);
  }
  return normalized;
}

export function appendStaffAuthReturnQuery(loginPath: string, returnPath: string): string {
  const normalized = normalizeStaffAuthReturnPath(returnPath);
  if (!normalized) {
    return loginPath;
  }

  rememberStaffAuthReturnPath(normalized);

  const [pathname, existingQuery = ''] = loginPath.split('?');
  const params = new URLSearchParams(existingQuery);
  params.set(STAFF_AUTH_RETURN_QUERY, normalized);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function resolveStaffPostLoginPath(user: AuthUser, explicitReturn?: string | null): string {
  const fromExplicit = normalizeStaffAuthReturnPath(explicitReturn);
  const fromStorage = consumeStaffAuthReturnPath();
  const target = fromExplicit ?? fromStorage;
  return target ?? getStaffHomePath(toStaffIdentity(user));
}

export function staffLoginRedirectPathWithReturn(
  loginPath: string,
  returnPath: string,
): string {
  return appendStaffAuthReturnQuery(loginPath, returnPath);
}

export function staffLoginRedirectHrefWithReturn(loginPath: string, returnPath: string): string {
  return toAppAbsoluteHref(staffLoginRedirectPathWithReturn(loginPath, returnPath));
}
