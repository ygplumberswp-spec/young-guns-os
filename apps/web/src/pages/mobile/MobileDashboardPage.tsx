import { PageHeader } from '../../components/ux';
import { Link } from 'wouter';
import { EmptyState, Panel } from '@titan/ui';
import { countTechnicianActiveAssignedJobs } from '@titan/shared';
import { fetchMobileWorkforceDashboard } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function MobileDashboardPage() {
  const { accessToken, user } = useAuth();

  const dashboardQuery = useStaffCachedQuery({
    queryKey: 'mobile/workforce-dashboard',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: (signal) => fetchMobileWorkforceDashboard(accessToken!, { signal }),
  });

  const dashboard = dashboardQuery.data;
  const activeAssignedCount = dashboard
    ? countTechnicianActiveAssignedJobs(dashboard.assignedJobs)
    : 0;

  return (
    <div className="portal-page">
      <PageHeader
        title={`Welcome, ${user?.firstName ?? 'Technician'}`}
        description={
          dashboard?.greeting.message ??
          'Your technician workspace loads assigned jobs, route and field tools here.'
        }
      />

      <AnalyticsTabPanel
        isLoading={dashboardQuery.isLoading}
        error={dashboardQuery.error}
        hasData={dashboard !== undefined}
        loadingLabel="Loading today…"
        onRetry={() => void dashboardQuery.refetch()}
      >
        {dashboard ? (
          <>
            <div className="portal-grid">
              <Panel title="Assigned Jobs" description={`${activeAssignedCount} active`}>
                <Link href="/jobs">View jobs</Link>
              </Panel>
              <Panel
                title="Route"
                description={`${dashboard.routeSummary.stopCount} stops · next: ${dashboard.routeSummary.nextDestination?.title ?? 'None'}`}
              >
                <Link href="/route">View route</Link>
              </Panel>
              <Panel title="Parts Used" description="Log parts and returns on your job cards">
                <Link href="/inventory">Open parts</Link>
              </Panel>
              <Panel
                title="Outstanding Tasks"
                description={`${dashboard.outstandingTaskCount} pending action(s)`}
              >
                <Link href="/sync">Offline sync</Link>
              </Panel>
              <Panel
                title="Messages"
                description={`${dashboard.pendingRequestCount} office request(s) · job threads`}
              >
                <Link href="/messages">Open messages</Link>
              </Panel>
              <Panel
                title="Notifications"
                description={`${dashboard.unreadNotificationCount} unread`}
              >
                <Link href="/notifications">Open notifications</Link>
              </Panel>
            </div>

            {dashboard.safetyNotices.length > 0 ? (
              <Panel title="Safety Notices">
                <ul className="portal-list">
                  {dashboard.safetyNotices.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            {dashboard.companyAnnouncements.length > 0 ? (
              <Panel title="Company Announcements">
                <ul className="portal-list">
                  {dashboard.companyAnnouncements.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </>
        ) : null}
      </AnalyticsTabPanel>

      {!dashboardQuery.isLoading && dashboard === undefined && !dashboardQuery.error ? (
        <EmptyState title="No Dashboard Data" description="Your mobile dashboard is empty." />
      ) : null}
    </div>
  );
}
