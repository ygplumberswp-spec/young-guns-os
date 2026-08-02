import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel } from '@titan/ui';
import type { WorkflowSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchWorkflows } from '../../lib/automation-api';
import { useAuth } from '../../lib/auth-context';
import { AutomationNav } from '../../features/automation/AutomationNav';
import {
  canAccessAutomation,
  canManageAutomation,
  formatWorkflowStatus,
} from '../../features/automation/utils';

export function WorkflowListPage() {
  const { accessToken, user } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessAutomation(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageAutomation(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkflows() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchWorkflows(accessToken);
        if (!cancelled) setWorkflows(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load workflows');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadWorkflows();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Automation"
          description="You do not have permission to view automation."
        />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Automation"
        description="Configure workflow triggers and actions. Execution history is tracked separately."
        actions={
          canWrite ? (
            <Link href="/automation/new">
              <Button>New Workflow</Button>
            </Link>
          ) : undefined
        }
      />
      <AutomationNav />

      <Panel title="External Orchestration (n8n)">
        <p className="page-muted">
          Hybrid n8n orchestration is managed under{' '}
          <Link href="/automation/n8n">Automations → n8n</Link>. Integrations shows capability
          status and deep-links here — n8n is never Connected without a verified loopback
          configuration. Native workflows below continue without n8n.
        </p>
      </Panel>

      {isLoading ? <p className="page-muted">Loading workflows…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        workflows.length === 0 ? (
          <EmptyState
            title="No Workflows Yet"
            description="Create your first workflow to define triggers and actions for future automation."
            action={
              canWrite ? (
                <Link href="/automation/new">
                  <Button>New Workflow</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Panel title="Workflows">
            <div className="automation-table-wrap">
              <table className="automation-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Triggers</th>
                    <th>Actions</th>
                    <th>Executions</th>
                    <th>Created by</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((workflow) => (
                    <tr key={workflow.id}>
                      <td>
                        <Link href={`/automation/${workflow.id}`} className="automation-link">
                          {workflow.name}
                        </Link>
                      </td>
                      <td>{formatWorkflowStatus(workflow.status)}</td>
                      <td>{workflow.triggerCount}</td>
                      <td>{workflow.actionCount}</td>
                      <td>{workflow.executionCount}</td>
                      <td>{workflow.createdByName}</td>
                      <td>{new Date(workflow.updatedAt).toLocaleDateString()}</td>
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
