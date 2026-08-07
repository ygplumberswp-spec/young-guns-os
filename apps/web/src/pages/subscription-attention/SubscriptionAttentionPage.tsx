import { useEffect, useState } from 'react';
import { Button, LoadingState, Panel } from '@titan/ui';
import { PageHeader } from '../../components/ux';
import { ApiClientError } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import {
  fetchSaasAccessStatus,
  type SaasCustomerAccessStatus,
} from '../../lib/platform-api-client';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

type SubscriptionAttentionPageProps = {
  onRecheck?: () => void;
};

/**
 * Customer locked experience when SaaS entitlement/access is suspended.
 * Does not expose internal IDs, tokens, or provider secrets.
 * Does not imply data loss — billing/access only.
 */
export function SubscriptionAttentionPage({ onRecheck }: SubscriptionAttentionPageProps) {
  const { accessToken, logout } = useAuth();
  const [status, setStatus] = useState<SaasCustomerAccessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await fetchSaasAccessStatus(accessToken);
        if (!cancelled) {
          setStatus(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load subscription status',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (isLoading && !status) {
    return (
      <div className="automation-page">
        <LoadingState label="Checking subscription…" />
      </div>
    );
  }

  return (
    <div className="automation-page subscription-attention-page">
      <PageHeader title="TITAN" description="TITAN subscription requires attention." />

      <Panel title="Subscription access">
        {error ? <p className="form-error">{error}</p> : null}

        <p>
          Your company data remains safely stored. Operational access is paused until billing or
          entitlement is restored.
        </p>

        <div className="stat-grid" style={{ marginTop: '1.25rem' }}>
          <div>
            <strong>Company</strong>
            <p>{status?.companyName ?? 'Your company'}</p>
          </div>
          <div>
            <strong>Access</strong>
            <p>
              <span className="status-pill">{status?.statusChip ?? 'SUSPENDED'}</span>
            </p>
          </div>
          <div>
            <strong>Subscription</strong>
            <p>{status?.subscriptionStatus?.replace(/_/g, ' ') ?? 'Requires attention'}</p>
          </div>
          <div>
            <strong>Paid through</strong>
            <p>{formatDate(status?.paidThroughAt ?? null)}</p>
          </div>
        </div>

        <div className="page-header-actions" style={{ marginTop: '1.5rem' }}>
          <Button
            onClick={() => {
              onRecheck?.();
            }}
          >
            Check access again
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void logout();
            }}
          >
            Sign out
          </Button>
        </div>
      </Panel>
    </div>
  );
}
