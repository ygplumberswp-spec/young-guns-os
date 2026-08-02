import { PageHeader } from '../../components/ux';
import { Link } from 'wouter';
import { Panel } from '@titan/ui';
import { fetchMobileWorkforceJobs } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function MobileJobsPage() {
  const { accessToken } = useAuth();

  const jobsQuery = useStaffCachedQuery({
    queryKey: 'mobile/workforce-jobs',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchMobileWorkforceJobs(accessToken!),
  });

  const jobs = jobsQuery.data;

  return (
    <div className="portal-page">
      <PageHeader title="My Jobs" description="Assigned jobs for today and upcoming work." />

      <AnalyticsTabPanel
        isLoading={jobsQuery.isLoading}
        error={jobsQuery.error}
        hasData={jobs !== undefined}
        isEmpty={jobs !== undefined && jobs.jobs.length === 0}
        emptyTitle="No Assigned Jobs"
        emptyDescription="You have no jobs assigned right now."
        loadingLabel="Loading jobs…"
        onRetry={() => void jobsQuery.refetch()}
      >
        {jobs && jobs.jobs.length > 0 ? (
          <div className="portal-grid">
            {jobs.jobs.map((job) => (
              <Panel key={job.id} title={job.title} description={job.customerName ?? 'Customer'}>
                <Link href={`/jobs/${job.id}`}>Open job</Link>
              </Panel>
            ))}
          </div>
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
