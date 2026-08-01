import type { IntegrationProviderAutoSyncStatus } from '@titan/shared';

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
};

export function IntegrationAutoSyncStatusPanel({
  status,
  compact = false,
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
