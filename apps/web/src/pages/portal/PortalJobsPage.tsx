import { useEffect, useState } from 'react';
import { PageHeader, Panel } from '@titan/ui';
import { PortalApiClientError, fetchPortalJobs } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalJobsPage() {
  const { accessToken } = usePortalAuth();
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof fetchPortalJobs>>['jobs']>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchPortalJobs(accessToken)
      .then((data) => setJobs(data.jobs))
      .catch((err) => setError(err instanceof PortalApiClientError ? err.message : 'Unable to load jobs'));
  }, [accessToken]);

  return (
    <div className="portal-page">
      <PageHeader title="Job tracking" description="Live status and updates for your jobs." />
      {error ? <p className="form-error">{error}</p> : null}
      <Panel title="Your jobs">
        <ul className="portal-list">
          {jobs.map((job) => (
            <li key={job.id}>
              <strong>{job.title}</strong>
              <span>{job.status.replace(/_/g, ' ')}</span>
              {job.assignedUserName ? <span>Technician: {job.assignedUserName}</span> : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
