import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { LoadingState } from '@titan/ui';
import { toAppAbsoluteHref, toCanonicalPortalPath } from '../lib/portal-routing';

/**
 * Backward-compatible `/portal/*` → `/my/*` redirect (POR-007).
 * Preserves path suffix and query string; does not invent new routes.
 */
export function LegacyPortalRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const canonical = toCanonicalPortalPath(pathname);
    setLocation(toAppAbsoluteHref(`${canonical}${search}${hash}`));
  }, [setLocation]);

  return (
    <div className="auth-stage">
      <LoadingState label="Opening Your Account…" />
    </div>
  );
}
