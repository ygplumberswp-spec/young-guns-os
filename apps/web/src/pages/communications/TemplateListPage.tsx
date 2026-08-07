import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import { COMMUNICATION_CHANNEL_OPTIONS, type MessageTemplateSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchMessageTemplates } from '../../lib/communications-api';
import { useAuth } from '../../lib/auth-context';
import { CommunicationsNav } from '../../features/communications/CommunicationsNav';
import {
  canAccessCommunications,
  canManageCommunications,
} from '../../features/communications/utils';

function formatChannel(channel: MessageTemplateSummary['channel']): string {
  return COMMUNICATION_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel;
}

export function TemplateListPage() {
  const { accessToken, user } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessCommunications(user.permissions) : false), [user]);
  const canWrite = useMemo(
    () => (user ? canManageCommunications(user.permissions) : false),
    [user],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchMessageTemplates(accessToken);
        if (!cancelled) setTemplates(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load templates');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="communications-page">
        <PageHeader
          title="Templates"
          description="You do not have permission to view communications."
        />
      </div>
    );
  }

  return (
    <div className="communications-page">
      <PageHeader
        title="Communications"
        description="Reusable message templates for customer outreach and follow-up."
        actions={
          canWrite ? (
            <Link href="/communications/templates/new">
              <Button>New Template</Button>
            </Link>
          ) : undefined
        }
      />
      <CommunicationsNav />

      {isLoading ? <p className="page-muted">Loading templates…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        templates.length === 0 ? (
          <EmptyState
            title="No Templates Yet"
            description="Create reusable message templates for common customer communications."
            action={
              canWrite ? (
                <Link href="/communications/templates/new">
                  <Button>New Template</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Panel title="Message Templates">
            <div className="communications-table-wrap">
              <table className="communications-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Channel</th>
                    <th>Subject</th>
                    <th>Body</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.name}</td>
                      <td>{formatChannel(template.channel)}</td>
                      <td>{template.subject ?? '—'}</td>
                      <td className="communications-table__body">{template.body}</td>
                      <td>{new Date(template.updatedAt).toLocaleDateString()}</td>
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
