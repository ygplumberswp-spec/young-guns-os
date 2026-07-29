import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseProductionLaunchDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveGoLiveWizard,
  confirmGoLiveLaunch,
  createDeploymentRun,
  createGoLiveWizard,
  fetchProductionLaunchAuditLogs,
  fetchProductionLaunchDashboard,
  runCommercialReadinessReview,
  runDeploymentHealthVerification,
  runDeploymentSmokeTests,
  runDomainSecurityReview,
  runEnvironmentReview,
  runLiveIntegrationVerification,
  runMobileProductionReview,
  submitDeploymentForApproval,
  syncProductionLaunchAlerts,
} from '../../lib/enterprise-production-launch-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessProductionLaunch,
  canAdministerProductionLaunch,
  canManageProductionLaunch,
  formatDeploymentStatus,
  formatLaunchStatus,
  formatValidationStatus,
  formatWizardStatus,
} from '../../features/go-live/utils';

type GoLiveTab =
  | 'overview'
  | 'infrastructure'
  | 'integrations'
  | 'security'
  | 'mobile'
  | 'billing'
  | 'deployment'
  | 'wizard'
  | 'audit'
  | 'assistant';

export function GoLivePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<GoLiveTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseProductionLaunchDashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof fetchProductionLaunchAuditLogs>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [wizardTitle, setWizardTitle] = useState('Production go-live');

  const { agentMessages, isSending, pendingTasks, sendAgentMessage, updateTask, error: assistantError } =
    useAuraChat();

  const canView = useMemo(() => (user ? canAccessProductionLaunch(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageProductionLaunch(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canAdministerProductionLaunch(user.permissions) : false), [user]);

  const tabs: Array<{ id: GoLiveTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'infrastructure', label: 'Infrastructure' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'security', label: 'Security & Domain' },
    { id: 'mobile', label: 'Mobile' },
    { id: 'billing', label: 'Billing' },
    { id: 'deployment', label: 'Deployment' },
    { id: 'wizard', label: 'Go-Live Wizard' },
    { id: 'audit', label: 'Audit' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    setDashboard(await fetchProductionLaunchDashboard(accessToken));
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
          setError(err instanceof ApiClientError ? err.message : 'Unable to load go-live dashboard');
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
        const logs = await fetchProductionLaunchAuditLogs(accessToken!);
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
        <EmptyState title="Access denied" description="You do not have permission to view the go-live center." />
      </div>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div className="p-6">
        <PageHeader title="Go-Live Center" description="Loading production launch dashboard..." />
      </div>
    );
  }

  const readiness = dashboard.productionReadiness;
  const activeWizard = dashboard.goLiveWizards[0] ?? null;
  const activeDeployment = dashboard.latestDeploymentRun;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Go-Live Center"
        description="Final production deployment, live integrations, and commercial launch readiness."
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => void runAction(() => syncProductionLaunchAlerts(accessToken!), 'Alerts synced.')}
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
            <StatCard label="Launch Status" value={formatLaunchStatus(readiness.launchStatus)} />
            <StatCard label="Production Status" value={formatLaunchStatus(dashboard.overallProductionStatus)} />
            <StatCard label="Provider Failures" value={String(readiness.failedProviderCount)} />
            <StatCard label="Pending Approvals" value={String(readiness.pendingApprovalCount)} />
          </div>
          <Panel title="Summary">{dashboard.summary}</Panel>
          {readiness.launchStatus === 'blocked' || readiness.launchStatus === 'not_ready' ? (
            <Panel title="Launch blockers">
              <p className="text-sm text-red-700">
                Production launch is {formatLaunchStatus(readiness.launchStatus)} — resolve configuration and provider issues before go-live.
              </p>
            </Panel>
          ) : null}
          {dashboard.releaseCenterSummary ? (
            <Panel title="Release Center">
              <p className="text-sm">
                Release readiness score: {String(dashboard.releaseCenterSummary.readinessScore ?? '—')}, status:{' '}
                {String(dashboard.releaseCenterSummary.overallStatus ?? 'unknown')}
              </p>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'infrastructure' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => runEnvironmentReview(accessToken!), 'Environment review completed.')}
            >
              Run Environment Review
            </Button>
          ) : null}
          <Panel title="Environment Configuration">
            {dashboard.latestEnvironmentReview ? (
              <ul className="divide-y divide-slate-100">
                {dashboard.latestEnvironmentReview.findings.map((finding, index) => (
                  <li key={index} className="py-2 text-sm">
                    <span className="font-medium">{String(finding.key ?? 'config')}</span>
                    {finding.message ? `: ${String(finding.message)}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No environment review" description="Verify DATABASE_URL, JWT secrets, APP_URL, and production environment variables." />
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'integrations' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => runLiveIntegrationVerification(accessToken!), 'Live integration verification completed.')}
            >
              Verify Live Providers
            </Button>
          ) : null}
          <Panel title="Latest Verification">
            {dashboard.latestLiveIntegrationRun ? (
              <p className="text-sm">
                {dashboard.latestLiveIntegrationRun.runKey} — {formatValidationStatus(dashboard.latestLiveIntegrationRun.status)} ·{' '}
                {dashboard.latestLiveIntegrationRun.connectedCount}/{dashboard.latestLiveIntegrationRun.providerCount} connected
              </p>
            ) : (
              <EmptyState title="No verification runs" description="Verify live connectivity for Xero, email, WhatsApp, SMS, payments, Cartrack, and AI providers." />
            )}
          </Panel>
          <Panel title="Provider Results">
            {dashboard.latestLiveIntegrationResults.length === 0 ? (
              <EmptyState title="No provider results" description="Run live integration verification against configured providers." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.latestLiveIntegrationResults.map((result) => (
                  <li key={result.id} className="py-2 text-sm">
                    <span className="font-medium">{result.providerName}</span> — {formatValidationStatus(result.status)}
                    {result.message ? `: ${result.message}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'security' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => runDomainSecurityReview(accessToken!), 'Domain and security review completed.')}
            >
              Run Domain & Security Review
            </Button>
          ) : null}
          <Panel title="Domain & Security Findings">
            {dashboard.latestDomainSecurityReview ? (
              <ul className="divide-y divide-slate-100">
                {dashboard.latestDomainSecurityReview.findings.map((finding, index) => (
                  <li key={index} className="py-2 text-sm">
                    <span className="font-medium">{String(finding.key ?? 'finding')}</span>
                    {finding.message ? `: ${String(finding.message)}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No security review" description="Verify HTTPS, CORS, session security, cookie security, and secret management." />
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'mobile' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => runMobileProductionReview(accessToken!), 'Mobile production review completed.')}
            >
              Run Mobile Production Review
            </Button>
          ) : null}
          <Panel title="Mobile Production Readiness">
            {dashboard.latestMobileReview ? (
              <ul className="space-y-2 text-sm">
                <li>Status: {formatValidationStatus(dashboard.latestMobileReview.status)}</li>
                <li>Findings: {dashboard.latestMobileReview.findingCount}</li>
                <li>Warnings: {dashboard.latestMobileReview.warningCount}</li>
              </ul>
            ) : (
              <EmptyState title="No mobile review" description="Verify iOS/Android builds, push notifications, authentication, and offline sync." />
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'billing' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => runCommercialReadinessReview(accessToken!), 'Commercial readiness review completed.')}
            >
              Run Commercial Readiness Review
            </Button>
          ) : null}
          <Panel title="Commercial Readiness">
            {dashboard.latestCommercialReview ? (
              <ul className="space-y-2 text-sm">
                <li>Status: {formatValidationStatus(dashboard.latestCommercialReview.status)}</li>
                <li>Findings: {dashboard.latestCommercialReview.findingCount}</li>
                <li>Warnings: {dashboard.latestCommercialReview.warningCount}</li>
              </ul>
            ) : (
              <EmptyState title="No commercial review" description="Verify SaaS subscriptions, billing, tenant provisioning, and license activation." />
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'deployment' ? (
        <div className="space-y-4">
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => void runAction(() => createDeploymentRun(accessToken!, { title: 'Production deployment' }), 'Deployment run created.')}
              >
                Create Deployment Run
              </Button>
              {activeDeployment ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() => void runAction(() => runDeploymentHealthVerification(accessToken!, activeDeployment.id), 'Health verification completed.')}
                  >
                    Health Verification
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() => void runAction(() => runDeploymentSmokeTests(accessToken!, activeDeployment.id), 'Smoke tests completed.')}
                  >
                    Run Smoke Tests
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() => void runAction(() => submitDeploymentForApproval(accessToken!, activeDeployment.id), 'Submitted for approval.')}
                  >
                    Submit for Approval
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          <Panel title="Latest Deployment">
            {activeDeployment ? (
              <ul className="space-y-2 text-sm">
                <li>Run: {activeDeployment.runKey}</li>
                <li>Status: {formatDeploymentStatus(activeDeployment.status)}</li>
                <li>Health verified: {activeDeployment.healthVerified ? 'Yes' : 'No'}</li>
                <li>Smoke tests passed: {activeDeployment.smokeTestPassed ? 'Yes' : 'No'}</li>
                <li>Owner approved: {activeDeployment.ownerApproved ? 'Yes' : 'No'}</li>
              </ul>
            ) : (
              <EmptyState title="No deployment runs" description="Create a deployment run — owner approval required, no automatic deployment." />
            )}
          </Panel>
          <Panel title="Deployment History">
            {dashboard.deploymentHistory.length === 0 ? (
              <EmptyState title="No history" description="Deployment history tracks health verification, smoke tests, approvals, and rollbacks." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.deploymentHistory.map((run) => (
                  <li key={run.id} className="py-2 text-sm">
                    {run.runKey} — {formatDeploymentStatus(run.status)} · {run.environment}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'wizard' ? (
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
                onClick={() => void runAction(() => createGoLiveWizard(accessToken!, { title: wizardTitle }), 'Go-live wizard created.')}
              >
                Create Wizard
              </Button>
              {activeWizard && canManage ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() => void runAction(() => approveGoLiveWizard(accessToken!, activeWizard.id), 'Wizard approved.')}
                  >
                    Owner Approve
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() => void runAction(() => confirmGoLiveLaunch(accessToken!, activeWizard.id), 'Launch confirmed.')}
                  >
                    Confirm Launch
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          <Panel title="Go-Live Wizard">
            {activeWizard ? (
              <div className="space-y-4">
                <p className="text-sm">
                  {activeWizard.title} — {formatWizardStatus(activeWizard.status)}
                </p>
                <ul className="divide-y divide-slate-100">
                  {activeWizard.steps.map((step) => (
                    <li key={step.id} className="flex items-center justify-between py-3">
                      <span className="font-medium">{step.stepName}</span>
                      <span className="text-sm">{formatWizardStatus(step.status)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyState title="No go-live wizard" description="Create an owner go-live wizard with infrastructure, integrations, security, domain, mobile, billing, AI, and final verification steps." />
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'audit' ? (
        <Panel title="Audit Log">
          {isSupplementaryLoading ? (
            <p className="text-sm text-slate-500">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <EmptyState title="No audit entries" description="Production launch actions are logged for complete auditability." />
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

      {activeTab === 'assistant' ? (
        <Panel title="AURA Production Launch Agent">
          <p className="mb-4 text-sm text-slate-600">
            Ask about deployment readiness, provider status, configuration, validation reports, or request draft deployment plans and launch reports.
          </p>
          <AuraMessageList messages={agentMessages} isSending={isSending} />
          {pendingTasks.map((task) => (
            <AuraTaskApprovalCard key={task.id} task={task} accessToken={accessToken ?? ''} onUpdated={updateTask} />
          ))}
          <AuraComposer
            disabled={isSending}
            onSend={(content) => void sendAgentMessage(content, 'production_launch' as import('@titan/shared').AgentKey)}
          />
          {assistantError ? <p className="mt-2 text-sm text-red-600">{assistantError}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
