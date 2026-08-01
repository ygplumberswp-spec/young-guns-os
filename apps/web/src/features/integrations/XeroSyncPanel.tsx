import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import type {
  IntegrationProviderAutoSyncStatus,
  XeroConnectionSummary,
  XeroEntitySyncResult,
  XeroImportJobProgress,
  XeroImportStage,
  XeroSyncStatusResponse,
} from '@titan/shared';
import { XERO_SYNC_BLOCKED_REASON } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchIntegrationAutoSyncStatus } from '../../lib/integration-auto-sync-api-client';
import { syncIntegrationConnectors } from '../../lib/integration-platform-api-client';
import {
  fetchXeroSyncLogs,
  fetchXeroSyncStatus,
  syncXeroCustomers,
  syncXeroInvoices,
  syncXeroPayments,
} from '../../lib/integrations-api';
import { IntegrationAutoSyncStatusPanel } from './IntegrationAutoSyncStatusPanel';

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

const IMPORT_STAGE_LABELS: Record<XeroImportStage, string> = {
  contacts: 'Contacts',
  invoices: 'Invoices',
  payments: 'Payments',
  bank_transactions: 'Bank transactions',
};

function formatImportJobProgress(job: XeroImportJobProgress): string {
  const stageLabel = job.currentStage ? IMPORT_STAGE_LABELS[job.currentStage] : 'Starting';
  const contacts = `${job.contacts.createdCount} new / ${job.contacts.updatedCount} updated`;
  const invoices = `${job.invoices.createdCount} new / ${job.invoices.updatedCount} updated`;
  const payments = `${job.payments.createdCount} new / ${job.payments.updatedCount} updated`;
  const bank = `${job.bankTransactions.createdCount} new / ${job.bankTransactions.updatedCount} updated`;
  return `${stageLabel} — Contacts ${contacts}, Invoices ${invoices}, Payments ${payments}, Bank ${bank}`;
}

async function pollXeroImportUntilSettled(
  accessToken: string,
  onProgress: (status: XeroSyncStatusResponse) => void,
): Promise<XeroSyncStatusResponse> {
  const deadline = Date.now() + 30 * 60_000;

  while (Date.now() < deadline) {
    const status = await fetchXeroSyncStatus(accessToken);
    onProgress(status);

    const job = status.importJob;
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new ApiClientError('Xero import is still running in the background.', 408, 'SYNC_IN_PROGRESS');
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
  const [autoSyncStatus, setAutoSyncStatus] = useState<IntegrationProviderAutoSyncStatus | null>(
    null,
  );
  const [importProgress, setImportProgress] = useState<XeroImportJobProgress | null>(null);
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
    const [syncStatus, logs, autoSync] = await Promise.all([
      fetchXeroSyncStatus(accessToken),
      fetchXeroSyncLogs(accessToken),
      fetchIntegrationAutoSyncStatus(accessToken, 'xero').catch(() => null),
    ]);
    setStatus(syncStatus);
    setAutoSyncStatus(autoSync);
    setImportProgress(syncStatus.importJob ?? null);
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

      if (result.xeroSync?.queued || result.xeroSync?.syncJobId) {
        setSuccess(result.xeroSync.message ?? 'Xero import queued. Tracking progress…');
        const finalStatus = await pollXeroImportUntilSettled(accessToken, (liveStatus) => {
          setStatus(liveStatus);
          setImportProgress(liveStatus.importJob ?? null);
        });
        const job = finalStatus.importJob;

        if (job?.status === 'completed') {
          setSuccess(
            job.message ??
              `Xero sync complete. ${formatImportJobProgress(job)}`,
          );
        } else if (job?.status === 'failed') {
          setError(job.message ?? 'Xero sync failed.');
        } else {
          setSuccess('Xero import is running in the background. Refresh this page for live progress.');
        }
      } else if (result.xeroSync?.success) {
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
    <>
      {autoSyncStatus ? (
        <Panel title="Auto-sync status">
          <p className="page-muted">
            TITAN syncs Xero automatically after you connect and on a recurring schedule. Manual
            sync below is for recovery only.
          </p>
          <IntegrationAutoSyncStatusPanel
            status={autoSyncStatus}
            importJob={importProgress ?? status?.importJob ?? null}
          />
        </Panel>
      ) : null}

      <Panel title="Recovery controls (manual sync)">
      <p className="page-muted">
        Pull contacts, invoices, payments, and bank transactions from Xero into TITAN. These actions
        are read-only — nothing is written back to your Xero ledger.
      </p>

      {canManage ? (
        <div className="integrations-form__actions panel-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={isBusy || Boolean(syncBlockedReason)}
            aria-busy={busyScope === 'all'}
            onClick={() => void handleFullReadOnlySync()}
          >
            {busyScope === 'all' ? 'Syncing from Xero…' : 'Sync now (recovery)'}
          </Button>
        </div>
      ) : null}

      {importProgress ? (
        <p className="page-muted">
          Background import ({importProgress.uiStatusLabel ?? importProgress.status}):{' '}
          {formatImportJobProgress(importProgress)}
          {importProgress.nextRetryAt
            ? ` · next retry ${new Date(importProgress.nextRetryAt).toLocaleString()}`
            : ''}
        </p>
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
    </>
  );
}
