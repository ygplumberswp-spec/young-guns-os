import type { IntegrationProviderAutoSyncStatus, XeroImportJobProgress, XeroImportStage } from '@titan/shared';

const IMPORT_STAGE_LABELS: Record<XeroImportStage, string> = {
  contacts: 'Contacts',
  invoices: 'Invoices',
  payments: 'Payments',
  bank_transactions: 'Bank transactions',
};

function autoSyncStateModifier(state: IntegrationProviderAutoSyncStatus['uiState']): string {
  switch (state) {
    case 'synced':
      return 'success';
    case 'initial_sync_running':
    case 'connecting':
    case 'connected':
      return 'info';
    case 'degraded':
    case 'sync_failed':
    case 'authentication_expired':
    case 'permission_incomplete':
    case 'reconnect_required':
      return 'warning';
    case 'provider_unavailable':
      return 'muted';
    default:
      return 'neutral';
  }
}

type IntegrationAutoSyncStatusPanelProps = {
  status: IntegrationProviderAutoSyncStatus;
  compact?: boolean;
  importJob?: XeroImportJobProgress | null;
};

export function IntegrationAutoSyncStatusPanel({
  status,
  compact = false,
  importJob = null,
}: IntegrationAutoSyncStatusPanelProps) {
  const modifier = autoSyncStateModifier(status.uiState);

  return (
    <div className={compact ? 'integration-auto-sync-panel integration-auto-sync-panel--compact' : 'integration-auto-sync-panel'}>
      <div className="integration-auto-sync-panel__header">
        <strong>{status.displayName}</strong>
        <span className={`status-pill status-pill--${modifier}`}>{status.uiStateLabel}</span>
      </div>

      <dl className="integration-status-list">
        <div>
          <dt>Last successful sync</dt>
          <dd>
            {status.lastSuccessfulSyncAt
              ? new Date(status.lastSuccessfulSyncAt).toLocaleString()
              : 'Never'}
          </dd>
        </div>
        <div>
          <dt>Last attempted sync</dt>
          <dd>
            {status.lastAttemptedSyncAt
              ? new Date(status.lastAttemptedSyncAt).toLocaleString()
              : 'Never'}
          </dd>
        </div>
        <div>
          <dt>Next scheduled sync</dt>
          <dd>
            {status.nextScheduledSyncAt
              ? new Date(status.nextScheduledSyncAt).toLocaleString()
              : status.autoSyncEnabled
                ? 'Pending schedule'
                : 'Not scheduled'}
          </dd>
        </div>
        {status.recordsProcessed != null ? (
          <div>
            <dt>Records processed (last run)</dt>
            <dd>{status.recordsProcessed}</dd>
          </div>
        ) : null}
        {importJob ? (
          <>
            <div>
              <dt>Import status</dt>
              <dd>{importJob.uiStatusLabel ?? importJob.status}</dd>
            </div>
            {(importJob.status === 'queued' ||
              importJob.status === 'running' ||
              importJob.status === 'pending' ||
              importJob.uiStatus === 'resuming' ||
              importJob.uiStatus === 'retrying' ||
              importJob.uiStatus === 'partial' ||
              importJob.uiStatus === 'waiting') ? (
              <>
                <div>
                  <dt>Current stage</dt>
                  <dd>
                    {importJob.currentStage
                      ? IMPORT_STAGE_LABELS[importJob.currentStage]
                      : 'Starting'}
                  </dd>
                </div>
                <div>
                  <dt>Checkpoint</dt>
                  <dd>
                    {IMPORT_STAGE_LABELS[importJob.checkpoint.stage]} · contacts p
                    {importJob.checkpoint.contactsPage}, invoices p
                    {importJob.checkpoint.invoicesPage}
                  </dd>
                </div>
                <div>
                  <dt>Processed records</dt>
                  <dd>{importJob.processedCount}</dd>
                </div>
                <div>
                  <dt>Contacts processed</dt>
                  <dd>
                    {importJob.contacts.createdCount} new / {importJob.contacts.updatedCount} updated
                  </dd>
                </div>
                <div>
                  <dt>Invoices processed</dt>
                  <dd>
                    {importJob.invoices.createdCount} new / {importJob.invoices.updatedCount} updated
                  </dd>
                </div>
                <div>
                  <dt>Payments processed</dt>
                  <dd>
                    {importJob.payments.createdCount} new / {importJob.payments.updatedCount} updated
                  </dd>
                </div>
                <div>
                  <dt>Bank transactions processed</dt>
                  <dd>
                    {importJob.bankTransactions.createdCount} new /{' '}
                    {importJob.bankTransactions.updatedCount} updated
                  </dd>
                </div>
                {importJob.nextRetryAt ? (
                  <div>
                    <dt>Next retry</dt>
                    <dd>{new Date(importJob.nextRetryAt).toLocaleString()}</dd>
                  </div>
                ) : null}
                {importJob.heartbeatAt ? (
                  <div>
                    <dt>Last activity</dt>
                    <dd>{new Date(importJob.heartbeatAt).toLocaleString()}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
        {status.failureCount > 0 ? (
          <div>
            <dt>Recent failures</dt>
            <dd>{status.failureCount}</dd>
          </div>
        ) : null}
        {status.retryStatus !== 'idle' ? (
          <div>
            <dt>Retry status</dt>
            <dd>
              {status.retryStatus}
              {status.retryAt ? ` · ${new Date(status.retryAt).toLocaleString()}` : ''}
            </dd>
          </div>
        ) : null}
      </dl>

      {status.scopeProblems.length > 0 ? (
        <ul className="integrations-list">
          {status.scopeProblems.map((problem) => (
            <li key={problem} className="form-error">
              {problem}
            </li>
          ))}
        </ul>
      ) : null}

      {status.lastError ? <p className="form-error">{status.lastError}</p> : null}

      {status.correctiveAction ? (
        <p className="page-muted">
          <strong>Corrective action:</strong> {status.correctiveAction}
        </p>
      ) : null}

      {status.implementation !== 'full' ? (
        <p className="page-muted">
          Implementation: {status.implementation === 'stub' ? 'Planned / not configured' : 'Partial — auto-sync hooks only'}
        </p>
      ) : null}
    </div>
  );
}
