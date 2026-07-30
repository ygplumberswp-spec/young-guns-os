import { Link } from 'wouter';
import { PageHeader, Panel } from '@titan/ui';
import { formatMoney } from '@titan/shared';
import { fetchPortalExperienceDashboard } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';
import { usePortalCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function PortalDashboardPage() {
  const { accessToken, user } = usePortalAuth();

  const dashboardQuery = usePortalCachedQuery({
    queryKey: 'portal/experience-dashboard',
    enabled: Boolean(accessToken),
    staleTimeMs: 30_000,
    fetcher: async () => fetchPortalExperienceDashboard(accessToken!),
  });

  const dashboard = dashboardQuery.data;

  return (
    <div className="portal-page">
      <PageHeader
        title={`Welcome, ${user?.firstName ?? dashboard?.customerName ?? 'Customer'}`}
        description={
          dashboard
            ? `Self-service dashboard for ${dashboard.companyName}.`
            : 'Your customer portal home loads your jobs, quotes and invoices here.'
        }
      />

      <AnalyticsTabPanel
        isLoading={dashboardQuery.isLoading}
        error={dashboardQuery.error}
        hasData={dashboard !== undefined}
        isEmpty={dashboard !== undefined && !dashboard}
        loadingLabel="Loading dashboard…"
        onRetry={() => void dashboardQuery.refetch()}
      >
        {dashboard ? (
          <>
            <div className="portal-grid">
              <Panel
                title="Active jobs"
                description={`${dashboard.activeJobCount} active · ${dashboard.completedJobCount} completed`}
              >
                <Link href="/portal/jobs">View jobs</Link>
              </Panel>
              <Panel title="Quotes" description={`${dashboard.pendingQuoteCount} pending approval`}>
                <Link href="/portal/quotes">View quotes</Link>
              </Panel>
              <Panel
                title="Invoices"
                description={`${dashboard.outstandingInvoiceCount} outstanding · ${formatMoney(dashboard.outstandingBalanceCents, dashboard.currency)}`}
              >
                <Link href="/portal/finance">Open finance centre</Link>
              </Panel>
              <Panel title="Appointments" description={`${dashboard.upcomingAppointmentCount} upcoming`}>
                <Link href="/portal/appointments">View appointments</Link>
              </Panel>
              <Panel title="Notifications" description={`${dashboard.unreadNotificationCount} unread`}>
                <Link href="/portal/notifications">Open notifications</Link>
              </Panel>
              <Panel title="Help & knowledge" description="Search customer-visible articles and guides">
                <Link href="/portal/knowledge">Search knowledge</Link>
              </Panel>
            </div>

            {dashboard.recentCommunications.length > 0 ? (
              <Panel title="Recent communications">
                <ul className="portal-list">
                  {dashboard.recentCommunications.map((item) => (
                    <li key={item.id}>
                      <strong>{item.subject ?? item.channel}</strong>
                      <span>{new Date(item.occurredAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </>
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
