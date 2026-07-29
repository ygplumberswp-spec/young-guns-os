import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { MobileWorkforceDashboard } from '@titan/shared';
import { MobileApiClientError, fetchMobileWorkforceDashboard } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';

export function MobileDashboardPage() {
  const { accessToken, user } = useAuth();
  const [dashboard, setDashboard] = useState<MobileWorkforceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchMobileWorkforceDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof MobileApiClientError ? err.message : 'Unable to load dashboard');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (isLoading) return <p className="page-muted">Loading dashboard…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!dashboard) return <EmptyState title="No dashboard data" description="Your mobile dashboard is empty." />;

  return (
    <div className="portal-page">
      <PageHeader
        title={`Welcome, ${user?.firstName ?? 'Technician'}`}
        description={dashboard.greeting.message}
      />

      <div className="portal-grid">
        <Panel title="Assigned jobs" description={`${dashboard.assignedJobs.length} total`}>
          <Link href="/mobile/jobs">View jobs</Link>
        </Panel>
        <Panel title="Route" description={`${dashboard.routeSummary.stopCount} stops · next: ${dashboard.routeSummary.nextDestination?.title ?? 'None'}`}>
          <Link href="/mobile/route">View route</Link>
        </Panel>
        <Panel title="Inventory alerts" description={`${dashboard.inventoryAlerts.length} low-stock item(s)`}>
          <Link href="/mobile/inventory">View inventory</Link>
        </Panel>
        <Panel title="Outstanding tasks" description={`${dashboard.outstandingTaskCount} pending action(s)`}>
          <Link href="/mobile/sync">Offline sync</Link>
        </Panel>
        <Panel title="Notifications" description={`${dashboard.unreadNotificationCount} unread`}>
          <Link href="/mobile/notifications">Open notifications</Link>
        </Panel>
        <Panel title="Requests" description={`${dashboard.pendingRequestCount} pending approval`}>
          <Link href="/mobile/time">Time & requests</Link>
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
    </div>
  );
}
