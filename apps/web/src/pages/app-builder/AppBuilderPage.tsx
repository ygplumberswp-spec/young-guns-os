import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type {
  AbAppBuilderAlertSummary,
  AbApprovalRecordSummary,
  AbArchitectureImpactSummary,
  AbAuditLogSummary,
  AbCodeGenerationRecordSummary,
  AbDatabaseChangePlanSummary,
  AbDeploymentSummary,
  AbDevelopmentWorkspaceSummary,
  AbDocumentationUpdateSummary,
  AbFeatureRegistryEntrySummary,
  AbFeatureRequestSummary,
  AbPreviewRecordSummary,
  AbRequirementsAnalysisSummary,
  AbRollbackSummary,
  AbTestRunSummary,
  EnterpriseAppBuilderDashboard,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureAppBuilderAnalytics,
  fetchAbAuditLogs,
  fetchAbCodeGenerationRecords,
  fetchAbDatabaseChangePlans,
  fetchAbDocumentationUpdates,
  fetchAbFeatureRequests,
  fetchAppBuilderDashboard,
  syncAppBuilderAlerts,
} from '../../lib/enterprise-app-builder-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessAppBuilder,
  canManageAppBuilder,
  formatRiskLevel,
  formatSeverity,
  formatStatus,
} from '../../features/app-builder/utils';

type AppBuilderTab =
  | 'overview'
  | 'feature-requests'
  | 'requirements'
  | 'architecture-impact'
  | 'development-workspace'
  | 'code-generation'
  | 'database-changes'
  | 'testing'
  | 'preview'
  | 'approvals'
  | 'deployments'
  | 'rollbacks'
  | 'documentation'
  | 'feature-registry'
  | 'audit'
  | 'assistant';

type SupplementaryData = {
  featureRequests: AbFeatureRequestSummary[];
  codeGenerationRecords: AbCodeGenerationRecordSummary[];
  databaseChangePlans: AbDatabaseChangePlanSummary[];
  documentationUpdates: AbDocumentationUpdateSummary[];
  appBuilderAlerts: AbAppBuilderAlertSummary[];
  auditLogs: AbAuditLogSummary[];
};

const emptySupplementary: SupplementaryData = {
  featureRequests: [],
  codeGenerationRecords: [],
  databaseChangePlans: [],
  documentationUpdates: [],
  appBuilderAlerts: [],
  auditLogs: [],
};

