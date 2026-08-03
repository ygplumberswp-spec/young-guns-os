import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import type {
  IntegrationProviderAutoSyncStatus,
  XeroConnectionSummary,
  XeroEntitySyncResult,
  XeroImportJobProgress,
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
import { XeroConnectionStatusCard } from './XeroConnectionStatusCard';

type XeroSyncPanelProps = {
  accessToken: string;
  connection: XeroConnectionSummary;
  canManage: boolean;
  onConnectionChange?: () => void | Promise<void>;
  onTestConnection?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onCancelDisconnect?: () => void;
  confirmDisconnect?: boolean;
  connectionBusy?: boolean;
  testBusy?: boolean;
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

const IMPORT_STAGE_LABELS = {
  contacts: 'Contacts',
  quotes: 'Quotes',
  invoices: 'Invoices',
  payments: 'Payments',
  bank_transactions: 'Bank transactions',
} as const;

function formatImportJobProgress(job: XeroImportJobProgress): string {
  const stageLabel = job.currentStage ? IMPORT_STAGE_LABELS[job.currentStage] : 'Starting';
  const contacts = `${job.contacts.createdCount} new / ${job.contacts.updatedCount} updated`;
  const quotes = `${job.quotes.createdCount} new / ${job.quotes.updatedCount} updated`;
  const invoices = `${job.invoices.createdCount} new / ${job.invoices.updatedCount} updated`;
  const payments = `${job.payments.createdCount} new / ${job.payments.updatedCount} updated`;
  const bank = `${job.bankTransactions.createdCount} new / ${job.bankTransactions.updatedCount} updated`;
  return `${stageLabel} — Contacts ${contacts}, Quotes ${quotes}, Invoices ${invoices}, Payments ${payments}, Bank ${bank}`;
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

function buildHonestStatusMessage(args: {
  connection: XeroConnectionSummary;
  autoSync: IntegrationProviderAutoSyncStatus | null;
  status: XeroSyncStatusResponse | null;
  importProgress: XeroImportJobProgress | null;
  bankFailed: number;
}): string {
  const { connection, autoSync, status, importProgress, bankFailed } = args;

  if (connection.lastError) return connection.lastError;
  if (autoSync?.lastError) return autoSync.lastError;

  const importActive =
    importProgress &&
    (importProgress.status === 'queued' ||
      importProgress.status === 'running' ||
      importProgress.status === 'pending' ||
      importProgress.uiStatus === 'resuming' ||
      importProgress.uiStatus === 'retrying' ||
      importProgress.uiStatus === 'partial' ||
      importProgress.uiStatus === 'waiting');

  if (importActive) {
    return (
      importProgress.message ??
      `Import in progress (${importProgress.uiStatusLabel ?? importProgress.status})`
    );
  }

  if (importProgress?.status === 'failed') {
    return importProgress.message ?? 'Last import failed';
  }

  if (autoSync?.syncInProgress || autoSync?.uiState === 'initial_sync_running') {
    return autoSync.uiStateLabel;
  }

  const failedTotal =
    (status?.customers.failedCount ?? 0) +
    (status?.quotes.failedCount ?? 0) +
    (status?.invoices.failedCount ?? 0) +
    (status?.payments.failedCount ?? 0) +
    (status?.financePipeline?.failedCount ?? 0) +
    bankFailed;

  if (failedTotal > 0) {
    return `Synced with ${failedTotal} failed entit${failedTotal === 1 ? 'y' : 'ies'}`;
  }

  if (autoSync?.uiState === 'synced') {
    return 'Synced successfully';
  }

  if (autoSync?.uiStateLabel) {
    return autoSync.uiStateLabel;
  }

  if (!connection.lastSyncAt && !autoSync?.lastSuccessfulSyncAt) {
    return 'Connected — waiting for first sync';
  }

  return 'Connected';
}

export function XeroSyncPanel({
  accessToken,
  connection,
  canManage,
  onConnectionChange,
  onTestConnection,
  onDisconnect,
  onCancelDisconnect,
  confirmDisconnect = false,
  connectionBusy = false,
  testBusy = false,
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isConnected = connection.status === 'connected';

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
    const fromStatus = syncStatus.bankTransactions?.syncedCount ?? 0;
    const fromLogs = countBankTransactionLogs(logs);
    setBankTransactionStats({
      synced: Math.max(fromStatus, fromLogs.synced),
      failed: Math.max(syncStatus.bankTransactions?.failedCount ?? 0, fromLogs.failed),
    });
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
        const quotes = sync.quotes ?? {
          createdCount: 0,
          updatedCount: 0,
        };
        setSuccess(
          `${sync.message} Contacts ${sync.contacts.createdCount} new / ${sync.contacts.updatedCount} updated · Quotes ${quotes.createdCount} new / ${quotes.updatedCount} updated · Invoices ${sync.invoices.createdCount} new / ${sync.invoices.updatedCount} updated · Payments ${sync.payments.createdCount} new / ${sync.payments.updatedCount} updated · Bank transactions ${sync.bankTransactions.createdCount} new / ${sync.bankTransactions.updatedCount} updated.`,
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

  const isBusy = Boolean(busyScope) || connectionBusy;
  const syncBusy = busyScope === 'all';

  const lastSyncAt =
    connection.lastSyncAt ??
    autoSyncStatus?.lastSuccessfulSyncAt ??
    status?.customers.lastSuccessfulSyncAt ??
    status?.invoices.lastSuccessfulSyncAt ??
    null;

  const bankCount = Math.max(
    importProgress?.bankTransactions.pulledCount ?? 0,
    bankTransactionStats.synced,
  );

  const statusMessage = buildHonestStatusMessage({
    connection,
    autoSync: autoSyncStatus,
    status,
    importProgress,
    bankFailed: bankTransactionStats.failed,
  });

  const advancedBody = (
    <>
      {autoSyncStatus ? (
        <Panel title="Auto-Sync Status">
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

      <Panel title="Recovery Controls (Manual Sync)">
        <p className="page-muted">
          Pull contacts, quotes, invoices, payments, and bank transactions from Xero into TITAN.
          These actions are read-only — nothing is written back to your Xero ledger. Bank rows are
          stored for history only (no automatic accounting changes).
        </p>

        {canManage && !isConnected ? (
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
                <dt>Last successful sync</dt>
                <dd>
                  {status.lastSyncAt
                    ? new Date(status.lastSyncAt).toLocaleString()
                    : 'No successful sync yet'}
                </dd>
              </div>
              <div>
                <dt>Pipeline status</dt>
                <dd>{status.financePipeline?.status ?? status.importJob?.uiStatusLabel ?? 'Idle'}</dd>
              </div>
              <div>
                <dt>Failed records</dt>
                <dd>{status.financePipeline?.failedCount ?? 0}</dd>
              </div>
              <div>
                <dt>Quotes synced</dt>
                <dd>{status.quotes.syncedCount}</dd>
              </div>
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

  if (isConnected) {
    return (
      <>
        <XeroConnectionStatusCard
          organisationName={connection.organisationName ?? status?.organisationName ?? null}
          lastSyncAt={lastSyncAt}
          statusMessage={statusMessage}
          counts={{
            contacts: status?.customers.syncedCount ?? 0,
            quotes: status?.quotes.syncedCount ?? 0,
            invoices: status?.invoices.syncedCount ?? 0,
            payments: status?.payments.syncedCount ?? 0,
            bankTransactions: bankCount,
          }}
          nextSyncAt={autoSyncStatus?.nextScheduledSyncAt ?? null}
          canManage={canManage}
          isBusy={isBusy}
          syncBusy={syncBusy}
          testBusy={testBusy}
          syncDisabled={Boolean(syncBlockedReason)}
          confirmDisconnect={confirmDisconnect}
          onTestConnection={onTestConnection ? () => void onTestConnection() : undefined}
          onSyncNow={() => void handleFullReadOnlySync()}
          onDisconnect={onDisconnect ? () => void onDisconnect() : undefined}
          onCancelDisconnect={onCancelDisconnect}
        />

        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}

        <div className="xero-advanced-disclosure">
          <button
            type="button"
            className="xero-advanced-disclosure__toggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            Advanced {advancedOpen ? '▲' : '▼'}
          </button>
          {advancedOpen ? <div className="xero-advanced-disclosure__body">{advancedBody}</div> : null}
        </div>
      </>
    );
  }

  return <>{advancedBody}</>;
}
