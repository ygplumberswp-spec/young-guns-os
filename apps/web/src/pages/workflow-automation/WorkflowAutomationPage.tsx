import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  OpsWorkflowApprovalSummary,
  OpsWorkflowAuraSuggestionSummary,
  OpsWorkflowDefinitionSummary,
  OpsWorkflowMonitorOverview,
  OpsWorkflowRunSummary,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  decideWorkflowAutomationApproval,
  decideWorkflowAutomationAuraSuggestion,
  fetchWorkflowAutomationApprovals,
  fetchWorkflowAutomationAuraSuggestions,
  fetchWorkflowAutomationDefinitions,
  fetchWorkflowAutomationMonitor,
  fetchWorkflowAutomationRuns,
  WorkflowAutomationApiClientError,
} from '../../lib/workflow-automation-api-client';

type Tab = 'monitor' | 'approvals' | 'definitions' | 'aura';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('*') ||
    permissions.includes('automation:read') ||
    permissions.includes('automation:write') ||
    permissions.includes('ops:read') ||
    permissions.includes('ops:manage')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('*') ||
    permissions.includes('automation:write') ||
    permissions.includes('ops:manage')
  );
}

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function WorkflowAutomationPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('monitor');
  const [overview, setOverview] = useState<OpsWorkflowMonitorOverview | null>(null);
  const [activeRuns, setActiveRuns] = useState<OpsWorkflowRunSummary[]>([]);
  const [completedRuns, setCompletedRuns] = useState<OpsWorkflowRunSummary[]>([]);
  const [failedRuns, setFailedRuns] = useState<OpsWorkflowRunSummary[]>([]);
  const [approvals, setApprovals] = useState<OpsWorkflowApprovalSummary[]>([]);
  const [definitions, setDefinitions] = useState<OpsWorkflowDefinitionSummary[]>([]);
  const [suggestions, setSuggestions] = useState<OpsWorkflowAuraSuggestionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;
    const [monitor, active, completed, failed, pending, defs, aura] = await Promise.all([
      fetchWorkflowAutomationMonitor(accessToken),
      fetchWorkflowAutomationRuns(accessToken, 'active'),
      fetchWorkflowAutomationRuns(accessToken, 'completed'),
      fetchWorkflowAutomationRuns(accessToken, 'failed'),
      fetchWorkflowAutomationApprovals(accessToken),
      fetchWorkflowAutomationDefinitions(accessToken),
      fetchWorkflowAutomationAuraSuggestions(accessToken),
    ]);
    setOverview(monitor);
    setActiveRuns(active);
    setCompletedRuns(completed);
    setFailedRuns(failed);
    setApprovals(pending);
    setDefinitions(defs);
    setSuggestions(aura);
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        setError(null);
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof WorkflowAutomationApiClientError
              ? err.message
              : 'Unable to load workflow automation',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function onDecideApproval(id: string, decision: 'approve' | 'reject') {
    if (!accessToken) return;
    try {
      setError(null);
      setSuccess(null);
      await decideWorkflowAutomationApproval(accessToken, id, decision);
      setSuccess(
        decision === 'approve'
          ? 'Approval recorded — approved step may execute (outbound still uses draft paths).'
          : 'Approval rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof WorkflowAutomationApiClientError
          ? err.message
          : 'Unable to update approval',
      );
    }
  }

  async function onDecideAura(id: string, decision: 'approve' | 'reject') {
    if (!accessToken) return;
    try {
      setError(null);
      setSuccess(null);
      await decideWorkflowAutomationAuraSuggestion(accessToken, id, decision);
      setSuccess(
        decision === 'approve'
          ? 'AURA suggestion acknowledged. No schedule, dispatch, or messaging changes were executed.'
          : 'AURA suggestion rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof WorkflowAutomationApiClientError
          ? err.message
          : 'Unable to update AURA suggestion',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Workflow Automation"
          description="You do not have permission to view Operations workflow automation."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflow Automation"
        description="Operations workflow engine over live Jobs, CRM, Scheduling, Finance, and Approvals. No demo runs — monitoring reflects real workflow_runs only."
        actions={
          <Link href="/automation">
            <Button variant="secondary">Automation Command Centre</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['monitor', 'Monitor'],
            ['approvals', 'Approvals'],
            ['definitions', 'Definitions'],
            ['aura', 'AURA drafts'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              tab === key
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-slate-400">Loading workflow automation…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="text-sm text-cyan-200">{success}</p> : null}

      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active" value={String(overview.counts.active)} />
          <StatCard label="Completed" value={String(overview.counts.completed)} />
          <StatCard label="Failed" value={String(overview.counts.failed)} />
          <StatCard
            label="Awaiting approval"
            value={String(overview.counts.awaitingApproval)}
          />
        </div>
      ) : null}

      {tab === 'monitor' && overview ? (
        <>
          <Panel title="Guarantees">
            <ul className="space-y-1 text-sm text-slate-300">
              <li>Tenant-isolated runs only (company scope).</li>
              <li>No demo / fake workflow runs.</li>
              <li>Outbound communication: draft → Owner approve → execute.</li>
              <li>In-app notifications may fire without external send.</li>
              <li>AURA suggestions stay draft until Owner acknowledgment (never auto-execute).</li>
            </ul>
          </Panel>

          <RunPanel title="Active workflows" runs={activeRuns} empty="No active workflow runs." />
          <RunPanel
            title="Completed workflows"
            runs={completedRuns}
            empty="No completed workflow runs yet."
          />
          <RunPanel title="Failed workflows" runs={failedRuns} empty="No failed workflow runs." />

          <Panel title="Wired Operations triggers">
            <ul className="grid gap-2 sm:grid-cols-2">
              {overview.triggerCatalog.map((item) => (
                <li
                  key={item.trigger}
                  className="rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-300"
                >
                  <span className="text-cyan-200">{item.label}</span>
                  <span className="ml-2 text-slate-500">{item.event}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}

      {tab === 'approvals' ? (
        <Panel title="Pending Owner approvals">
          {approvals.length === 0 ? (
            <EmptyState
              title="No pending approvals"
              description="Sensitive and outbound workflow steps appear here when they await Owner approval."
            />
          ) : (
            <ul className="space-y-3">
              {approvals.map((item) => (
                <li
                  key={item.stepResultId}
                  className="rounded border border-cyan-500/20 bg-slate-950/70 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-100">
                        {item.workflowName ?? 'Workflow'} · {item.actionType}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {item.preview ?? 'No preview'} · {formatWhen(item.createdAt)}
                      </p>
                      {item.triggerEvent ? (
                        <p className="mt-1 text-xs text-slate-500">Trigger: {item.triggerEvent}</p>
                      ) : null}
                    </div>
                    {canManage ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={() => void onDecideApproval(item.stepResultId, 'approve')}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void onDecideApproval(item.stepResultId, 'reject')}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'definitions' ? (
        <Panel title="Workflow definitions">
          {canManage ? (
            <div className="mb-3">
              <Link href="/automation/new">
                <Button>New definition</Button>
              </Link>
            </div>
          ) : null}
          {definitions.length === 0 ? (
            <EmptyState
              title="No workflow definitions"
              description="Create definitions in Automation Command Centre. They appear here for Operations monitoring."
              action={
                canManage ? (
                  <Link href="/automation/new">
                    <Button>Create workflow</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2">
              {definitions.map((def) => (
                <li key={def.id}>
                  <Link
                    href={`/automation/${def.id}`}
                    className="block rounded border border-slate-800 bg-slate-950/50 px-3 py-2 hover:border-cyan-500/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-100">{def.name}</span>
                      <span className="text-xs uppercase tracking-wide text-cyan-300/80">
                        {def.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {def.triggerCount} triggers · {def.actionCount} actions · updated{' '}
                      {formatWhen(def.updatedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'aura' ? (
        <Panel title="AURA draft suggestions">
          <p className="mb-3 text-sm text-slate-400">
            Draft insights only. Approval acknowledges the suggestion — it does not auto-execute
            operations or send external messages.
          </p>
          {suggestions.length === 0 ? (
            <EmptyState
              title="No AURA suggestions"
              description="Suggestions appear when workflows run trigger_aura_suggestion or generate_recommendation actions."
            />
          ) : (
            <ul className="space-y-3">
              {suggestions.map((item) => (
                <li
                  key={item.id}
                  className="rounded border border-slate-800 bg-slate-950/70 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-100">{item.subject}</p>
                      <p className="mt-1 text-sm text-slate-400">{item.body}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.status} · autoExecuted: false · {formatWhen(item.createdAt)}
                      </p>
                    </div>
                    {canManage && item.status === 'pending_approval' ? (
                      <div className="flex gap-2">
                        <Button type="button" onClick={() => void onDecideAura(item.id, 'approve')}>
                          Acknowledge
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void onDecideAura(item.id, 'reject')}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

function RunPanel({
  title,
  runs,
  empty,
}: {
  title: string;
  runs: OpsWorkflowRunSummary[];
  empty: string;
}) {
  return (
    <Panel title={title}>
      {runs.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => (
            <li
              key={run.id}
              className="rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-100">{run.workflowName ?? 'Workflow'}</span>
                <span className="text-xs uppercase text-cyan-300/80">{run.status}</span>
              </div>
              <p className="mt-1 text-slate-400">
                {run.triggerEvent}
                {run.triggerEntityType ? ` · ${run.triggerEntityType}` : ''} ·{' '}
                {formatWhen(run.startedAt)}
              </p>
              {run.errorMessage ? (
                <p className="mt-1 text-xs text-rose-300/90">{run.errorMessage}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
