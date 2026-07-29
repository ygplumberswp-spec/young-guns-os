import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { EmptyState, PageHeader, Panel } from '@titan/ui';
import type { WorkflowExecutionSummary, WorkflowTriggerType } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchWorkflowExecutions } from '../../lib/automation-api';
import { useAuth } from '../../lib/auth-context';
import { AutomationNav } from '../../features/automation/AutomationNav';
import {
  canAccessAutomation,
  formatExecutionStatus,
  formatTriggerType,
} from '../../features/automation/utils';

export function ExecutionListPage() {
  const { accessToken, user } = useAuth();
  const [executions, setExecutions] = useState<WorkflowExecutionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessAutomation(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadExecutions() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchWorkflowExecutions(accessToken);
        if (!cancelled) setExecutions(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load executions');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadExecutions();
    return () => { cancelled = true; };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader title="Executions" description="You do not have permission to view automation." />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Automation"
        description="Workflow execution history across your tenant."
      />
      <AutomationNav />

      {isLoading ? <p className="page-muted">Loading execution history…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        executions.length === 0 ? (
          <EmptyState
            title="No executions yet"
            description="Execution records will appear here once workflows run. The automation engine is not connected in this foundation milestone."
          />
        ) : (
          <Panel title="Execution history">
            <div className="automation-table-wrap">
              <table className="automation-table">
                <thead>
                  <tr>
                    <th>Workflow</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Entity</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((execution) => (
                    <tr key={execution.id}>
                      <td>
                        {execution.workflowId ? (
                          <Link href={`/automation/${execution.workflowId}`} className="automation-link">
                            {execution.workflowName ?? 'Unknown workflow'}
                          </Link>
                        ) : (
                          execution.workflowName ?? 'Unknown workflow'
                        )}
                      </td>
                      <td>{formatTriggerType(execution.triggerType as WorkflowTriggerType)}</td>
                      <td>{formatExecutionStatus(execution.status)}</td>
                      <td>
                        {execution.triggerEntityType
                          ? `${execution.triggerEntityType}${execution.triggerEntityId ? ` (${execution.triggerEntityId.slice(0, 8)}…)` : ''}`
                          : '—'}
                      </td>
                      <td>{new Date(execution.startedAt).toLocaleString()}</td>
                      <td>
                        {execution.completedAt
                          ? new Date(execution.completedAt).toLocaleString()
                          : '—'}
                      </td>
                      <td>{execution.errorMessage ?? '—'}</td>
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
