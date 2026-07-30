import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { PortalCustomerExperienceDashboard } from '@titan/shared';
import { formatMoney } from '@titan/shared';
import { PortalApiClientError, fetchPortalExperienceDashboard } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalDashboardPage() {
  const { accessToken, user } = usePortalAuth();
  const [dashboard, setDashboard] = useState<PortalCustomerExperienceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchPortalExperienceDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof PortalApiClientError ? err.message : 'Unable to load dashboard');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (isLoading) return <p className="page-muted">Loading dashboard…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!dashboard)
    return <EmptyState title="No dashboard data" description="Your portal dashboard is empty." />;

  return (
    <div className="portal-page">
      <PageHeader
        title={`Welcome, ${user?.firstName ?? dashboard.customerName}`}
        description={`Self-service dashboard for ${dashboard.companyName}.`}
      />

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
    </div>
  );
}
