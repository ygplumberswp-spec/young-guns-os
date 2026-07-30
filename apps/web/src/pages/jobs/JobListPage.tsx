import { useMemo } from 'react';
import { Link } from 'wouter';
import { Button, PageHeader, PageLoadState } from '@titan/ui';
import { fetchJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { canAccessJobs, canManageJobs, JobList } from '../../features/jobs/JobList';

export function JobListPage() {
  const { accessToken, user } = useAuth();

  const canView = useMemo(() => (user ? canAccessJobs(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageJobs(user.permissions) : false), [user]);

  const { data: jobs, error, isLoading } = useCachedQuery({
    queryKey: 'jobs/list',
    accessToken,
    enabled: canView,
    staleTimeMs: 30_000,
    fetcher: async () => fetchJobs(accessToken!),
  });

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

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={(jobs?.length ?? 0) === 0}
        emptyTitle="No jobs yet"
        emptyDescription="Create a job to track work for your customers."
        loadingLabel="Loading jobs…"
      >
        <JobList jobs={jobs ?? []} canWrite={canWrite} />
      </PageLoadState>
    </div>
  );
}
