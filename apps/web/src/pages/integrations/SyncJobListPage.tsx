import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { EmptyState, Panel } from '@titan/ui';
import type { IntegrationSyncJobSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchIntegrationSyncJobs } from '../../lib/integration-hub-api';
import { useAuth } from '../../lib/auth-context';
import { IntegrationsNav } from '../../features/integrations/IntegrationsNav';
import { canAccessIntegrations } from '../../features/integrations/utils';
import { formatSyncJobStatus } from '../../features/integrations/formatters';

export function SyncJobListPage() {
  const { accessToken, user } = useAuth();
  const [syncJobs, setSyncJobs] = useState<IntegrationSyncJobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessIntegrations(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadSyncJobs() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchIntegrationSyncJobs(accessToken);
        if (!cancelled) setSyncJobs(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load sync jobs');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadSyncJobs();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="integrations-page">
        <PageHeader title="Sync Jobs" description="You do not have permission to view sync jobs." />
      </div>
    );
  }

  return (
    <div className="integrations-page">
      <PageHeader
        title="Sync Jobs"
        description="Track integration sync runs across connected providers."
      />
      <IntegrationsNav />

      {isLoading ? <p className="page-muted">Loading sync jobs…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        syncJobs.length === 0 ? (
          <EmptyState
            title="No Sync Jobs Yet"
            description="Sync jobs are recorded when a provider sync is triggered. Connect a provider and run a sync to see history here."
            action={
              <Link href="/integrations/cartrack" className="button-link">
                Open Cartrack settings
              </Link>
            }
          />
        ) : (
          <Panel title="Sync Job History">
            <div className="integrations-table-wrap">
              <table className="integrations-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {syncJobs.map((job) => (
                    <tr key={job.id}>
                      <td>{job.providerName}</td>
                      <td>{job.jobType}</td>
                      <td>
                        <span className={`integrations-status integrations-status--${job.status}`}>
                          {formatSyncJobStatus(job.status)}
                        </span>
                      </td>
                      <td>{new Date(job.startedAt).toLocaleString()}</td>
                      <td>{job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'}</td>
                      <td>{job.errorMessage ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )
      ) : null}
    </div>
  );
}
