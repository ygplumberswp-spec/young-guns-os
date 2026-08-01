import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import type { XeroConnectionSummary, XeroEntitySyncResult, XeroSyncStatusResponse } from '@titan/shared';
import { XERO_SYNC_BLOCKED_REASON } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchXeroSyncLogs,
  fetchXeroSyncStatus,
  syncXeroCustomers,
  syncXeroInvoices,
  syncXeroPayments,
  syncXeroQuotes,
} from '../../lib/integrations-api';

type XeroSyncPanelProps = {
  accessToken: string;
  connection: XeroConnectionSummary;
  canManage: boolean;
};

type EntitySyncAction = {
  label: string;
  pending: number;
  synced: number;
  failed: number;
  run: () => Promise<XeroEntitySyncResult>;
};

function formatEntityStats(stats: {
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
}): string {
  return `${stats.syncedCount} synced · ${stats.pendingCount} pending · ${stats.failedCount} failed`;
}

export function XeroSyncPanel({ accessToken, connection, canManage }: XeroSyncPanelProps) {
  const [status, setStatus] = useState<XeroSyncStatusResponse | null>(null);
  const [recentLogMessage, setRecentLogMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const syncBlockedReason = useMemo(() => {
    if (!connection.oauthConfigured) return XERO_SYNC_BLOCKED_REASON.notConfigured;
    if (connection.status !== 'connected') return XERO_SYNC_BLOCKED_REASON.notConnected;
    return null;
  }, [connection.oauthConfigured, connection.status]);

  const loadStatus = useCallback(async () => {
    const [syncStatus, logs] = await Promise.all([
      fetchXeroSyncStatus(accessToken),
      fetchXeroSyncLogs(accessToken),
    ]);
    setStatus(syncStatus);
    setRecentLogMessage(logs[0]?.message ?? null);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        await loadStatus();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load Xero sync status');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  async function runScopedSync(scope: string, action: () => Promise<{ pulledCount: number; updatedCount: number; createdCount: number; failedCount: number }>) {
    if (syncBlockedReason) {
      setError(syncBlockedReason);
      return;
    }

    setBusyScope(scope);
    setError(null);
    setSuccess(null);
    try {
      const result = await action();
      setSuccess(
        `${scope} sync finished — ${result.createdCount} created, ${result.updatedCount} updated, ${result.pulledCount} pulled, ${result.failedCount} failed.`,
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : `Unable to sync ${scope}`);
    } finally {
      setBusyScope(null);
    }
  }

  const entityActions: EntitySyncAction[] = status
    ? [
        {
          label: 'Customers',
          pending: status.customers.pendingCount,
          synced: status.customers.syncedCount,
          failed: status.customers.failedCount,
          run: () => syncXeroCustomers(accessToken),
        },
        {
          label: 'Quotes',
          pending: status.quotes.pendingCount,
          synced: status.quotes.syncedCount,
          failed: status.quotes.failedCount,
          run: () => syncXeroQuotes(accessToken),
        },
        {
          label: 'Invoices',
          pending: status.invoices.pendingCount,
          synced: status.invoices.syncedCount,
          failed: status.invoices.failedCount,
          run: () => syncXeroInvoices(accessToken),
        },
        {
          label: 'Payments',
          pending: status.payments.pendingCount,
          synced: status.payments.syncedCount,
          failed: status.payments.failedCount,
          run: () => syncXeroPayments(accessToken),
        },
      ]
    : [];

  return (
    <Panel title="Entity sync">
      <p className="page-muted">
        Push TITAN finance records to Xero and pull payment status. Official Xero invoice numbers
        are assigned only after a successful invoice sync — TITAN never invents them offline.
      </p>

      {isLoading ? <p className="page-muted">Loading sync counters…</p> : null}
      {syncBlockedReason ? <p className="form-error">{syncBlockedReason}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {status ? (
        <>
          <dl className="integration-status-list">
            <div>
              <dt>Outstanding invoices</dt>
              <dd>{status.unpaidInvoiceCount}</dd>
            </div>
            <div>
              <dt>Outstanding amount</dt>
              <dd>
                {(status.outstandingAmountCents / 100).toLocaleString(undefined, {
                  style: 'currency',
                  currency: status.currency,
                })}
              </dd>
            </div>
          </dl>

          <ul className="integrations-list">
            {entityActions.map((entity) => (
              <li key={entity.label}>
                <strong>{entity.label}</strong>
                <span className="page-muted">
                  {' '}
                  · {formatEntityStats({
                    pendingCount: entity.pending,
                    syncedCount: entity.synced,
                    failedCount: entity.failed,
                  })}
                </span>
                {canManage ? (
                  <div className="panel-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(busyScope) || Boolean(syncBlockedReason)}
                      onClick={() =>
                        void runScopedSync(entity.label.toLowerCase(), entity.run)
                      }
                    >
                      {busyScope === entity.label.toLowerCase()
                        ? 'Syncing…'
                        : `Sync ${entity.label.toLowerCase()}`}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          {recentLogMessage ? (
            <p className="page-muted">Latest sync log: {recentLogMessage}</p>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