export function AppBuilderPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AppBuilderTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseAppBuilderDashboard | null>(null);
  const [supplementary, setSupplementary] = useState<SupplementaryData>(emptySupplementary);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    agentMessages,
    isSending,
    pendingTasks,
    sendAgentMessage,
    updateTask,
    error: assistantError,
  } = useAuraChat();

  const canView = useMemo(() => (user ? canAccessAppBuilder(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageAppBuilder(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchAppBuilderDashboard(accessToken);
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
        const data = await fetchAppBuilderDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load app builder dashboard',
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

  useEffect(() => {
    if (!accessToken || !canView) return;

    const loaders: Partial<Record<AppBuilderTab, () => Promise<void>>> = {
      'feature-requests': async () => {
        const featureRequests = await fetchAbFeatureRequests(accessToken);
        setSupplementary((prev) => ({ ...prev, featureRequests }));
      },
      'code-generation': async () => {
        const codeGenerationRecords = await fetchAbCodeGenerationRecords(accessToken);
        setSupplementary((prev) => ({ ...prev, codeGenerationRecords }));
      },
      'database-changes': async () => {
        const databaseChangePlans = await fetchAbDatabaseChangePlans(accessToken);
        setSupplementary((prev) => ({ ...prev, databaseChangePlans }));
      },
      documentation: async () => {
        const documentationUpdates = await fetchAbDocumentationUpdates(accessToken);
        setSupplementary((prev) => ({ ...prev, documentationUpdates }));
      },
      audit: async () => {
        const auditLogs = await fetchAbAuditLogs(accessToken);
        setSupplementary((prev) => ({ ...prev, auditLogs }));
      },
    };

    const loader = loaders[activeTab];
    if (!loader) return;

    let cancelled = false;
    setIsSupplementaryLoading(true);
    void loader()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load tab data');
        }
      })
      .finally(() => {
        if (!cancelled) setIsSupplementaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeTab, canView]);

  async function runAction(action: () => Promise<unknown>, message: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
      setSuccess(message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader
          title="App Builder"
          description="You do not have permission to view the app builder platform."
        />
      </div>
    );
  }

  const tabs: Array<{ id: AppBuilderTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'feature-requests', label: 'Feature Requests' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'architecture-impact', label: 'Architecture Impact' },
    { id: 'development-workspace', label: 'Development Workspace' },
    { id: 'code-generation', label: 'Code Generation' },
    { id: 'database-changes', label: 'Database Changes' },
    { id: 'testing', label: 'Testing' },
    { id: 'preview', label: 'Preview' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'deployments', label: 'Deployments' },
    { id: 'rollbacks', label: 'Rollbacks' },
    { id: 'documentation', label: 'Documentation' },
    { id: 'feature-registry', label: 'Feature Registry' },
    { id: 'audit', label: 'Audit' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  const featureRequests =
    supplementary.featureRequests.length > 0
      ? supplementary.featureRequests
      : (dashboard?.recentFeatureRequests ?? []);

  function renderFeatureRequestList(items: AbFeatureRequestSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No feature requests"
          description="Submit a feature request to begin the build pipeline."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((request) => (
          <div key={request.id} className="data-list-item">
            <strong>{request.title}</strong>
            <span className="status-pill">{formatStatus(request.workflowStatus)}</span>
            <p>
              {request.requestKey} · {request.requestType} · Risk:{' '}
              {formatRiskLevel(request.riskLevel)}
            </p>
            {request.naturalLanguageRequest ? <p>{request.naturalLanguageRequest}</p> : null}
          </div>
        ))}
      </div>
    );
  }

  function renderRequirementsList(items: AbRequirementsAnalysisSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No requirements analyses"
          description="Analyze requirements from a feature request."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((analysis) => (
          <div key={analysis.id} className="data-list-item">
            <strong>Feature {analysis.featureRequestId.slice(0, 8)}…</strong>
            <span className="status-pill">{formatRiskLevel(analysis.riskLevel)}</span>
            <p>
              Complexity: {analysis.estimatedComplexity ?? '—'}
              {analysis.analyzedAt ? ` · Analyzed ${analysis.analyzedAt}` : ''}
            </p>
            {analysis.implementationPlan ? <p>{analysis.implementationPlan}</p> : null}
          </div>
        ))}
      </div>
    );
  }

  function renderArchitectureList(items: AbArchitectureImpactSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No architecture impact analyses"
          description="Run architecture impact analysis on a feature request."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((impact) => (
          <div key={impact.id} className="data-list-item">
            <strong>Feature {impact.featureRequestId.slice(0, 8)}…</strong>
            <span className="status-pill">{impact.breakingChangeRisk ?? '—'}</span>
            <p>
              {impact.frontendImpact ? `Frontend: ${impact.frontendImpact}` : ''}
              {impact.backendImpact ? ` · Backend: ${impact.backendImpact}` : ''}
              {impact.databaseImpact ? ` · Database: ${impact.databaseImpact}` : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }

  function renderWorkspaceList(items: AbDevelopmentWorkspaceSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No development workspaces"
          description="Create an isolated workspace for a feature request."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((workspace) => (
          <div key={workspace.id} className="data-list-item">
            <strong>{workspace.workspaceKey}</strong>
            <span className="status-pill">{formatStatus(workspace.status)}</span>
            <p>
              {workspace.branchName ?? 'No branch'}
              {workspace.isolationMode ? ` · ${workspace.isolationMode}` : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }

  function renderCodeGenerationList(items: AbCodeGenerationRecordSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No code generation records"
          description="Code generation records are created when artifacts are explicitly generated."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((record) => (
          <div key={record.id} className="data-list-item">
            <strong>{record.generationKey}</strong>
            <span className="status-pill">{formatStatus(record.workflowStatus)}</span>
            <p>
              {record.artifactType}
              {record.artifactPath ? ` · ${record.artifactPath}` : ''}
              {record.language ? ` · ${record.language}` : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }

  function renderDatabaseChangeList(items: AbDatabaseChangePlanSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No database change plans"
          description="Schema change plans require owner approval."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((plan) => (
          <div key={plan.id} className="data-list-item">
            <strong>{plan.migrationKey}</strong>
            <span className="status-pill">{formatStatus(plan.workflowStatus)}</span>
            <p>
              {plan.description ?? '—'}
              {plan.requiresOwnerApproval ? ' · owner approval required' : ''}
              {plan.estimatedDurationMinutes != null
                ? ` · ~${plan.estimatedDurationMinutes} min`
                : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }

  function renderTestRunList(items: AbTestRunSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No test runs"
          description="Run test validation after code changes are ready."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((run) => (
          <div key={run.id} className="data-list-item">
            <strong>{run.runKey}</strong>
            <span className="status-pill">{formatStatus(run.workflowStatus)}</span>
            <p>
              {run.testSuite} · Passed: {run.passedCount} · Failed: {run.failedCount} · Skipped:{' '}
              {run.skippedCount}
            </p>
          </div>
        ))}
      </div>
    );
  }

  function renderPreviewList(items: AbPreviewRecordSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No previews"
          description="Create a preview after workspace changes are ready."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((preview) => (
          <div key={preview.id} className="data-list-item">
            <strong>{preview.previewKey}</strong>
            {preview.previewUrl ? (
              <a href={preview.previewUrl} target="_blank" rel="noreferrer">
                {preview.previewUrl}
              </a>
            ) : null}
            <p>{preview.changeSummary ?? '—'}</p>
          </div>
        ))}
      </div>
    );
  }

  function renderApprovalList(items: AbApprovalRecordSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No approval records"
          description="Submit feature requests for approval before deployment."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((approval) => (
          <div key={approval.id} className="data-list-item">
            <strong>{approval.approvalType}</strong>
            <span className="status-pill">{formatStatus(approval.workflowStatus)}</span>
            <p>
              Feature {approval.featureRequestId.slice(0, 8)}…
              {approval.rejectedReason ? ` · ${approval.rejectedReason}` : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }

  function renderDeploymentList(items: AbDeploymentSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No deployments"
          description="Deploy approved features through the governed pipeline."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((deployment) => (
          <div key={deployment.id} className="data-list-item">
            <strong>{deployment.deploymentKey}</strong>
            <span className="status-pill">{formatStatus(deployment.workflowStatus)}</span>
            <p>
              {deployment.environment}
              {deployment.version ? ` · v${deployment.version}` : ''}
              {deployment.verificationStatus ? ` · ${deployment.verificationStatus}` : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }

  function renderRollbackList(items: AbRollbackSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No rollbacks"
          description="Rollbacks are recorded when deployments are reverted."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((rollback) => (
          <div key={rollback.id} className="data-list-item">
            <strong>{rollback.rollbackKey}</strong>
            <span className="status-pill">{formatStatus(rollback.workflowStatus)}</span>
            <p>
              {rollback.reason ?? '—'}
              {rollback.verified ? ' · verified' : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }

  function renderDocumentationList(items: AbDocumentationUpdateSummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No documentation updates"
          description="Documentation updates are tracked per feature."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((doc) => (
          <div key={doc.id} className="data-list-item">
            <strong>{doc.docType}</strong>
            <span className="status-pill">{formatStatus(doc.workflowStatus)}</span>
            <p>
              {doc.docPath ?? '—'}
              {doc.changeSummary ? ` · ${doc.changeSummary}` : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }

  function renderRegistryList(items: AbFeatureRegistryEntrySummary[]) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="No registry entries"
          description="Feature registry tracks deployed platform capabilities."
        />
      );
    }
    return (
      <div className="data-list">
        {items.map((entry) => (
          <div key={entry.id} className="data-list-item">
            <strong>{entry.name}</strong>
            <span className="status-pill">{formatStatus(entry.status)}</span>
            <p>
              {entry.registryKey} · {entry.featureType} · v{entry.version}
              {entry.routePath ? ` · ${entry.routePath}` : ''}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="App Builder"
        description="Enterprise AURA App Builder — governed feature development from natural language requests through requirements, architecture review, testing, approval, and deployment."
        actions={
          <div className="page-header-actions">
            <Link href="/developers">
              <Button variant="secondary">Developers</Button>
            </Link>
            <Link href="/mission-control">
              <Button variant="secondary">Mission Control</Button>
            </Link>
          </div>
        }
      />

      <div className="tab-row">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}
      {isLoading ? <p>Loading app builder...</p> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Feature Requests" value={String(dashboard.featureRequestCount)} />
            <StatCard label="Pending Approvals" value={String(dashboard.pendingApprovalCount)} />
            <StatCard label="Active Workspaces" value={String(dashboard.activeWorkspaceCount)} />
            <StatCard label="Failed Tests" value={String(dashboard.failedTestCount)} />
            <StatCard label="Failed Deployments" value={String(dashboard.failedDeploymentCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
            <StatCard label="Registry Entries" value={String(dashboard.registryEntryCount)} />
            <StatCard label="Build Health" value={dashboard.overallBuildHealthStatus} />
          </div>
          <Panel
            title="Build Monitoring"
            description={dashboard.buildMonitoring.alerts.join(' · ') || 'No active build signals'}
          >
            <p>{dashboard.summary}</p>
            <ul className="simple-list">
              <li>
                Active feature requests: {dashboard.buildMonitoring.activeFeatureRequestCount}
              </li>
              <li>Pending approvals: {dashboard.buildMonitoring.pendingApprovalCount}</li>
              <li>Failed builds: {dashboard.buildMonitoring.failedBuildCount}</li>
              <li>Failed tests: {dashboard.buildMonitoring.failedTestCount}</li>
              <li>Pending deployments: {dashboard.buildMonitoring.pendingDeploymentCount}</li>
              <li>Open alerts: {dashboard.buildMonitoring.openAlertCount}</li>
            </ul>
            {canWrite ? (
              <div className="panel-actions">
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => syncAppBuilderAlerts(accessToken!),
                      'App builder alerts synced from platform signals.',
                    )
                  }
                >
                  Sync Alerts
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => captureAppBuilderAnalytics(accessToken!),
                      'Analytics captured from real build pipeline data.',
                    )
                  }
                >
                  Capture Analytics
                </Button>
              </div>
            ) : null}
          </Panel>
          {dashboard.analytics ? (
            <Panel
              title="Latest Analytics Snapshot"
              description={`Captured ${dashboard.analytics.capturedAt}`}
            >
              <ul className="simple-list">
                <li>Feature requests: {dashboard.analytics.featureRequestCount}</li>
                <li>Pending approvals: {dashboard.analytics.pendingApprovalCount}</li>
                <li>Active workspaces: {dashboard.analytics.activeWorkspaceCount}</li>
                <li>Failed tests: {dashboard.analytics.failedTestCount}</li>
                <li>Failed deployments: {dashboard.analytics.failedDeploymentCount}</li>
                <li>Open alerts: {dashboard.analytics.openAlertCount}</li>
                <li>Registry entries: {dashboard.analytics.registryEntryCount}</li>
                <li>Build health: {dashboard.analytics.overallBuildHealthStatus}</li>
              </ul>
            </Panel>
          ) : null}
          {dashboard.recentAlerts.length > 0 ? (
            <Panel title="Recent Alerts" description="Latest build pipeline alerts">
              <div className="data-list">
                {dashboard.recentAlerts.map((alert) => (
                  <div key={alert.id} className="data-list-item">
                    <strong>{alert.title}</strong>
                    <span className="status-pill">{formatSeverity(alert.severity)}</span>
                    <p>
                      {alert.alertType} · {formatStatus(alert.status)}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </>
      ) : null}

      {dashboard && activeTab === 'feature-requests' ? (
        <Panel
          title="Feature Requests"
          description="Natural language and structured feature development requests"
        >
          {isSupplementaryLoading && featureRequests.length === 0 ? (
            <p>Loading feature requests...</p>
          ) : null}
          {renderFeatureRequestList(featureRequests)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'requirements' ? (
        <Panel
          title="Requirements"
          description="Requirements analyses derived from feature request content"
        >
          {renderRequirementsList(dashboard.recentRequirements)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'architecture-impact' ? (
        <Panel
          title="Architecture Impact"
          description="Impact assessments across frontend, backend, database, and security"
        >
          {renderArchitectureList(dashboard.recentArchitectureImpacts)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'development-workspace' ? (
        <Panel
          title="Development Workspace"
          description="Isolated workspaces — production remains untouched"
        >
          {renderWorkspaceList(dashboard.recentWorkspaces)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'code-generation' ? (
        <Panel
          title="Code Generation"
          description="Artifact metadata for explicitly generated code — no fake generation"
        >
          {isSupplementaryLoading ? <p>Loading code generation records...</p> : null}
          {renderCodeGenerationList(
            supplementary.codeGenerationRecords.length > 0
              ? supplementary.codeGenerationRecords
              : [],
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'database-changes' ? (
        <Panel
          title="Database Changes"
          description="Schema migration plans with owner approval for sensitive areas"
        >
          {isSupplementaryLoading ? <p>Loading database change plans...</p> : null}
          {renderDatabaseChangeList(
            supplementary.databaseChangePlans.length > 0 ? supplementary.databaseChangePlans : [],
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'testing' ? (
        <Panel
          title="Testing"
          description="Test validation runs recorded from actual workflow execution"
        >
          {renderTestRunList(dashboard.recentTestRuns)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'preview' ? (
        <Panel
          title="Preview"
          description="Preview environments with change summaries from workspace activity"
        >
          {renderPreviewList(dashboard.recentPreviews)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'approvals' ? (
        <Panel title="Approvals" description="Governed approval workflow before deployment">
          {renderApprovalList(dashboard.recentApprovals)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'deployments' ? (
        <Panel
          title="Deployments"
          description="Approved feature deployments with verification tracking"
        >
          {renderDeploymentList(dashboard.recentDeployments)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'rollbacks' ? (
        <Panel title="Rollbacks" description="Deployment rollbacks with verification status">
          {renderRollbackList(dashboard.recentRollbacks)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'documentation' ? (
        <Panel title="Documentation" description="Documentation updates tracked per feature">
          {isSupplementaryLoading ? <p>Loading documentation updates...</p> : null}
          {renderDocumentationList(
            supplementary.documentationUpdates.length > 0 ? supplementary.documentationUpdates : [],
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'feature-registry' ? (
        <Panel
          title="Feature Registry"
          description="Platform capability registry for routes, APIs, and modules"
        >
          {renderRegistryList(dashboard.recentRegistryEntries)}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'audit' ? (
        <Panel
          title="Audit Trail"
          description="Complete history of app builder actions and changes"
        >
          {isSupplementaryLoading ? <p>Loading audit logs...</p> : null}
          {supplementary.auditLogs.length === 0 ? (
            <EmptyState
              title="No audit logs"
              description="Audit entries are recorded for every app builder action."
            />
          ) : (
            <div className="data-list">
              {supplementary.auditLogs.map((log) => (
                <div key={log.id} className="data-list-item">
                  <strong>{log.actionType}</strong>
                  <p>
                    {log.entityType ?? '—'}
                    {log.entityId ? ` · ${log.entityId}` : ''} · {log.createdAt}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel
          title="AURA App Builder Agent"
          description="Feature development guidance, requirements analysis, and governed build drafts — no autonomous changes without approval"
        >
          {assistantError ? <p className="form-error">{assistantError}</p> : null}
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
              void sendAgentMessage(content, 'app_builder' as import('@titan/shared').AgentKey)
            }
            placeholder="Ask about feature requests, requirements, architecture impact, testing, approvals, or deployment…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
