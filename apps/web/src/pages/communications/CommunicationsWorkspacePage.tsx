import { PageHeader } from '../../components/ux';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageLoadState, Panel } from '@titan/ui';
import type {
  CommunicationsIntegrationState,
  CommunicationsWorkspaceChannel,
  CommunicationsWorkspaceConversation,
  CommunicationsWorkspaceQueue,
} from '@titan/shared';
import {
  COMMUNICATIONS_WORKSPACE_CHANNEL_OPTIONS,
  COMMUNICATIONS_WORKSPACE_QUEUE_OPTIONS,
} from '@titan/shared';
import { fetchCommunicationsWorkspace } from '../../lib/communications-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { CommunicationsNav } from '../../features/communications/CommunicationsNav';
import { canAccessCommunications, canManageCommunications } from '../../features/communications/utils';

function integrationStateClass(state: CommunicationsIntegrationState): string {
  switch (state) {
    case 'connected':
      return 'status-pill status-pill--active';
    case 'syncing':
      return 'status-pill status-pill--attention';
    case 'error':
      return 'status-pill status-pill--error';
    case 'provider_unavailable':
    case 'not_configured':
    default:
      return 'status-pill status-pill--disabled';
  }
}

function formatIntegrationState(state: CommunicationsIntegrationState): string {
  return state.replace(/_/g, ' ');
}

function formatChannel(channel: CommunicationsWorkspaceChannel): string {
  return (
    COMMUNICATIONS_WORKSPACE_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ??
    channel
  );
}

function EntityLinks({ entities }: { entities: CommunicationsWorkspaceConversation['entities'] }) {
  const links: Array<{ href: string; label: string }> = [];
  if (entities.leadId) {
    links.push({ href: `/leads/${entities.leadId}`, label: entities.leadName ?? 'Lead' });
  }
  if (entities.customerId) {
    links.push({
      href: `/crm/${entities.customerId}`,
      label: entities.customerName ?? 'Customer',
    });
  }
  if (entities.jobId) {
    links.push({
      href: `/jobs/${entities.jobId}`,
      label: entities.jobNumber ?? 'Job',
    });
  }
  if (entities.quoteId) {
    links.push({
      href: `/finance/quotes/${entities.quoteId}`,
      label: entities.quoteNumber ?? 'Quote',
    });
  }
  if (entities.invoiceId) {
    links.push({
      href: `/finance/invoices/${entities.invoiceId}`,
      label: entities.invoiceNumber ?? 'Invoice',
    });
  }
  if (entities.supplierId) {
    links.push({
      href: `/procurement/suppliers/${entities.supplierId}`,
      label: entities.supplierName ?? 'Supplier',
    });
  }
  if (entities.staffId) {
    links.push({
      href: `/settings/team`,
      label: entities.staffName ?? 'Staff',
    });
  }

  if (links.length === 0) {
    return <span className="page-muted">—</span>;
  }

  return (
    <span className="communications-entity-links">
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? ' · ' : null}
          <Link href={link.href} className="communications-link">
            {link.label}
          </Link>
        </span>
      ))}
    </span>
  );
}

