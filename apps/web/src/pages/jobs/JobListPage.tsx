import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { PageLoadState } from '@titan/ui';
import { fetchJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { canAccessJobs, canManageJobs, JobList } from '../../features/jobs/JobList';
import { PageHeader, PrimaryAction } from '../../components/ux';

export function JobListPage() {
  const { accessToken, user } = useAuth();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const canView = useMemo(() => (user ? canAccessJobs(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageJobs(user.permissions) : false), [user]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const {
    data: jobs,
    error,
    isLoading,
    refetch,
  } = useStaffCachedQuery({
    queryKey: `jobs/list:${debouncedSearch}`,
    enabled: canView,
    fetcher: async () => fetchJobs(accessToken!, debouncedSearch),
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
        description="Operational job board — number, site, priority and technician."
        breadcrumbs={[{ label: 'Operations', href: '/jobs' }, { label: 'Jobs' }]}
        actions={
          canWrite ? (
            <Link href="/jobs/new">
              <PrimaryAction>Create job</PrimaryAction>
            </Link>
          ) : null
        }
      />

      <PageLoadState
        isLoading={isLoading && jobs === undefined}
        error={error && jobs === undefined ? error : null}
        isEmpty={false}
        emptyTitle="No Jobs Yet"
        emptyDescription="Create a job to track work for your customers."
        loadingLabel="Loading jobs…"
      >
        <JobList
          jobs={jobs ?? []}
          canWrite={canWrite}
          accessToken={accessToken}
          search={search}
          onSearchChange={setSearch}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          onRefresh={async () => {
            await refetch();
          }}
        />
      </PageLoadState>
    </div>
  );
}
