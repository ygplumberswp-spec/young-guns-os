import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, PageHeader } from '@titan/ui';
import { ApiClientError } from '../../lib/api-client';
import { fetchJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { canAccessJobs, canManageJobs, JobList } from '../../features/jobs/JobList';

export function JobListPage() {
  const { accessToken, user } = useAuth();
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof fetchJobs>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessJobs(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageJobs(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchJobs(accessToken);

        if (!cancelled) {
          setJobs(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load jobs');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadJobs();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="jobs-page">
        <PageHeader title="Jobs" description="You do not have permission to view jobs." />
      </div>
    );
  }

  return (
    <div className="jobs-page">
      <PageHeader
        title="Jobs"
        description="Track work linked to your customers."
        actions={
          canWrite ? (
            <Link href="/jobs/new">
              <Button>Create job</Button>
            </Link>
          ) : undefined
        }
      />

      {isLoading ? <p className="page-muted">Loading jobs…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? <JobList jobs={jobs} canWrite={canWrite} /> : null}
    </div>
  );
}
