import { useEffect, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import type { MobileOfflineBundle, MobileSyncProcessResult } from '@titan/shared';
import {
  MobileApiClientError,
  fetchMobileOfflineBundle,
  processMobileSync,
} from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';

export function MobileSyncPage() {
  const { accessToken } = useAuth();
  const [bundle, setBundle] = useState<MobileOfflineBundle | null>(null);
  const [result, setResult] = useState<MobileSyncProcessResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadBundle() {
    if (!accessToken) return;
    const data = await fetchMobileOfflineBundle(accessToken);
    setBundle(data);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchMobileOfflineBundle(accessToken);
        if (!cancelled) setBundle(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof MobileApiClientError ? err.message : 'Unable to load offline bundle');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleProcessSync() {
    if (!accessToken) return;
    setIsProcessing(true);
    setError(null);
    try {
      const syncResult = await processMobileSync(accessToken);
      setResult(syncResult);
      await loadBundle();
    } catch (err) {
      setError(err instanceof MobileApiClientError ? err.message : 'Unable to process sync queue');
    } finally {
      setIsProcessing(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading offline sync…</p>;
  if (error && !bundle) return <p className="form-error">{error}</p>;
  if (!bundle) return <EmptyState title="No sync data" description="Offline sync is unavailable." />;

  return (
    <div className="portal-page">
      <PageHeader
        title="Offline synchronization"
        description={
          bundle.syncState.lastSyncedAt
            ? `Last synced ${new Date(bundle.syncState.lastSyncedAt).toLocaleString()}`
            : 'Not synced yet'
        }
      />

      <Panel title="Offline jobs" description={`${bundle.jobs.length} active job(s) cached`}>
        {bundle.jobs.length === 0 ? (
          <p className="page-muted">No offline jobs cached.</p>
        ) : (
          <ul className="portal-list">
            {bundle.jobs.slice(0, 10).map((job) => (
              <li key={job.id}>
                <strong>{job.title}</strong>
                <span>{job.customerName} · {job.status}</span>
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
        {error ? <p className="form-error">{error}</p> : null}
      </Panel>
    </div>
  );
}
