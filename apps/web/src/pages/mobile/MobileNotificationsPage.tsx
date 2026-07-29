import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { NotificationSummary } from '@titan/shared';
import {
  MobileApiClientError,
  fetchMobileNotifications,
  markMobileNotificationRead,
} from '../../lib/mobile-api-client';
import { useAuth } from '../../lib/auth-context';

export function MobileNotificationsPage() {
  const { accessToken } = useAuth();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
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
        const data = await fetchMobileNotifications(accessToken);
        if (!cancelled) {
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof MobileApiClientError ? err.message : 'Unable to load notifications');
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

  async function handleMarkRead(id: string) {
    if (!accessToken) return;
    await markMobileNotificationRead(accessToken, id);
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
  }

  if (isLoading) return <p className="page-muted">Loading notifications…</p>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <div className="portal-page">
      <PageHeader title="Notifications" description={`${unreadCount} unread`} />

      {notifications.length === 0 ? (
        <EmptyState title="No notifications" description="You are all caught up." />
      ) : (
        <Panel title="Recent notifications">
          <ul className="portal-list">
            {notifications.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>
                  {item.body} · {new Date(item.createdAt).toLocaleString()}
                  {!item.isRead ? (
                    <>
                      {' '}
                      ·{' '}
                      <button type="button" className="link-button" onClick={() => void handleMarkRead(item.id)}>
                        Mark read
                      </button>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
