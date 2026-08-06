import { useCallback, useEffect, useState } from 'react';
import { Button } from '@titan/ui';
import type { CartrackConnectionSummary, IntegrationProviderAutoSyncStatus } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchIntegrationAutoSyncStatus, runIntegrationAutoSyncRecovery } from '../../lib/integration-auto-sync-api-client';
import { syncCartrack } from '../../lib/integrations-api';
import { IntegrationAutoSyncStatusPanel } from './IntegrationAutoSyncStatusPanel';

type CartrackSyncPanelProps = {
  accessToken: string;
  connection: CartrackConnectionSummary;
  canManage: boolean;
  onConnectionChange?: () => void | Promise<void>;
};

export function CartrackSyncPanel({
  accessToken,
  connection,
  canManage,
  onConnectionChange,
}: CartrackSyncPanelProps) {
  const [autoSyncStatus, setAutoSyncStatus] = useState<IntegrationProviderAutoSyncStatus | null>(
    null,
  );
  const [isRecovering, setIsRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAutoSyncStatus = useCallback(async () => {
    const status = await fetchIntegrationAutoSyncStatus(accessToken, 'cartrack');
    setAutoSyncStatus(status);
  }, [accessToken]);

  useEffect(() => {
    if (connection.status !== 'connected') {
      setAutoSyncStatus(null);
      return;
    }

    void loadAutoSyncStatus().catch(() => {
      setAutoSyncStatus(null);
    });

    const timer = window.setInterval(() => {
      void loadAutoSyncStatus().catch(() => undefined);
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [connection.status, loadAutoSyncStatus]);

  async function handleRecoverySync() {
    if (!canManage) return;

    setIsRecovering(true);
    setError(null);
    setSuccess(null);

    try {
      await runIntegrationAutoSyncRecovery(accessToken, 'cartrack');
      setSuccess('Recovery sync queued. Background sync will update positions shortly.');
      await Promise.all([loadAutoSyncStatus(), onConnectionChange?.()]);
    } catch (err) {
      try {
        const result = await syncCartrack(accessToken);
        setSuccess(
          `Recovery sync complete: ${result.externalVehicleCount} vehicles, ${result.autoMappedCount} auto-mapped, ${result.positionsStored} GPS positions stored.`,
        );
        await Promise.all([loadAutoSyncStatus(), onConnectionChange?.()]);
      } catch (fallbackError) {
        setError(
          fallbackError instanceof ApiClientError
            ? fallbackError.message
            : err instanceof ApiClientError
              ? err.message
              : 'Unable to run recovery sync',
        );
      }
    } finally {
      setIsRecovering(false);
    }
  }

  if (connection.status !== 'connected' && connection.status !== 'error') {
    return null;
  }

  return (
    <div className="integration-auto-sync-section">
      {autoSyncStatus ? <IntegrationAutoSyncStatusPanel status={autoSyncStatus} /> : null}

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {canManage ? (
        <div className="integrations-form__actions panel-actions">
          <Button variant="ghost" disabled={isRecovering} onClick={() => void handleRecoverySync()}>
            {isRecovering ? 'Running recovery sync…' : 'Retry failed sync (recovery)'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
