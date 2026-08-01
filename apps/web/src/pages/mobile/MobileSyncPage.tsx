import { PageHeader } from '../../components/ux';
import { useCallback, useEffect, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import type { MobileSyncProcessResult } from '@titan/shared';
import {
  MobileApiClientError,
  fetchMobileOfflineBundle,
  processMobileSync,
} from '../../lib/mobile-api-client';
import {
  clearSyncedAndExpiredActions,
  flushOfflineQueue,
  listOfflineActions,
  type OfflineQueuedAction,
} from '../../lib/mobile-offline-queue';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function MobileSyncPage() {
  const { accessToken } = useAuth();
  const [result, setResult] = useState<MobileSyncProcessResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localActions, setLocalActions] = useState<OfflineQueuedAction[]>([]);
  const [flushSummary, setFlushSummary] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  const bundleQuery = useStaffCachedQuery({
    queryKey: 'mobile/offline-bundle',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMobileOfflineBundle(accessToken!),
  });

  const bundle = bundleQuery.data;

  const refreshLocal = useCallback(async () => {
    setLocalActions(await listOfflineActions());
  }, []);

  useEffect(() => {
    void refreshLocal();
    function onOnline() {
      setIsOnline(true);
      if (!accessToken) return;
      void flushOfflineQueue(accessToken).then(async (summary) => {
        setFlushSummary(
          `Auto-sync: ${summary.synced} synced, ${summary.duplicate} duplicate, ${summary.failed} failed`,
        );
        await refreshLocal();
        await bundleQuery.refetch();
      });
    }
    function onOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [accessToken, refreshLocal, bundleQuery]);

  async function handleProcessSync() {
    if (!accessToken) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      const syncResult = await processMobileSync(accessToken);
      setResult(syncResult);
      const flush = await flushOfflineQueue(accessToken);
      setFlushSummary(
        `Technician flush: ${flush.synced} synced, ${flush.duplicate} duplicate, ${flush.failed} failed`,
      );
      await clearSyncedAndExpiredActions();
      await refreshLocal();
      await bundleQuery.refetch();
    } catch (err) {
      setActionError(
        err instanceof MobileApiClientError ? err.message : 'Unable to process sync queue',
      );
    } finally {
      setIsProcessing(false);
    }
  }

  const pendingCount = localActions.filter((a) => a.status !== 'synced').length;

  return (
    <div className="portal-page">
      <PageHeader
        title="Offline synchronization"
        description={
          isOnline
            ? bundle?.syncState.lastSyncedAt
              ? `Online · last synced ${new Date(bundle.syncState.lastSyncedAt).toLocaleString()}`
              : 'Online · review queued technician actions and process sync'
            : 'Offline · actions stay Pending until reconnection'
        }
      />

      <Panel title="Technician offline queue" description={`${pendingCount} unsynced action(s)`}>
        <p className="page-muted">
          States: Offline, Pending sync, Synced, Failed. Automatic flush runs on reconnect; use
          manual retry for failures. Idempotent via clientActionId.
        </p>
        <Button disabled={isProcessing || !accessToken} onClick={() => void handleProcessSync()}>
          {isProcessing ? 'Syncing…' : 'Process sync + flush offline queue'}
        </Button>
        {flushSummary ? (
          <p className="page-muted" style={{ marginTop: '0.75rem' }}>
            {flushSummary}
          </p>
        ) : null}
        {result ? (
          <p className="page-muted" style={{ marginTop: '0.75rem' }}>
            Observability queue: processed {result.processed}, failed {result.failed}, retried{' '}
            {result.retried}, conflicts {result.conflicts}
          </p>
        ) : null}
        {actionError ? <p className="form-error">{actionError}</p> : null}
        {localActions.length === 0 ? (
          <p className="page-muted" style={{ marginTop: '0.75rem' }}>
            No local offline actions stored.
          </p>
        ) : (
          <ul className="portal-list" style={{ marginTop: '0.75rem' }}>
            {localActions.map((item) => (
              <li key={item.id}>
                <strong>{item.actionType}</strong>
                <span>
                  {item.status} · job {item.jobId.slice(0, 8)}…
                  {item.errorMessage ? ` · ${item.errorMessage}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <AnalyticsTabPanel
        isLoading={bundleQuery.isLoading}
        error={bundleQuery.error}
        hasData={bundle !== undefined}
        isEmpty={false}
        emptyTitle="No sync data"
        emptyDescription="Offline sync is unavailable."
        loadingLabel="Loading offline sync…"
        onRetry={() => void bundleQuery.refetch()}
      >
        {bundle ? (
          <>
            <Panel title="Offline jobs" description={`${bundle.jobs.length} active job(s) cached`}>
              {bundle.jobs.length === 0 ? (
                <p className="page-muted">No offline jobs cached.</p>
              ) : (
                <ul className="portal-list">
                  {bundle.jobs.slice(0, 10).map((job) => (
                    <li key={job.id}>
                      <strong>{job.title}</strong>
                      <span>
                        {job.customerName} · {job.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Server sync queue" description={`${bundle.queue.length} pending item(s)`}>
              {bundle.queue.length === 0 ? (
                <p className="page-muted">Server sync queue is empty.</p>
              ) : (
                <ul className="portal-list">
                  {bundle.queue.map((item) => (
                    <li key={item.id}>
                      <strong>{item.resourceType}</strong>
                      <span>{item.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="Conflicts"
              description={`${bundle.conflicts.length} unresolved conflict(s)`}
            >
              {bundle.conflicts.length === 0 ? (
                <p className="page-muted">No sync conflicts.</p>
              ) : (
                <ul className="portal-list">
                  {bundle.conflicts.map((item) => (
                    <li key={item.id}>
                      <strong>{item.resourceType}</strong>
                      <span>{item.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
