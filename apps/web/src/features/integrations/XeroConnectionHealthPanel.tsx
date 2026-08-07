import type { XeroConnectionHealthSummary } from '@titan/shared';
import { Button, Panel } from '@titan/ui';

type XeroConnectionHealthPanelProps = {
  health: XeroConnectionHealthSummary | undefined;
  canManage: boolean;
  onCheckHealth?: () => void;
  checkBusy?: boolean;
};

export function XeroConnectionHealthPanel({
  health,
  canManage,
  onCheckHealth,
  checkBusy = false,
}: XeroConnectionHealthPanelProps) {
  if (!health) {
    return null;
  }

  const { scopeAnalysis } = health;

  return (
    <Panel title="Connection health" className="xero-health-panel">
      <dl className="xero-health-panel__grid">
        <div>
          <dt>Health state</dt>
          <dd>{health.healthLabel}</dd>
        </div>
        <div>
          <dt>Token expires</dt>
          <dd>{health.tokenExpiresAt ? new Date(health.tokenExpiresAt).toLocaleString() : 'Unknown'}</dd>
        </div>
        <div>
          <dt>Last token refresh</dt>
          <dd>
            {health.lastSuccessfulTokenRefreshAt
              ? new Date(health.lastSuccessfulTokenRefreshAt).toLocaleString()
              : 'Not recorded'}
          </dd>
        </div>
        <div>
          <dt>Last connection check</dt>
          <dd>
            {health.lastConnectionCheckAt
              ? new Date(health.lastConnectionCheckAt).toLocaleString()
              : 'Not recorded'}
          </dd>
        </div>
      </dl>

      {scopeAnalysis.missingScopes.length > 0 ? (
        <p className="xero-health-panel__warning" role="status">
          Missing scopes: {scopeAnalysis.missingScopes.join(', ')}
        </p>
      ) : (
        <p className="xero-health-panel__ok" role="status">
          All requested scopes are recorded on this connection.
        </p>
      )}

      {health.reconnectReason ? (
        <p className="xero-health-panel__warning">{health.reconnectReason}</p>
      ) : null}

      {health.mostRecentSanitizedProviderError ? (
        <p className="xero-health-panel__error">
          Recent provider note: {health.mostRecentSanitizedProviderError}
        </p>
      ) : null}

      {canManage && onCheckHealth ? (
        <Button type="button" variant="secondary" onClick={onCheckHealth} disabled={checkBusy}>
          {checkBusy ? 'Checking…' : 'Check health'}
        </Button>
      ) : null}
    </Panel>
  );
}
