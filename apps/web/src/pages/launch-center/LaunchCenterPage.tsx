import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseLaunchCenterDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveGoLiveWizard,
  captureLaunchCenterAnalytics,
  createGoLiveWizard,
  fetchLaunchCenterAuditLogs,
  fetchLaunchCenterDashboard,
  runAcceptanceTests,
  runPostDeploymentValidation,
  runReadinessScan,
  syncLaunchCenterAlerts,
  validateRollbackPlan,
} from '../../lib/enterprise-launch-center-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessLaunchCenter,
  canAdministerLaunchCenter,
  canManageLaunchCenter,
  formatCheckStatus,
  formatReadinessStatus,
  formatWizardStatus,
} from '../../features/launch-center/utils';

type LaunchCenterTab =
  | 'overview'
  | 'readiness'
  | 'acceptance'
  | 'integrations'
  | 'security'
  | 'deployment'
  | 'rollback'
  | 'reports'
  | 'audit'
  | 'settings'
  | 'assistant';

export function LaunchCenterPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<LaunchCenterTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseLaunchCenterDashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<
    Awaited<ReturnType<typeof fetchLaunchCenterAuditLogs>>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [wizardTitle, setWizardTitle] = useState('Production go-live');

  const {
    agentMessages,
    isSending,
    pendingTasks,
    sendAgentMessage,
    updateTask,
    error: assistantError,
  } = useAuraChat();

  const canView = useMemo(() => (user ? canAccessLaunchCenter(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageLaunchCenter(user.permissions) : false), [user]);
  const canManage = useMemo(
    () => (user ? canAdministerLaunchCenter(user.permissions) : false),
    [user],
  );

  const tabs: Array<{ id: LaunchCenterTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'readiness', label: 'Readiness' },
    { id: 'acceptance', label: 'Acceptance Tests' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'security', label: 'Security' },
    { id: 'deployment', label: 'Deployment' },
    { id: 'rollback', label: 'Rollback' },
    { id: 'reports', label: 'Reports' },
    { id: 'audit', label: 'Audit' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    setDashboard(await fetchLaunchCenterDashboard(accessToken));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        await loadDashboard();
        if (!cancelled) setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load launch center dashboard',
          );
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  useEffect(() => {
    if (!accessToken || !canView || isLoading || activeTab !== 'audit') return;
    let cancelled = false;
    async function loadTabData() {
      setIsSupplementaryLoading(true);
      try {
        const logs = await fetchLaunchCenterAuditLogs(accessToken!);
        if (!cancelled) setAuditLogs(logs);
      } catch {
        if (!cancelled) setAuditLogs([]);
      } finally {
        if (!cancelled) setIsSupplementaryLoading(false);
      }
    }
    void loadTabData();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, activeTab, isLoading]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!accessToken || !canWrite) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
      setSuccess(successMessage);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="p-6">
        <EmptyState
          title="Access denied"
          description="You do not have permission to view the launch center."
        />
      </div>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div className="p-6">
        <PageHeader title="Launch Center" description="Loading launch readiness center..." />
      </div>
    );
  }

  const readiness = dashboard.launchReadiness;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Launch Center"
        description="Unified launch readiness, acceptance testing, go-live wizard, and deployment validation."
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => runReadinessScan(accessToken!), 'Readiness scan completed.')
                }
              >
                Run Readiness Scan
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => syncLaunchCenterAlerts(accessToken!), 'Alerts synced.')
                }
              >
                Sync Alerts
              </Button>
            </div>
          ) : null
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${activeTab === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Readiness Score"
              value={readiness.overallScore != null ? String(readiness.overallScore) : '—'}
            />
            <StatCard
              label="Status"
              value={formatReadinessStatus(dashboard.overallLaunchReadinessStatus)}
            />
            <StatCard label="Critical Blockers" value={String(readiness.criticalBlockerCount)} />
            <StatCard label="Pending Approvals" value={String(readiness.pendingApprovalCount)} />
          </div>
          <Panel title="Summary">{dashboard.summary}</Panel>
          {readiness.criticalBlockerCount > 0 ? (
            <Panel title="Critical blockers">
              <p className="text-sm text-red-700">
                Critical failures detected — production go-live is blocked until resolved.
              </p>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'readiness' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(() => runReadinessScan(accessToken!), 'Readiness scan completed.')
              }
            >
              Run Readiness Scan
            </Button>
          ) : null}
          <Panel title="Latest Scan">
            {dashboard.latestReadinessScan ? (
              <p className="text-sm">
                {dashboard.latestReadinessScan.scanKey} —{' '}
                {formatCheckStatus(dashboard.latestReadinessScan.status)} ·{' '}
                {dashboard.latestReadinessScan.passedCount}/
                {dashboard.latestReadinessScan.checkCount} passed
              </p>
            ) : (
              <EmptyState
                title="No readiness scans"
                description="Run an automated readiness scan using real platform data."
              />
            )}
          </Panel>
          <Panel title="Check Results">
            {dashboard.latestCheckResults.length === 0 ? (
              <EmptyState
                title="No check results"
                description="Run a readiness scan to evaluate authentication, RBAC, integrations, backup, and monitoring."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.latestCheckResults.map((result) => (
                  <li key={result.id} className="py-2 text-sm">
                    <span className="font-medium">{result.checkName}</span> —{' '}
                    {formatCheckStatus(result.status)}
                    {result.message ? `: ${result.message}` : ''}
                    {result.recommendation ? (
                      <p className="text-slate-500">{result.recommendation}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'acceptance' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => runAcceptanceTests(accessToken!),
                  'Acceptance tests completed.',
                )
              }
            >
              Run All Acceptance Tests
            </Button>
          ) : null}
          <Panel title="Test Suites">
            <ul className="divide-y divide-slate-100">
              {dashboard.acceptanceTestSuites.map((suite) => (
                <li key={suite.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{suite.suiteName}</p>
                    <p className="text-sm text-slate-500">{suite.description}</p>
                  </div>
                  {canWrite ? (
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() =>
                        void runAction(
                          () => runAcceptanceTests(accessToken!, suite.id),
                          `${suite.suiteName} tests completed.`,
                        )
                      }
                    >
                      Run
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Recent Runs">
            {dashboard.acceptanceTestRuns.length === 0 ? (
              <EmptyState
                title="No acceptance test runs"
                description="Run configurable acceptance test suites against real tenant data."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.acceptanceTestRuns.map((run) => (
                  <li key={run.id} className="py-2 text-sm">
                    {run.runKey} — {formatCheckStatus(run.status)} · {run.passedCount}/
                    {run.testCount} passed
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'integrations' ? (
        <Panel title="Integration Readiness">
          {dashboard.integrations.length === 0 ? (
            <EmptyState
              title="No integrations"
              description="Configure integrations via the Universal Connector Platform."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboard.integrations.map((integration) => (
                <li key={integration.key} className="flex items-center justify-between py-3">
                  <span className="font-medium">{integration.key}</span>
                  <span className="text-sm">{integration.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'security' ? (
        <Panel title="Security Readiness">
          <ul className="space-y-2 text-sm">
            <li>Security score: {String(dashboard.securitySummary.securityScore ?? '—')}</li>
            <li>Risk alerts: {String(dashboard.securitySummary.riskAlertCount ?? 0)}</li>
            <li>{String(dashboard.securitySummary.summary ?? '')}</li>
          </ul>
        </Panel>
      ) : null}

      {activeTab === 'deployment' ? (
        <div className="space-y-4">
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <input
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                value={wizardTitle}
                onChange={(e) => setWizardTitle(e.target.value)}
              />
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => createGoLiveWizard(accessToken!, { title: wizardTitle }),
                    'Go-live wizard created.',
                  )
                }
              >
                Create Go-Live Wizard
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => runPostDeploymentValidation(accessToken!),
                    'Post-deployment validation completed.',
                  )
                }
              >
                Run Post-Deployment Validation
              </Button>
            </div>
          ) : null}
          <Panel title="Go-Live Wizards">
            {dashboard.goLiveWizards.length === 0 ? (
              <EmptyState
                title="No go-live wizards"
                description="Create a guided go-live wizard with explicit owner approval before production."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.goLiveWizards.map((wizard) => (
                  <li key={wizard.id} className="py-3">
                    <p className="font-medium">{wizard.title}</p>
                    <p className="text-sm text-slate-500">
                      {formatWizardStatus(wizard.status)} · step {wizard.currentStepKey ?? '—'}
                    </p>
                    {canManage && wizard.status === 'pending_approval' ? (
                      <Button
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() =>
                          void runAction(
                            () => approveGoLiveWizard(accessToken!, wizard.id),
                            'Go-live wizard approved.',
                          )
                        }
                      >
                        Approve Go-Live
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Deployment Validations">
            {dashboard.deploymentValidations.length === 0 ? (
              <EmptyState
                title="No validations"
                description="Run post-deployment validation after go-live confirmation."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.deploymentValidations.map((validation) => (
                  <li key={validation.id} className="py-2 text-sm">
                    {validation.validationKey} — {validation.status} · {validation.passedCheckCount}{' '}
                    passed, {validation.failedCheckCount} failed
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'rollback' ? (
        <div className="space-y-4">
          <Panel title="Rollback Plans">
            {dashboard.rollbackPlanLinks.length === 0 ? (
              <EmptyState
                title="No rollback plans"
                description="Rollback plans are synced from Business Continuity recovery plans."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.rollbackPlanLinks.map((plan) => (
                  <li key={plan.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{plan.planName}</p>
                      <p className="text-sm text-slate-500">{plan.planDescription}</p>
                    </div>
                    {canWrite ? (
                      <Button
                        variant="secondary"
                        disabled={isWorking}
                        onClick={() =>
                          void runAction(
                            () => validateRollbackPlan(accessToken!, plan.id),
                            'Rollback plan validated.',
                          )
                        }
                      >
                        Validate
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className="text-sm text-slate-500">
            Rollback is never initiated automatically. Validation reports recovery readiness only.
          </p>
        </div>
      ) : null}

      {activeTab === 'reports' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => captureLaunchCenterAnalytics(accessToken!),
                  'Analytics captured.',
                )
              }
            >
              Capture Analytics
            </Button>
          ) : null}
          <Panel title="Readiness Score">
            {dashboard.latestReadinessScore ? (
              <ul className="space-y-2 text-sm">
                <li>Score: {dashboard.latestReadinessScore.overallScore ?? '—'}</li>
                <li>
                  Status: {formatReadinessStatus(dashboard.latestReadinessScore.overallStatus)}
                </li>
                <li>Passed: {dashboard.latestReadinessScore.passedCount}</li>
                <li>Warnings: {dashboard.latestReadinessScore.warningCount}</li>
                <li>Critical blockers: {dashboard.latestReadinessScore.criticalBlockerCount}</li>
              </ul>
            ) : (
              <EmptyState
                title="No readiness score"
                description="Run a readiness scan to generate a weighted deployment readiness score."
              />
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'audit' ? (
        <Panel title="Audit Log">
          {isSupplementaryLoading ? (
            <p className="text-sm text-slate-500">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <EmptyState
              title="No audit logs"
              description="Launch center actions are fully audited."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <li key={log.id} className="py-2 text-sm">
                  {log.actionType} · {new Date(log.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'settings' ? (
        <Panel title="Platform Configuration">
          <ul className="space-y-2 text-sm">
            <li>Audit retention: {dashboard.platformConfig.auditRetentionDays} days</li>
            <li>
              Readiness policy configured:{' '}
              {Object.keys(dashboard.platformConfig.readinessPolicy).length > 0 ? 'Yes' : 'Default'}
            </li>
            <li>
              Scoring weights configured:{' '}
              {Object.keys(dashboard.platformConfig.scoringWeights).length > 0 ? 'Yes' : 'Default'}
            </li>
          </ul>
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel title="AURA Launch Readiness Agent">
          <AuraMessageList messages={agentMessages} isSending={isSending} />
          {pendingTasks.map((task) => (
            <AuraTaskApprovalCard
              key={task.id}
              task={task}
              accessToken={accessToken ?? ''}
              onUpdated={updateTask}
            />
          ))}
          <AuraComposer
            disabled={isSending}
            onSend={(content) =>
              void sendAgentMessage(content, 'launch_readiness' as import('@titan/shared').AgentKey)
            }
          />
          {assistantError ? <p className="mt-2 text-sm text-red-600">{assistantError}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
