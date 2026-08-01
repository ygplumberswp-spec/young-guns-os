import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { EmptyState, Panel } from '@titan/ui';
import type { AgentExecutionSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchAgentExecutions } from '../../lib/agents-api';
import { useAuth } from '../../lib/auth-context';
import { AgentsNav } from '../../features/agents/AgentsNav';
import {
  canAccessAgents,
  formatAgentExecutionStatus,
  formatAgentKey,
} from '../../features/agents/utils';

export function AgentExecutionListPage() {
  const { accessToken, user } = useAuth();
  const [executions, setExecutions] = useState<AgentExecutionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessAgents(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadExecutions() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchAgentExecutions(accessToken);
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
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  if (!canView) {
    return (
      <div className="agents-page">
        <PageHeader title="Executions" description="You do not have permission to view agents." />
      </div>
    );
  }

  return (
    <div className="agents-page">
      <PageHeader title="AURA Agents" description="Agent execution history across your tenant." />
      <AgentsNav />

      {isLoading ? <p className="page-muted">Loading execution history…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        executions.length === 0 ? (
          <EmptyState
            title="No executions yet"
            description="Execution records will appear here once agent runs are tracked. Autonomous agents and full tool execution are not connected in this foundation milestone."
          />
        ) : (
          <Panel title="Execution history">
            <div className="agents-table-wrap">
              <table className="agents-table">
                <thead>
                  <tr>
                    <th>Profile</th>
                    <th>Agent type</th>
                    <th>Status</th>
                    <th>Mode</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((execution) => (
                    <tr key={execution.id}>
                      <td>
                        {execution.agentProfileId ? (
                          <Link
                            href={`/aura/agents/${execution.agentProfileId}`}
                            className="agents-link"
                          >
                            {execution.agentProfileName ?? 'Unknown profile'}
                          </Link>
                        ) : (
                          (execution.agentProfileName ?? 'Unknown profile')
                        )}
                      </td>
                      <td>{execution.agentKey ? formatAgentKey(execution.agentKey) : '—'}</td>
                      <td>{formatAgentExecutionStatus(execution.status)}</td>
                      <td>{execution.executionMode}</td>
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