export function CommunicationsWorkspacePage() {
  const { accessToken, user } = useAuth();
  const [queueFilter, setQueueFilter] = useState<CommunicationsWorkspaceQueue | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<CommunicationsWorkspaceChannel | 'all'>(
    'all',
  );

  const canView = useMemo(() => (user ? canAccessCommunications(user.permissions) : false), [user]);
  const canWrite = useMemo(
    () => (user ? canManageCommunications(user.permissions) : false),
    [user],
  );

  const { data: workspace, error, isLoading } = useCachedQuery({
    queryKey: 'communications/workspace',
    accessToken,
    enabled: canView,
    staleTimeMs: 20_000,
    fetcher: async () => fetchCommunicationsWorkspace(accessToken!),
  });

  const filteredConversations = useMemo(() => {
    if (!workspace) return [];
    return workspace.conversations.filter((row) => {
      const queueOk = queueFilter === 'all' || row.queues.includes(queueFilter);
      const channelOk = channelFilter === 'all' || row.channel === channelFilter;
      return queueOk && channelOk;
    });
  }, [workspace, queueFilter, channelFilter]);

  if (!canView) {
    return (
      <div className="communications-page">
        <PageHeader
          title="Communications inbox"
          description="You do not have permission to view the company communications workspace."
        />
      </div>
    );
  }

  return (
    <div className="communications-page">
      <PageHeader
        title="Communications inbox"
        description="Unified workspace — real provider states, queue filters, and entity links. AURA may draft only; sends require approval."
        actions={
          canWrite ? (
            <Link href="/communications/messages/new">
              <Button>Log communication</Button>
            </Link>
          ) : undefined
        }
      />
      <CommunicationsNav />

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={false}
        loadingLabel="Loading communications workspace…"
      >
        {workspace ? (
          <>
            <Panel title="Channel integrations">
              <div className="communications-integration-grid">
                {workspace.integrations.map((integration) => (
                  <div key={integration.channel} className="communications-integration-card">
                    <strong>{integration.label}</strong>
                    <span className={integrationStateClass(integration.state)}>
                      {formatIntegrationState(integration.state)}
                    </span>
                    {integration.detail ? <p className="page-muted">{integration.detail}</p> : null}
                  </div>
                ))}
              </div>
            </Panel>

            <div className="communications-workspace-filters">
              <div
                className="ux-multi-status-filter"
                role="group"
                aria-label="Communications queue filter"
              >
                <button
                  type="button"
                  className={`ux-multi-status-filter__pill${queueFilter === 'all' ? ' ux-multi-status-filter__pill--active' : ''}`}
                  aria-pressed={queueFilter === 'all'}
                  onClick={() => setQueueFilter('all')}
                >
                  All queues
                </button>
                {COMMUNICATIONS_WORKSPACE_QUEUE_OPTIONS.map((option) => {
                  const count =
                    workspace.queueSummaries.find((row) => row.queue === option.value)?.count ?? 0;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`ux-multi-status-filter__pill${queueFilter === option.value ? ' ux-multi-status-filter__pill--active' : ''}`}
                      aria-pressed={queueFilter === option.value}
                      onClick={() => setQueueFilter(option.value)}
                    >
                      {option.label} ({count})
                    </button>
                  );
                })}
              </div>

              <div
                className="ux-multi-status-filter"
                role="group"
                aria-label="Communications channel filter"
              >
                <button
                  type="button"
                  className={`ux-multi-status-filter__pill${channelFilter === 'all' ? ' ux-multi-status-filter__pill--active' : ''}`}
                  aria-pressed={channelFilter === 'all'}
                  onClick={() => setChannelFilter('all')}
                >
                  All channels
                </button>
                {COMMUNICATIONS_WORKSPACE_CHANNEL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`ux-multi-status-filter__pill${channelFilter === option.value ? ' ux-multi-status-filter__pill--active' : ''}`}
                    aria-pressed={channelFilter === option.value}
                    onClick={() => setChannelFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="page-muted">{workspace.summary}</p>

            {filteredConversations.length === 0 ? (
              <EmptyState
                title="No conversations in this view"
                description="Queues and channels are functional — staging has no synced provider conversations yet. Log a communication or connect WhatsApp/email in Integrations."
              />
            ) : (
              <Panel title="Conversations">
                <div className="communications-table-wrap">
                  <table className="communications-table communications-workspace-table">
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Queues</th>
                        <th>Direction</th>
                        <th>Subject</th>
                        <th>Preview</th>
                        <th>Entities</th>
                        <th>Unread</th>
                        <th>Occurred</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredConversations.map((row) => (
                        <tr key={row.id}>
                          <td>{formatChannel(row.channel)}</td>
                          <td>
                            {row.queues.length > 0
                              ? row.queues
                                  .map(
                                    (queue) =>
                                      COMMUNICATIONS_WORKSPACE_QUEUE_OPTIONS.find(
                                        (option) => option.value === queue,
                                      )?.label ?? queue,
                                  )
                                  .join(', ')
                              : '—'}
                          </td>
                          <td>{row.direction}</td>
                          <td>{row.subject}</td>
                          <td className="communications-table__body">{row.preview}</td>
                          <td>
                            <EntityLinks entities={row.entities} />
                          </td>
                          <td>{row.isUnread ? 'Yes' : '—'}</td>
                          <td>{new Date(row.occurredAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </>
        ) : null}
      </PageLoadState>
    </div>
  );
}
