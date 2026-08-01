import { PageHeader } from '../../components/ux';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { EmptyState, Panel } from '@titan/ui';
import { PortalApiClientError, fetchPortalJobs } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';
import { toPortalNestedHref } from '../../lib/portal-routing';
import { formatPortalWhen } from '../../lib/portal-datetime';

export function PortalJobsPage() {
  const { accessToken } = usePortalAuth();
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof fetchPortalJobs>>['jobs']>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    void fetchPortalJobs(accessToken)
      .then((data) => setJobs(data.jobs))
      .catch((err) =>
        setError(err instanceof PortalApiClientError ? err.message : 'Unable to load jobs'),
      )
      .finally(() => setLoading(false));
  }, [accessToken]);

  return (
    <div className="portal-page">
      <PageHeader
        title="Job tracking"
        description="Open a job for live status, scheduled time, and technician ETA."
      />
      {error ? <p className="form-error">{error}</p> : null}
      <Panel title="Your jobs">
        {loading ? <p className="page-muted">Loading jobs…</p> : null}
        {!loading && jobs.length === 0 ? (
          <EmptyState
            className="titan-empty-state--compact"
            title="No jobs yet"
            description="Jobs linked to your account will appear here."
          />
        ) : null}
        {jobs.length > 0 ? (
          <ul className="portal-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link href={toPortalNestedHref(`/my/jobs/${job.id}`)} className="portal-list__link">
                  <strong>{job.title}</strong>
                  <span>{job.status.replace(/_/g, ' ')}</span>
                  {job.assignedUserName ? <span>Technician: {job.assignedUserName}</span> : null}
                  {job.scheduledAt ? (
                    <span className="tabular-nums">
                      Scheduled {new Date(job.scheduledAt).toLocaleString()}
                    </span>
                  ) : null}
                  {job.etaAt ? (
                    <span className="tabular-nums">ETA {formatPortalWhen(job.etaAt)}</span>
                  ) : null}

                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
