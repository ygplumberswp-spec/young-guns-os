import { type ReactNode, useEffect, useState } from 'react';
import { LoadingState } from '@titan/ui';
import { ApiClientError } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { fetchSaasAccessStatus } from '../lib/platform-api-client';
import { SubscriptionAttentionPage } from '../pages/subscription-attention/SubscriptionAttentionPage';

type SaasAccessGateProps = {
  children: ReactNode;
};

/**
 * Blocks normal operational UI when the tenant's SaaS access is suspended.
 * Platform-owner tenants always pass (API evaluates tenant_kind).
 * Renders the professional locked screen in-place — no data-loss messaging.
 */
export function SaasAccessGate({ children }: SaasAccessGateProps) {
  const { accessToken, isAuthenticated } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!isAuthenticated || !accessToken) {
        setChecking(false);
        setAllowed(true);
        return;
      }

      setChecking(true);
      try {
        const status = await fetchSaasAccessStatus(accessToken);
        if (cancelled) return;
        setAllowed(status.allowed);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.code === 'SUBSCRIPTION_REQUIRED') {
          setAllowed(false);
        } else {
          // Fail open on transient status-check errors so Young Guns staging is not bricked.
          setAllowed(true);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [accessToken, isAuthenticated, refreshKey]);

  if (checking) {
    return (
      <div style={{ padding: '2rem' }}>
        <LoadingState label="Checking subscription access…" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <SubscriptionAttentionPage
        onRecheck={() => {
          setRefreshKey((value) => value + 1);
        }}
      />
    );
  }

  return children;
}
