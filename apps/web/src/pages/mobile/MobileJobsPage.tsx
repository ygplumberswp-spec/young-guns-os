import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { MobileWorkforceJobList } from '@titan/shared';
import { MobileApiClientError, fetchMobileWorkforceJobs } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';

export function MobileJobsPage() {
  const { accessToken } = useAuth();
  const [jobs, setJobs] = useState<MobileWorkforceJobList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchMobileWorkforceJobs(accessToken);
        if (!cancelled) setJobs(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof MobileApiClientError ? err.message : 'Unable to load jobs');
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

  if (isLoading) return <p className="page-muted">Loading jobs…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!jobs || jobs.jobs.length === 0) {
    return <EmptyState title="No assigned jobs" description="You have no jobs assigned right now." />;
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Assigned jobs"
        description={`${jobs.activeCount} active · ${jobs.completedCount} completed`}
      />
      <Panel title="Job list">
        <ul className="portal-list">
          {jobs.jobs.map((job) => (
            <li key={job.id}>
              <Link href={`/mobile/jobs/${job.id}`}>
                <strong>{job.title}</strong>
              </Link>
              <span>
                {job.customerName} · {job.status}
                {job.scheduledAt ? ` · ${new Date(job.scheduledAt).toLocaleString()}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
