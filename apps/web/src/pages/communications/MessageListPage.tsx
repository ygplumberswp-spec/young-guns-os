import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import {
  COMMUNICATION_CHANNEL_OPTIONS,
  COMMUNICATION_DIRECTION_OPTIONS,
  type CommunicationSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCommunicationMessages } from '../../lib/communications-api';
import { useAuth } from '../../lib/auth-context';
import { CommunicationsNav } from '../../features/communications/CommunicationsNav';
import {
  canAccessCommunications,
  canManageCommunications,
} from '../../features/communications/utils';

function formatChannel(channel: CommunicationSummary['channel']): string {
  return COMMUNICATION_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel;
}

function formatDirection(direction: CommunicationSummary['direction']): string {
  return (
    COMMUNICATION_DIRECTION_OPTIONS.find((option) => option.value === direction)?.label ?? direction
  );
}

export function MessageListPage() {
  const { accessToken, user } = useAuth();
  const [messages, setMessages] = useState<CommunicationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(
    () => (user ? canAccessCommunications(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageCommunications(user.permissions) : false),
    [user],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchCommunicationMessages(accessToken);
        if (!cancelled) setMessages(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load communications');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadMessages();
    return () => { cancelled = true; };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="communications-page">
        <PageHeader title="Communications" description="You do not have permission to view communications." />
      </div>
    );
  }

  return (
    <div className="communications-page">
      <PageHeader
        title="Communications"
        description="Customer communication history and reusable message templates."
        actions={
          canWrite ? (
            <Link href="/communications/messages/new">
              <Button>Log communication</Button>
            </Link>
          ) : undefined
        }
      />
      <CommunicationsNav />

      {isLoading ? <p className="page-muted">Loading communications…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        messages.length === 0 ? (
          <EmptyState
            title="No communications yet"
            description="Log your first customer interaction to start building communication history."
            action={
              canWrite ? (
                <Link href="/communications/messages/new">
                  <Button>Log communication</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Panel title="Communication history">
            <div className="communications-table-wrap">
              <table className="communications-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Channel</th>
                    <th>Direction</th>
                    <th>Subject</th>
                    <th>Message</th>
                    <th>Author</th>
                    <th>Occurred</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((message) => (
                    <tr key={message.id}>
                      <td>
                        <Link href={`/crm/${message.customerId}`} className="communications-link">
                          {message.customerName}
                        </Link>
                      </td>
                      <td>{formatChannel(message.channel)}</td>
                      <td>{formatDirection(message.direction)}</td>
                      <td>{message.subject ?? '—'}</td>
                      <td className="communications-table__body">{message.body}</td>
                      <td>{message.authorName}</td>
                      <td>{new Date(message.occurredAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )
      ) : null}
    </div>
  );
}
