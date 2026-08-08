import { useMemo } from 'react';
import { Link } from 'wouter';
import { Panel } from '@titan/ui';
import { canViewBankFeedFoundation } from '@titan/shared';
import { useAuth } from '../../lib/auth-context';
import { fetchBankFeedConnection } from '../../lib/bank-feed-foundation-api';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';

/**
 * Truthful Bank Connection card — never "Connected" from config alone.
 * Provider feed unavailable → Import statement (controlled CSV path).
 */
export function BankConnectionCard() {
  const { accessToken, user } = useAuth();
  const identity = useMemo(
    () =>
      user
        ? { roleName: user.roleName, permissions: user.permissions }
        : { roleName: '', permissions: [] as string[] },
    [user],
  );
  const canView = canViewBankFeedFoundation(identity);

  const { data, isLoading, error } = useStaffCachedQuery({
    queryKey: 'finance/bank-feed/connection',
    enabled: canView && Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: () => fetchBankFeedConnection(accessToken!),
  });

  if (!canView) return null;

  const card = data?.card;
  const status = card?.status ?? data?.status ?? 'NOT_CONFIGURED';
  const mode = card?.mode ?? data?.mode ?? 'PROVIDER_UNAVAILABLE';
  const connectedClaim = card?.connectedClaim === true;

  return (
    <Panel title="Bank Connection">
      {isLoading ? <p className="page-muted">Loading bank connection…</p> : null}
      {error ? (
        <p className="page-muted">Unable to load bank connection status.</p>
      ) : null}
      {!isLoading && !error && data ? (
        <>
          <dl className="jobs-meta">
            <div>
              <dt>Bank</dt>
              <dd>{data.bankName}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{mode}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{connectedClaim ? 'CONNECTED_READ_ONLY' : status}</dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd>{card?.maskedAccount ?? data.maskedAccountIdentity ?? '••••'}</dd>
            </div>
            <div>
              <dt>Last successful intake</dt>
              <dd>{card?.lastSuccessfulIntakeAt ?? data.lastSuccessfulIntakeAt ?? '—'}</dd>
            </div>
            <div>
              <dt>Last attempt</dt>
              <dd>{card?.lastAttemptedIntakeAt ?? data.lastAttemptedIntakeAt ?? '—'}</dd>
            </div>
          </dl>
          <p className="page-muted">
            {data.statusReason ??
              'No legitimate FNB/open-banking provider feed is configured. Use controlled statement import.'}
          </p>
          {(card?.primaryAction === 'IMPORT_STATEMENT' ||
            status === 'STATEMENT_IMPORT_ONLY' ||
            mode === 'CONTROLLED_STATEMENT_IMPORT' ||
            mode === 'PROVIDER_UNAVAILABLE') && (
            <p>
              <Link href="/finance/bank-transactions/import" className="jobs-link">
                Import statement
              </Link>
            </p>
          )}
          {card?.primaryAction === 'CONNECT_PROVIDER' ? (
            <p className="page-muted">Connect via supported provider (not available yet).</p>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
