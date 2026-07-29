import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseReleaseCenterDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  capturePerformanceSnapshot,
  fetchReleaseCenterAuditLogs,
  fetchReleaseCenterDashboard,
  generateReleaseReport,
  runConfigurationReview,
  runIntegrationValidation,
  runSecurityVerification,
  runWorkflowValidation,
  syncReleaseCenterAlerts,
} from '../../lib/enterprise-release-center-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessReleaseCenter,
  canManageReleaseCenter,
  formatChecklistStatus,
  formatReleaseStatus,
  formatValidationStatus,
} from '../../features/release-center/utils';

type ReleaseCenterTab =
  | 'overview'
  | 'integration'
  | 'workflow'
  | 'performance'
  | 'security'
  | 'configuration'
  | 'checklist'
  | 'reports'
  | 'audit'
  | 'assistant';

export function ReleaseCenterPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<ReleaseCenterTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseReleaseCenterDashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof fetchReleaseCenterAuditLogs>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { agentMessages, isSending, pendingTasks, sendAgentMessage, updateTask, error: assistantError } =
    useAuraChat();

  const canView = useMemo(() => (user ? canAccessReleaseCenter(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageReleaseCenter(user.permissions) : false), [user]);

  const tabs: Array<{ id: ReleaseCenterTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'integration', label: 'Integration Status' },
    { id: 'workflow', label: 'Workflow Validation' },
    { id: 'performance', label: 'Performance' },
    { id: 'security', label: 'Security' },
    { id: 'configuration', label: 'Configuration' },
    { id: 'checklist', label: 'Release Checklist' },
    { id: 'reports', label: 'Reports' },
    { id: 'audit', label: 'Audit' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    setDashboard(await fetchReleaseCenterDashboard(accessToken));
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
          setError(err instanceof ApiClientError ? err.message : 'Unable to load release center dashboard');
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
        const logs = await fetchReleaseCenterAuditLogs(accessToken!);
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
        <EmptyState title="Access denied" description="You do not have permission to view the release center." />
      </div>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div className="p-6">
        <PageHeader title="Release Center" description="Loading release candidate center..." />
      </div>
    );
  }

  const readiness = dashboard.releaseReadiness;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Release Center"
        description="Final production integration validation, optimization review, and release candidate reporting."
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => void runAction(() => generateReleaseReport(accessToken!), 'Release candidate report generated.')}
              >
                Generate Report
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => void runAction(() => syncReleaseCenterAlerts(accessToken!), 'Alerts synced.')}
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
            <StatCard label="Readiness Score" value={readiness.readinessScore != null ? String(readiness.readinessScore) : '—'} />
            <StatCard label="Status" value={formatReleaseStatus(dashboard.overallReleaseStatus)} />
            <StatCard label="Failed Validations" value={String(readiness.failedValidationCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
          </div>
          <Panel title="Summary">{dashboard.summary}</Panel>
          {readiness.overallStatus === 'blocked' || readiness.overallStatus === 'not_ready' ? (
            <Panel title="Release blockers">
              <p className="text-sm text-red-700">
                Release candidate status is {formatReleaseStatus(readiness.overallStatus)} — resolve failed validations and configuration issues before production release.
              </p>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'integration' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => runIntegrationValidation(accessToken!), 'Integration validation completed.')}
            >
              Run Integration Validation
            </Button>
          ) : null}
          <Panel title="Latest Run">
            {dashboard.latestIntegrationRun ? (
              <p className="text-sm">
                {dashboard.latestIntegrationRun.runKey} — {formatValidationStatus(dashboard.latestIntegrationRun.status)} ·{' '}
                {dashboard.latestIntegrationRun.passedCount}/{dashboard.latestIntegrationRun.checkCount} passed
              </p>
            ) : (
              <EmptyState title="No integration validation runs" description="Run cross-platform integration validation against real tenant data." />
            )}
          </Panel>
          <Panel title="Check Results">
            {dashboard.latestIntegrationResults.length === 0 ? (
              <EmptyState title="No check results" description="Run integration validation to verify authentication, RBAC, CRM, integrations, and platform modules." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.latestIntegrationResults.map((result) => (
                  <li key={result.id} className="py-2 text-sm">
                    <span className="font-medium">{result.checkName}</span> — {formatValidationStatus(result.status)}
                    {result.message ? `: ${result.message}` : ''}
                    {result.recommendation ? <p className="text-slate-500">{result.recommendation}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'workflow' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => runWorkflowValidation(accessToken!), 'Workflow validation completed.')}
            >
              Run Workflow Validation
            </Button>
          ) : null}
          <Panel title="Latest Run">
            {dashboard.latestWorkflowRun ? (
              <p className="text-sm">
                {dashboard.latestWorkflowRun.runKey} — {formatValidationStatus(dashboard.latestWorkflowRun.status)} ·{' '}
                {dashboard.latestWorkflowRun.passedCount}/{dashboard.latestWorkflowRun.stepCount} passed
              </p>
            ) : (
              <EmptyState title="No workflow validation runs" description="Run end-to-end workflow validation for lead-to-payment flows." />
            )}
          </Panel>
          <Panel title="Step Results">
            {dashboard.latestWorkflowResults.length === 0 ? (
              <EmptyState title="No step results" description="Run workflow validation to verify lead, quote, job, dispatch, invoice, and payment flows." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.latestWorkflowResults.map((result) => (
                  <li key={result.id} className="py-2 text-sm">
                    <span className="font-medium">{result.stepName}</span> — {formatValidationStatus(result.status)}
                    {result.message ? `: ${result.message}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'performance' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => capturePerformanceSnapshot(accessToken!), 'Performance snapshot captured.')}
            >
              Capture Performance Snapshot
            </Button>
          ) : null}
          <Panel title="Latest Snapshot">
            {dashboard.latestPerformanceSnapshot ? (
              <ul className="space-y-2 text-sm">
                <li>Slow endpoints: {dashboard.latestPerformanceSnapshot.slowEndpointCount}</li>
                <li>Queue depth: {dashboard.latestPerformanceSnapshot.queueDepth}</li>
                <li>AI latency (ms): {dashboard.latestPerformanceSnapshot.aiLatencyMs ?? '—'}</li>
                <li>Search index count: {dashboard.latestPerformanceSnapshot.searchIndexCount}</li>
              </ul>
            ) : (
              <EmptyState title="No performance snapshot" description="Capture a read-only performance analysis from production readiness and platform health data." />
            )}
          </Panel>
          <Panel title="Optimization Opportunities">
            {(dashboard.latestPerformanceSnapshot?.optimizationOpportunities ?? []).length === 0 ? (
              <EmptyState title="No optimization opportunities" description="Run a performance snapshot to identify optimization targets." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {(dashboard.latestPerformanceSnapshot?.optimizationOpportunities ?? []).map((item, index) => (
                  <li key={index} className="py-2 text-sm">
                    <span className="font-medium">{String(item.type ?? 'opportunity')}</span>
                    {item.recommendation ? `: ${String(item.recommendation)}` : ''}
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
              onClick={() => void runAction(() => runSecurityVerification(accessToken!), 'Security verification completed.')}
            >
              Run Security Verification
            </Button>
          ) : null}
          <Panel title="Security Findings (Report Only)">
            {dashboard.latestSecurityVerification ? (
              <ul className="space-y-2 text-sm">
                <li>Status: {formatValidationStatus(dashboard.latestSecurityVerification.status)}</li>
                <li>Findings: {dashboard.latestSecurityVerification.findingCount}</li>
                <li>Critical: {dashboard.latestSecurityVerification.criticalCount}</li>
                <li>Warnings: {dashboard.latestSecurityVerification.warningCount}</li>
              </ul>
            ) : (
              <EmptyState title="No security verification" description="Run security verification to review auth, RBAC, audit logging, and encryption status." />
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'configuration' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => runConfigurationReview(accessToken!), 'Configuration review completed.')}
            >
              Run Configuration Review
            </Button>
          ) : null}
          <Panel title="Configuration Findings">
            {dashboard.latestConfigurationReview ? (
              <ul className="divide-y divide-slate-100">
                {dashboard.latestConfigurationReview.findings.map((finding, index) => (
                  <li key={index} className="py-2 text-sm">
                    <span className="font-medium">{String(finding.key ?? 'config')}</span>
                    {finding.message ? `: ${String(finding.message)}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No configuration review" description="Review environment variables, provider adapters, and integration configuration." />
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'checklist' ? (
        <Panel title="Release Checklist">
          {dashboard.releaseChecklist.length === 0 ? (
            <EmptyState title="No checklist items" description="Checklist items are seeded automatically on first access." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboard.releaseChecklist.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{item.itemName}</p>
                    <p className="text-sm text-slate-500">{item.category}{item.isRequired ? ' · Required' : ''}</p>
                  </div>
                  <span className="text-sm">{formatChecklistStatus(item.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'reports' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() => void runAction(() => generateReleaseReport(accessToken!), 'Release candidate report generated.')}
            >
              Generate Release Candidate Report
            </Button>
          ) : null}
          <Panel title="Latest Report">
            {dashboard.latestReleaseReport ? (
              <ul className="space-y-2 text-sm">
                <li>Report: {dashboard.latestReleaseReport.reportKey}</li>
                <li>Status: {formatReleaseStatus(dashboard.latestReleaseReport.overallStatus)}</li>
                <li>Readiness score: {dashboard.latestReleaseReport.readinessScore ?? '—'}</li>
                <li>Passed validations: {dashboard.latestReleaseReport.passedValidationCount}</li>
                <li>Failed validations: {dashboard.latestReleaseReport.failedValidationCount}</li>
                <li>Warnings: {dashboard.latestReleaseReport.warningCount}</li>
                <li>Optimization opportunities: {dashboard.latestReleaseReport.optimizationCount}</li>
                <li>Manual tasks remaining: {dashboard.latestReleaseReport.manualTaskCount}</li>
              </ul>
            ) : (
              <EmptyState title="No release report" description="Generate a release candidate report aggregating all validation runs." />
            )}
          </Panel>
        </div>
      ) : null}

      {activeTab === 'audit' ? (
        <Panel title="Audit Log">
          {isSupplementaryLoading ? (
            <p className="text-sm text-slate-500">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <EmptyState title="No audit entries" description="Release center actions are logged for complete auditability." />
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
        <Panel title="AURA Release Candidate Agent">
          <p className="mb-4 text-sm text-slate-600">
            Ask about release readiness, validation reports, configuration status, optimization opportunities, or request draft release notes and deployment recommendations.
          </p>
          <AuraMessageList messages={agentMessages} isSending={isSending} />
          {pendingTasks.map((task) => (
            <AuraTaskApprovalCard key={task.id} task={task} accessToken={accessToken ?? ''} onUpdated={updateTask} />
          ))}
          <AuraComposer
            disabled={isSending}
            onSend={(content) => void sendAgentMessage(content, 'release_candidate' as import('@titan/shared').AgentKey)}
          />
          {assistantError ? <p className="mt-2 text-sm text-red-600">{assistantError}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
