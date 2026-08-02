import { PageHeader } from '../../components/ux';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageLoadState, Panel } from '@titan/ui';
import type {
  ComplianceWorkspaceItem,
  ComplianceWorkspaceQueue,
} from '@titan/shared';
import { COMPLIANCE_WORKSPACE_QUEUE_OPTIONS } from '@titan/shared';
import { fetchDocumentsComplianceWorkspace } from '../../lib/documents-api';
import { useAuth } from '../../lib/auth-context';
import { useCachedQuery } from '../../lib/use-cached-query';
import { DocumentsNav } from '../../features/documents/DocumentsNav';
import { canAccessDocuments, canManageDocuments } from '../../features/documents/utils';

function EntityLinks({ entities }: { entities: ComplianceWorkspaceItem['entities'] }) {
  const links: Array<{ href: string; label: string }> = [];
  if (entities.jobId) {
    links.push({
      href: `/jobs/${entities.jobId}`,
      label: entities.jobNumber ?? 'Job',
    });
  }
  if (entities.customerId) {
    links.push({
      href: `/crm/${entities.customerId}`,
      label: entities.customerName ?? 'Customer',
    });
  }
  if (entities.documentId) {
    links.push({
      href: `/documents/${entities.documentId}`,
      label: entities.documentTitle ?? 'Document',
    });
  }
  if (entities.vehicleId) {
    links.push({
      href: '/fleet/vehicles',
      label: entities.vehicleName ?? 'Vehicle',
    });
  }
  if (entities.assetId) {
    links.push({
      href: '/assets',
      label: entities.assetName ?? 'Asset',
    });
  }

  if (links.length === 0) {
    return <span className="page-muted">—</span>;
  }

  return (
    <span className="documents-entity-links">
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? ' · ' : null}
          <Link href={link.href} className="documents-link">
            {link.label}
          </Link>
        </span>
      ))}
    </span>
  );
}

export function ComplianceWorkspacePage() {
  const { accessToken, user } = useAuth();
  const [queueFilter, setQueueFilter] = useState<ComplianceWorkspaceQueue | 'all'>('all');

  const canView = useMemo(() => (user ? canAccessDocuments(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageDocuments(user.permissions) : false), [user]);

  const { data: workspace, error, isLoading } = useCachedQuery({
    queryKey: 'documents/compliance/workspace',
    accessToken,
    enabled: canView,
    staleTimeMs: 20_000,
    fetcher: async () => fetchDocumentsComplianceWorkspace(accessToken!),
  });

  const filteredItems = useMemo(() => {
    if (!workspace) return [];
    if (queueFilter === 'all') return workspace.items;
    return workspace.items.filter((row) => row.queues.includes(queueFilter));
  }, [workspace, queueFilter]);

  if (!canView) {
    return (
      <div className="documents-page">
        <PageHeader
          title="Daily compliance"
          description="You do not have permission to view the compliance workspace."
        />
      </div>
    );
  }

  return (
    <div className="documents-page">
      <PageHeader
        title="Daily compliance"
        description="Queue counts from live jobs, documents, certificates, and fleet/asset records — no simulated compliance data."
        actions={
          canWrite ? (
            <Link href="/documents/new">
              <Button>Upload document</Button>
            </Link>
          ) : undefined
        }
      />
      <DocumentsNav />

      <PageLoadState
        isLoading={isLoading}
        error={error}
        isEmpty={false}
        loadingLabel="Loading compliance workspace…"
      >
        {workspace ? (
          <>
            <Panel title="Professional responsibility">
              <p className="page-muted documents-compliance-disclaimer">{workspace.disclaimer}</p>
              <p className="page-muted">{workspace.summary}</p>
              {workspace.documentAuditRecentCount > 0 ? (
                <p className="page-muted">
                  {workspace.documentAuditRecentCount} document action(s) audited in the last 30 days.
                </p>
              ) : (
                <p className="page-muted">No document audit entries in the last 30 days on staging.</p>
              )}
            </Panel>

            <div className="documents-workspace-filters">
              <div
                className="ux-multi-status-filter"
                role="group"
                aria-label="Compliance queue filter"
              >
                <button
                  type="button"
                  className={`ux-multi-status-filter__pill${queueFilter === 'all' ? ' ux-multi-status-filter__pill--active' : ''}`}
                  aria-pressed={queueFilter === 'all'}
                  onClick={() => setQueueFilter('all')}
                >
                  All queues
                </button>
                {COMPLIANCE_WORKSPACE_QUEUE_OPTIONS.map((option) => {
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
            </div>

            {filteredItems.length === 0 ? (
              <EmptyState
                title="No compliance items in this view"
                description="Queues are functional — counts reflect real tenant data. When jobs, COC uploads, or certificate records exist, they appear here."
              />
            ) : (
              <Panel title="Compliance queue">
                <div className="documents-table-wrap">
                  <table className="documents-table documents-workspace-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Queues</th>
                        <th>Status</th>
                        <th>Links</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.title}</strong>
                            {item.detail ? (
                              <p className="page-muted documents-workspace-detail">{item.detail}</p>
                            ) : null}
                          </td>
                          <td>
                            {item.queues
                              .map(
                                (queue) =>
                                  COMPLIANCE_WORKSPACE_QUEUE_OPTIONS.find(
                                    (option) => option.value === queue,
                                  )?.label ?? queue,
                              )
                              .join(', ')}
                          </td>
                          <td>{item.statusLabel}</td>
                          <td>
                            <EntityLinks entities={item.entities} />
                          </td>
                          <td>{new Date(item.occurredAt).toLocaleDateString()}</td>
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
