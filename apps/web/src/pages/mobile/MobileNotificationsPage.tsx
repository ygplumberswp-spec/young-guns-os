import { PageHeader } from '../../components/ux';
import { useState } from 'react';
import { Panel } from '@titan/ui';
import { fetchMobileNotifications, markMobileNotificationRead } from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';

export function MobileNotificationsPage() {
  const { accessToken } = useAuth();
  const [actionError, setActionError] = useState<string | null>(null);

  const notificationsQuery = useStaffCachedQuery({
    queryKey: 'mobile/notifications',
    enabled: Boolean(accessToken),
    staleTimeMs: 20_000,
    fetcher: async () => fetchMobileNotifications(accessToken!),
  });

  const payload = notificationsQuery.data;
  const unreadCount = payload?.unreadCount ?? 0;

  async function handleMarkRead(id: string) {
    if (!accessToken || !payload) return;
    setActionError(null);
    try {
      await markMobileNotificationRead(accessToken, id);
      await notificationsQuery.refetch();
    } catch {
      setActionError('Unable to mark notification as read.');
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Notifications"
        description={payload ? `${unreadCount} unread` : 'Recent alerts and updates.'}
      />

      {actionError ? <p className="form-error">{actionError}</p> : null}

      <AnalyticsTabPanel
        isLoading={notificationsQuery.isLoading}
        error={notificationsQuery.error ?? actionError}
        hasData={payload !== undefined}
        isEmpty={payload !== undefined && payload.notifications.length === 0}
        emptyTitle="No notifications"
        emptyDescription="You are all caught up."
        loadingLabel="Loading notifications…"
        onRetry={() => void notificationsQuery.refetch()}
      >
        {payload && payload.notifications.length > 0 ? (
          <Panel title="Recent notifications">
            <ul className="portal-list">
              {payload.notifications.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.body} · {new Date(item.createdAt).toLocaleString()}
                    {!item.isRead ? (
                      <>
                        {' '}
                        ·{' '}
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => void handleMarkRead(item.id)}
                        >
                          Mark read
                        </button>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </AnalyticsTabPanel>
    </div>
  );
}
