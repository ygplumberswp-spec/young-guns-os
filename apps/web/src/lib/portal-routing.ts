/**
 * Helpers for Wouter nested client portal routes.
 *
 * Canonical base: `/my` (POR-007 / UX-030).
 * Legacy alias: `/portal` redirects to `/my` (backward compatible).
 *
 * Inside a nest, `useLocation`/`Link`/`navigate` are scoped to the parent base.
 * App-absolute destinations must use Wouter's `~` escape so login never becomes
 * `/my/my/login` or `/portal/portal/login`.
 */

import { toAppAbsoluteHref } from './nested-routing.js';

export { toAppAbsoluteHref } from './nested-routing.js';

/** Canonical client experience base path. */
export const CLIENT_PORTAL_CANONICAL_BASE = '/my';
/** Legacy alias retained for bookmarks and invite links. */
export const CLIENT_PORTAL_LEGACY_BASE = '/portal';

const PORTAL_BASES = [CLIENT_PORTAL_CANONICAL_BASE, CLIENT_PORTAL_LEGACY_BASE] as const;

/** Rewrite a legacy `/portal…` path to the canonical `/my…` equivalent. */
export function toCanonicalPortalPath(pathname: string): string {
  if (pathname === CLIENT_PORTAL_LEGACY_BASE || pathname === `${CLIENT_PORTAL_LEGACY_BASE}/`) {
    return CLIENT_PORTAL_CANONICAL_BASE;
  }
  if (pathname.startsWith(`${CLIENT_PORTAL_LEGACY_BASE}/`)) {
    return `${CLIENT_PORTAL_CANONICAL_BASE}${pathname.slice(CLIENT_PORTAL_LEGACY_BASE.length)}`;
  }
  return pathname;
}

/**
 * Convert an app-absolute portal href into a path relative to the active nest.
 * `/my` → `/`, `/my/jobs` → `/jobs` (same for `/portal` aliases).
 */
export function toPortalNestedHref(href: string): string {
  for (const base of PORTAL_BASES) {
    if (href === base || href === `${base}/`) {
      return '/';
    }
    if (href.startsWith(`${base}/`)) {
      return href.slice(base.length) || '/';
    }
  }
  return href;
}

/** True when a nest-relative location matches an app-absolute portal href. */
export function portalHrefMatchesLocation(href: string, nestedLocation: string): boolean {
  const nestedHref = toPortalNestedHref(href);
  const normalizedLocation =
    nestedLocation.length > 1 && nestedLocation.endsWith('/')
      ? nestedLocation.slice(0, -1)
      : nestedLocation;
  const normalizedHref =
    nestedHref.length > 1 && nestedHref.endsWith('/') ? nestedHref.slice(0, -1) : nestedHref;
  return normalizedLocation === normalizedHref;
}

/**
 * Navigate target used when an unauthenticated visitor hits a protected portal route.
 * Always app-absolute via `~` so nesting cannot prefix another base segment.
 */
export function portalLoginRedirectHref(): string {
  return toAppAbsoluteHref(`${CLIENT_PORTAL_CANONICAL_BASE}/login`);
}

export function portalHomeHref(): string {
  return CLIENT_PORTAL_CANONICAL_BASE;
}

/**
 * Prove the Wouter absolutePath composition that caused the defect, and that
 * the login redirect never reintroduces a duplicated nest segment.
 */
export function composeNestedNavigateTarget(base: string, to: string): string {
  if (to.startsWith('~')) {
    return to.slice(1);
  }
  const normalizedBase = base === '/' ? '' : base;
  return `${normalizedBase}${to}`;
}

export function assertPortalLoginRedirectIsSafe(
  base: string = CLIENT_PORTAL_CANONICAL_BASE,
): string {
  const target = portalLoginRedirectHref();
  const composed = composeNestedNavigateTarget(base, target);
  const expected = `${CLIENT_PORTAL_CANONICAL_BASE}/login`;
  if (composed !== expected) {
    throw new Error(`Unsafe portal login redirect composed to ${composed}`);
  }
  if (composed.includes('/portal/portal') || composed.includes('/my/my')) {
    throw new Error(`Portal login redirect duplicated nest prefix: ${composed}`);
  }
  return composed;
}
