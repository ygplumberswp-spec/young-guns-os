import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import type { XeroConnectionSummary, XeroEntitySyncResult, XeroSyncStatusResponse } from '@titan/shared';
import { XERO_SYNC_BLOCKED_REASON } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { syncIntegrationConnectors } from '../../lib/integration-platform-api-client';
import {
  fetchXeroSyncLogs,
  fetchXeroSyncStatus,
  syncXeroCustomers,
  syncXeroInvoices,
  syncXeroPayments,
} from '../../lib/integrations-api';

type XeroSyncPanelProps = {
  accessToken: string;
  connection: XeroConnectionSummary;
  canManage: boolean;
  onConnectionChange?: () => void | Promise<void>;
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

function countBankTransactionLogs(
  logs: Awaited<ReturnType<typeof fetchXeroSyncLogs>>,
): { synced: number; failed: number } {
  let synced = 0;
  let failed = 0;
  for (const log of logs) {
    if (log.entityType !== 'bank_transaction') continue;
    if (log.status === 'success') synced += 1;
    if (log.status === 'failed') failed += 1;
  }
  return { synced, failed };
}

export function XeroSyncPanel({
  accessToken,
  connection,
  canManage,
  onConnectionChange,
}: XeroSyncPanelProps) {
  const [status, setStatus] = useState<XeroSyncStatusResponse | null>(null);
  const [recentLogMessage, setRecentLogMessage] = useState<string | null>(null);
  const [bankTransactionStats, setBankTransactionStats] = useState({ synced: 0, failed: 0 });
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
    setBankTransactionStats(countBankTransactionLogs(logs));
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

  async function runScopedSync(
    scope: string,
    action: () => Promise<{
      pulledCount: number;
      updatedCount: number;
      createdCount: number;
      failedCount: number;
    }>,
  ) {
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
      await onConnectionChange?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : `Unable to sync ${scope}`);
    } finally {
      setBusyScope(null);
    }
  }

  async function handleFullReadOnlySync() {
    if (syncBlockedReason) {
      setError(syncBlockedReason);
      return;
    }

    if (!canManage) {
      setError('You need integrations:manage permission to run Sync now.');
      return;
    }

    setBusyScope('all');
    setError(null);
    setSuccess(null);

    try {
      const result = await syncIntegrationConnectors(accessToken);

      if (result.xeroSync?.success) {
        const sync = result.xeroSync;
        setSuccess(
          `${sync.message} Contacts ${sync.contacts.createdCount} new / ${sync.contacts.updatedCount} updated · Invoices ${sync.invoices.createdCount} new / ${sync.invoices.updatedCount} updated · Payments ${sync.payments.createdCount} new / ${sync.payments.updatedCount} updated · Bank transactions ${sync.bankTransactions.createdCount} new / ${sync.bankTransactions.updatedCount} updated.`,
        );
      } else if (result.xeroSync) {
        const stage = result.xeroSync.failedStage
          ? ` Failed stage: ${result.xeroSync.failedStage}.`
          : '';
        setError(`${result.xeroSync.message}${stage}`);
      } else {
        setError(
          'Xero import did not run. Confirm the connection status is Connected, then retry Sync now (read-only).',
        );
      }

      await loadStatus();
      await onConnectionChange?.();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof DOMException && err.name === 'TimeoutError') {
        setError('Sync timed out waiting for Xero. Check your connection and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sync from Xero');
      }
    } finally {
      setBusyScope(null);
    }
  }

  const entityActions: EntitySyncAction[] = status
    ? [
        {
          label: 'Contacts',
          pending: status.customers.pendingCount,
          synced: status.customers.syncedCount,
          failed: status.customers.failedCount,
          run: () => syncXeroCustomers(accessToken),
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

  const isBusy = Boolean(busyScope);

  return (
    <Panel title="Read-only import from Xero">
      <p className="page-muted">
        Pull contacts, invoices, payments, and bank transactions from Xero into TITAN. These actions
        are read-only — nothing is written back to your Xero ledger.
      </p>

      {canManage ? (
        <div className="integrations-form__actions panel-actions">
          <Button
            type="button"
            disabled={isBusy || Boolean(syncBlockedReason)}
            aria-busy={busyScope === 'all'}
            onClick={() => void handleFullReadOnlySync()}
          >
            {busyScope === 'all' ? 'Syncing from Xero…' : 'Sync now (read-only)'}
          </Button>
        </div>
      ) : null}

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
                  ·{' '}
                  {formatEntityStats({
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
                      disabled={isBusy || Boolean(syncBlockedReason)}
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
            <li>
              <strong>Bank transactions</strong>
              <span className="page-muted">
                {' '}
                · {bankTransactionStats.synced} synced · {bankTransactionStats.failed} failed
              </span>
              <p className="page-muted">
                Bank transactions import with the full Sync now (read-only) action above.
              </p>
            </li>
          </ul>

          {recentLogMessage ? (
            <p className="page-muted">Latest sync log: {recentLogMessage}</p>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
