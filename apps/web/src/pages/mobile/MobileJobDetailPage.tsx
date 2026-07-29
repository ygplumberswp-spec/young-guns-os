import { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { MobileJobExecutionWorkspace } from '@titan/shared';
import { MobileApiClientError, fetchMobileJobWorkspace } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';

export function MobileJobDetailPage() {
  const { accessToken } = useAuth();
  const [, params] = useRoute('/mobile/jobs/:jobId');
  const jobId = params?.jobId;
  const [workspace, setWorkspace] = useState<MobileJobExecutionWorkspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !jobId) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchMobileJobWorkspace(accessToken, jobId);
        if (!cancelled) setWorkspace(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof MobileApiClientError ? err.message : 'Unable to load job workspace');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, jobId]);

  if (isLoading) return <p className="page-muted">Loading job workspace…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!workspace) return <EmptyState title="Job not found" description="This job is not assigned to you." />;

  return (
    <div className="portal-page">
      <PageHeader title={workspace.title} description={`Status: ${workspace.status}`} />

      <Panel title="Customer">
        <p>{workspace.customer.name}</p>
        {workspace.customer.phone ? <p>{workspace.customer.phone}</p> : null}
        {workspace.customer.email ? <p>{workspace.customer.email}</p> : null}
      </Panel>

      {workspace.workInstructions ? (
        <Panel title="Work instructions">
          <p>{workspace.workInstructions}</p>
        </Panel>
      ) : null}

      {workspace.completionSummary ? (
        <Panel title="Completion summary">
          <p>{workspace.completionSummary}</p>
        </Panel>
      ) : null}

      <Panel title="Labor time" description={`${workspace.laborTimeEntries.length} entry(ies)`}>
        {workspace.laborTimeEntries.length === 0 ? (
          <p className="page-muted">No time entries recorded.</p>
        ) : (
          <ul className="portal-list">
            {workspace.laborTimeEntries.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.entryType}</strong>
                <span>
                  {new Date(entry.startedAt).toLocaleString()}
                  {entry.durationMinutes ? ` · ${entry.durationMinutes} min` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Materials used" description={`${workspace.materialsUsed.length} submission(s)`}>
        {workspace.materialsUsed.length === 0 ? (
          <p className="page-muted">No inventory usage submitted.</p>
        ) : (
          <ul className="portal-list">
            {workspace.materialsUsed.map((item) => (
              <li key={item.id}>
                <strong>{item.itemName}</strong>
                <span>
                  {item.quantity} × {item.itemSku} · {item.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Site documentation" description={`${workspace.documentation.length} item(s)`}>
        {workspace.documentation.length === 0 ? (
          <p className="page-muted">No documentation uploaded.</p>
        ) : (
          <ul className="portal-list">
            {workspace.documentation.map((doc) => (
              <li key={doc.id}>
                <strong>{doc.title}</strong>
                <span>
                  {doc.documentationType}
                  {doc.fileName ? ` · ${doc.fileName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
