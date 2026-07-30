import { useState } from 'react';
import { Button, PageHeader, Panel } from '@titan/ui';
import type { MobileSyncProcessResult } from '@titan/shared';
import {
  MobileApiClientError,
  fetchMobileOfflineBundle,
  processMobileSync,
} from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function MobileSyncPage() {
  const { accessToken } = useAuth();
  const [result, setResult] = useState<MobileSyncProcessResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const bundleQuery = useStaffCachedQuery({
    queryKey: 'mobile/offline-bundle',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMobileOfflineBundle(accessToken!),
  });

  const bundle = bundleQuery.data;

  async function handleProcessSync() {
    if (!accessToken) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      const syncResult = await processMobileSync(accessToken);
      setResult(syncResult);
      await bundleQuery.refetch();
    } catch (err) {
      setActionError(err instanceof MobileApiClientError ? err.message : 'Unable to process sync queue');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Offline synchronization"
        description={
          bundle?.syncState.lastSyncedAt
            ? `Last synced ${new Date(bundle.syncState.lastSyncedAt).toLocaleString()}`
            : 'Review cached jobs and process the sync queue.'
        }
      />

      <Panel title="Process sync">
        <Button disabled={isProcessing} onClick={() => void handleProcessSync()}>
          {isProcessing ? 'Processing…' : 'Process sync queue'}
        </Button>
        {result ? (
          <p className="page-muted" style={{ marginTop: '0.75rem' }}>
            Processed {result.processed}, failed {result.failed}, retried {result.retried}, conflicts{' '}
            {result.conflicts}
          </p>
        ) : null}
        {actionError ? <p className="form-error">{actionError}</p> : null}
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

            <Panel title="Sync queue" description={`${bundle.queue.length} pending item(s)`}>
              {bundle.queue.length === 0 ? (
                <p className="page-muted">Sync queue is empty.</p>
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

            <Panel title="Conflicts" description={`${bundle.conflicts.length} unresolved conflict(s)`}>
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
