import { useLocation, useRouter } from 'wouter';

/** Escape the current nest base and target an app-absolute path (Wouter `~`). */
export function toAppAbsoluteHref(href: string): string {
  if (!href.startsWith('/')) {
    return href;
  }
  return href.startsWith('~') ? href : `~${href}`;
}

/** Convert `/mobile/...` app paths into nest-relative paths under `<Route path="/mobile" nest>`. */
export function toMobileNestedHref(href: string): string {
  if (href === '/mobile' || href === '/mobile/') {
    return '/';
  }
  if (href.startsWith('/mobile/')) {
    return href.slice('/mobile'.length) || '/';
  }
  return href;
}

export function mobileHrefMatchesLocation(href: string, nestedLocation: string): boolean {
  const nestedHref = toMobileNestedHref(href);
  const normalize = (value: string) =>
    value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
  return normalize(nestedLocation) === normalize(nestedHref);
}

/**
 * Full browser pathname reconstructed from the active Wouter nest base + relative location.
 * Use this for RBAC prefix checks so nested routers do not change access policy.
 */
export function useAppPathname(): string {
  const router = useRouter();
  const [location] = useLocation();
  const base = router.base === '/' ? '' : router.base;
  if (!base) {
    return location;
  }
  if (location === '/') {
    return base;
  }
  return `${base}${location}`;
}
