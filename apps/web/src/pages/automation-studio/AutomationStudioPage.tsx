import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseAutomationStudioDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchAutomationStudioDashboard,
  generateAutomationRecommendations,
} from '../../lib/automation-studio-api-client';
import { useAuth } from '../../lib/auth-context';
import {
  canAccessAutomation,
  canManageAutomation,
  formatWorkflowStatus,
} from '../../features/automation/utils';

type StudioTab = 'dashboard' | 'workflows' | 'monitoring' | 'recommendations' | 'executions';

export function AutomationStudioPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<StudioTab>('dashboard');
  const [dashboard, setDashboard] = useState<EnterpriseAutomationStudioDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessAutomation(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageAutomation(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchAutomationStudioDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        await loadDashboard();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load automation studio',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function handleGenerateRecommendations() {
    if (!accessToken || !canWrite) return;
    setIsGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      await generateAutomationRecommendations(accessToken);
      await loadDashboard();
      setSuccess('Automation recommendations generated from real execution data.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to generate recommendations');
    } finally {
      setIsGenerating(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="Automation Studio"
          description="You do not have permission to view automation."
        />
      </div>
    );
  }

  const tabs: Array<{ id: StudioTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'monitoring', label: 'Monitoring' },
    { id: 'recommendations', label: 'AI Recommendations' },
    { id: 'executions', label: 'Executions' },
  ];

  const monitoring = dashboard?.monitoring;

  return (
    <div className="automation-page">
      <PageHeader
        title="Automation Studio"
        description="Enterprise workflow designer — visual builder, orchestration, monitoring, and AI process recommendations."
        actions={
          canWrite ? (
            <Link href="/automation/new">
              <Button>New workflow</Button>
            </Link>
          ) : undefined
        }
      />

      <nav className="automation-nav" aria-label="Automation studio sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={
              activeTab === tab.id
                ? 'automation-nav__link automation-nav__link--active'
                : 'automation-nav__link'
            }
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <Link href="/automation" className="automation-nav__link">
          Classic automation
        </Link>
      </nav>

      {isLoading ? <p className="page-muted">Loading automation studio…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {dashboard && activeTab === 'dashboard' ? (
        <>
          <section className="stat-grid">
            <StatCard label="Total workflows" value={String(dashboard.stats.workflowCount)} />
            <StatCard label="Active" value={String(dashboard.stats.activeWorkflowCount)} />
            <StatCard label="Running" value={String(monitoring?.runningCount ?? 0)} />
            <StatCard label="Failed" value={String(monitoring?.failedCount ?? 0)} />
            <StatCard
              label="Success rate"
              value={
                monitoring?.successRatePercent != null ? `${monitoring.successRatePercent}%` : '—'
              }
            />
            <StatCard label="Queue depth" value={String(monitoring?.queueDepth ?? 0)} />
            <StatCard label="Templates" value={String(dashboard.stats.templateCount)} />
            <StatCard label="Pending actions" value={String(dashboard.pendingActionCount)} />
          </section>
          <p className="page-muted">{dashboard.summary}</p>
          <Panel title="Studio overview">
            <dl className="integrations-stats__grid">
              <div>
                <dt>Schedules</dt>
                <dd>{dashboard.stats.scheduleCount}</dd>
              </div>
              <div>
                <dt>Pending approvals</dt>
                <dd>{dashboard.stats.pendingApprovalCount}</dd>
              </div>
              <div>
                <dt>Total runs</dt>
                <dd>{dashboard.stats.runCount}</dd>
              </div>
              <div>
                <dt>Avg duration</dt>
                <dd>
                  {monitoring?.avgDurationMs != null ? `${monitoring.avgDurationMs} ms` : '—'}
                </dd>
              </div>
            </dl>
          </Panel>
        </>
      ) : null}

      {dashboard && activeTab === 'workflows' ? (
        <Panel title="Workflows">
          {dashboard.workflows.length === 0 ? (
            <EmptyState
              title="No workflows yet"
              description="Create a workflow to define triggers, actions, and approval gates."
            />
          ) : (
            <ul className="analytics-page__run-list">
              {dashboard.workflows.map((workflow) => (
                <li key={workflow.id}>
                  <Link href={`/automation/${workflow.id}`}>
                    <strong>{workflow.name}</strong>
                  </Link>
                  <span className="page-muted">
                    {' '}
                    · {formatWorkflowStatus(workflow.status)} · {workflow.triggerCount} trigger(s) ·{' '}
                    {workflow.actionCount} action(s)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'monitoring' && monitoring ? (
        <div className="analytics-page__grid">
          <Panel title="Execution status">
            <dl className="analytics-page__metrics">
              <div>
                <dt>Running</dt>
                <dd>{monitoring.runningCount}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{monitoring.completedCount}</dd>
              </div>
              <div>
                <dt>Failed</dt>
                <dd>{monitoring.failedCount}</dd>
              </div>
              <div>
                <dt>Queue depth</dt>
                <dd>{monitoring.queueDepth}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Recent runs">
            {dashboard.recentRuns.length === 0 ? (
              <p className="page-muted">No workflow runs recorded yet.</p>
            ) : (
              <ul className="analytics-page__run-list">
                {dashboard.recentRuns.map((run) => (
                  <li key={run.id}>
                    <strong>{run.workflowName ?? 'Workflow'}</strong> — {run.status}
                    <span className="page-muted">
                      {' '}
                      · {new Date(run.startedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {dashboard && activeTab === 'recommendations' ? (
        <>
          {canWrite ? (
            <div className="analytics-page__section-header">
              <span className="page-muted">
                Recommendations derived from real workflow execution patterns.
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={isGenerating}
                onClick={() => void handleGenerateRecommendations()}
              >
                {isGenerating ? 'Analyzing…' : 'Generate recommendations'}
              </Button>
            </div>
          ) : null}
          <Panel title="AI workflow recommendations">
            {dashboard.recommendations.length === 0 ? (
              <EmptyState
                title="No recommendations yet"
                description="Generate recommendations when workflow execution data is available."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {dashboard.recommendations.map((item) => (
                  <li key={item.id}>
                    <strong>
                      [{item.priority}] {item.title}
                    </strong>
                    <p className="page-muted">{item.recommendation}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {dashboard && activeTab === 'executions' ? (
        <Panel title="Execution history">
          <p className="page-muted">
            View detailed execution history in the{' '}
            <Link href="/automation/executions">classic automation executions</Link> view.
          </p>
          {dashboard.recentRuns.length > 0 ? (
            <ul className="analytics-page__run-list">
              {dashboard.recentRuns.slice(0, 15).map((run) => (
                <li key={run.id}>
                  <strong>{run.workflowName ?? 'Workflow'}</strong> — {run.status}
                  {run.errorMessage ? (
                    <span className="form-error"> · {run.errorMessage}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
