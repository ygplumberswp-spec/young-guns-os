import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel } from '@titan/ui';
import { hasAnyPermission } from '@titan/auth/browser';
import { fetchTodaysJobs } from '../../lib/jobs-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { DashboardPanelEmptyIcon } from './DashboardPanelEmptyIcon';

/** UX-012 — Upcoming Work lists today's scheduled jobs from live TITAN data. */
export function DashboardEmptyPanels() {
  const { accessToken, user } = useAuth();
  const canViewJobs = Boolean(
    user && hasAnyPermission(user.permissions, ['jobs:read', 'jobs:write']),
  );

  const todayJobs = useStaffCachedQuery({
    queryKey: 'jobs/today',
    enabled: Boolean(accessToken && canViewJobs),
    fetcher: async () => fetchTodaysJobs(accessToken!),
  });

  const jobs = todayJobs.data ?? [];

  return (
    <section className="dashboard-panels">
      <Panel
        title="Upcoming Work"
        description="Scheduled and in-progress jobs for today"
      >
        {!canViewJobs ? (
          <EmptyState
            title="Jobs not available"
            description="You do not have permission to view today's schedule."
            icon={<DashboardPanelEmptyIcon panelId="upcoming-work" />}
            className="dashboard-panel-empty titan-empty-state--compact"
          />
        ) : todayJobs.isLoading && !todayJobs.data ? (
          <LoadingState label="Loading today's jobs…" />
        ) : todayJobs.error ? (
          <EmptyState
            title="Unable to load today's jobs"
            description={todayJobs.error}
            icon={<DashboardPanelEmptyIcon panelId="upcoming-work" />}
            className="dashboard-panel-empty titan-empty-state--compact"
            action={
              <Button size="sm" variant="secondary" onClick={() => void todayJobs.refetch()}>
                Retry
              </Button>
            }
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="Nothing scheduled today"
            description="Scheduled jobs for today will appear here once assigned."
            icon={<DashboardPanelEmptyIcon panelId="upcoming-work" />}
            className="dashboard-panel-empty titan-empty-state--compact"
            action={
              <Link href="/jobs/new">
                <Button size="sm" variant="secondary">
                  Schedule job
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="portal-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`}>
                  <strong>
                    {job.jobNumber ? `${job.jobNumber} · ` : ''}
                    {job.title}
                  </strong>
                </Link>
                <span>
                  {job.customerName}
                  {job.addressDisplay ? ` · ${job.addressDisplay}` : ''}
                  {job.scheduledAt
                    ? ` · ${new Date(job.scheduledAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : ''}
                  {` · ${job.status.replace(/_/g, ' ')}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Attention" description="Operational signals that need a look">
        <EmptyState
          title="Use KPI cards above"
          description="Outstanding AR, stock alerts, fleet in-use and active leads are shown as live KPI cards when you have access. They are never fabricated."
          icon={<DashboardPanelEmptyIcon panelId="recent-activity" />}
          className="dashboard-panel-empty titan-empty-state--compact"
          action={
            <Link href="/scheduling">
              <Button size="sm" variant="secondary">
                Open schedule
              </Button>
            </Link>
          }
        />
      </Panel>
    </section>
  );
}
