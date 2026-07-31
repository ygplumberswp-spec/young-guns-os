import { useEffect, useState } from 'react';
import { PageHeader, Panel } from '@titan/ui';
import type { NotificationSummary } from '@titan/shared';
import { PortalApiClientError, fetchPortalNotifications } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalNotificationsPage() {
  const { accessToken } = usePortalAuth();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchPortalNotifications(accessToken)
      .then(setNotifications)
      .catch((err) =>
        setError(
          err instanceof PortalApiClientError ? err.message : 'Unable to load notifications',
        ),
      );
  }, [accessToken]);

  return (
    <div className="portal-page">
      <PageHeader
        title="Notifications"
        description="Job, quote, invoice, appointment, and support updates."
      />
      {error ? <p className="form-error">{error}</p> : null}
      <Panel title="Notification centre">
        <ul className="portal-list">
          {notifications.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.isRead ? 'Read' : 'Unread'}</span>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
