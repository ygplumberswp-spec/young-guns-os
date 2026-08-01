import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { PageLoadState } from '@titan/ui';
import { fetchJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { canAccessJobs, canManageJobs, JobList } from '../../features/jobs/JobList';
import { BulkActionBar, MoreMenu, PageHeader, PrimaryAction } from '../../components/ux';

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
  } = useStaffCachedQuery({
    queryKey: `jobs/list:${debouncedSearch}`,
    enabled: canView,
    fetcher: async () => fetchJobs(accessToken!, debouncedSearch),
  });

  const jobRows = jobs ?? [];
  const allSelected = jobRows.length > 0 && selectedIds.size === jobRows.length;

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
          <>
            {canWrite ? (
              <Link href="/jobs/new">
                <PrimaryAction>Create job</PrimaryAction>
              </Link>
            ) : null}
            <MoreMenu
              items={[
                { id: 'export', label: 'Export list (scaffold)', disabled: true },
                { id: 'archive', label: 'Archive selected (scaffold)', disabled: !canWrite },
              ]}
            />
          </>
        }
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        totalCount={jobRows.length}
        allSelected={allSelected}
        onSelectAll={(checked) => {
          setSelectedIds(checked ? new Set(jobRows.map((job) => job.id)) : new Set());
        }}
        actions={[
          {
            id: 'assign',
            label: 'Assign technician',
            disabled: !canWrite || selectedIds.size === 0,
            onClick: () => undefined,
          },
          {
            id: 'status',
            label: 'Update status',
            disabled: !canWrite || selectedIds.size === 0,
            onClick: () => undefined,
          },
        ]}
      />

      <PageLoadState
        isLoading={isLoading && jobs === undefined}
        error={error && jobs === undefined ? error : null}
        isEmpty={false}
        emptyTitle="No jobs yet"
        emptyDescription="Create a job to track work for your customers."
        loadingLabel="Loading jobs…"
      >
        <JobList
          jobs={jobRows}
          canWrite={canWrite}
          search={search}
          onSearchChange={setSearch}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      </PageLoadState>
    </div>
  );
}
