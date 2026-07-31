import { Link } from 'wouter';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
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

  return (
    <div className="portal-page">
      <PageHeader
        title={`Welcome, ${user?.firstName ?? 'Technician'}`}
        description={
          dashboard?.greeting.message ??
          'Your technician workspace loads assigned jobs, route and alerts here.'
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
              <Panel title="Assigned jobs" description={`${dashboard.assignedJobs.length} total`}>
                <Link href="/jobs">View jobs</Link>
              </Panel>
              <Panel
                title="Route"
                description={`${dashboard.routeSummary.stopCount} stops · next: ${dashboard.routeSummary.nextDestination?.title ?? 'None'}`}
              >
                <Link href="/route">View route</Link>
              </Panel>
              <Panel
                title="Inventory alerts"
                description={`${dashboard.inventoryAlerts.length} low-stock item(s)`}
              >
                <Link href="/inventory">View inventory</Link>
              </Panel>
              <Panel
                title="Outstanding tasks"
                description={`${dashboard.outstandingTaskCount} pending action(s)`}
              >
                <Link href="/sync">Offline sync</Link>
              </Panel>
              <Panel
                title="Notifications"
                description={`${dashboard.unreadNotificationCount} unread`}
              >
                <Link href="/notifications">Open notifications</Link>
              </Panel>
              <Panel
                title="Requests"
                description={`${dashboard.pendingRequestCount} pending approval`}
              >
                <Link href="/time">Time & requests</Link>
              </Panel>
            </div>

            {dashboard.safetyNotices.length > 0 ? (
              <Panel title="Safety notices">
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
              <Panel title="Company announcements">
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
        <EmptyState title="No dashboard data" description="Your mobile dashboard is empty." />
      ) : null}
    </div>
  );
}
