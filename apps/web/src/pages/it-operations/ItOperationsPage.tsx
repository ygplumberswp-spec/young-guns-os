import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type {
  EnterpriseItOperationsDashboard,
  ItoApiReliabilitySnapshotSummary,
  ItoAiProviderHealthSummary,
  ItoBackupVerificationSummary,
  ItoBuildRecordSummary,
  ItoDatabaseHealthSnapshotSummary,
  ItoDependencyRecordSummary,
  ItoIntegrationHealthSummary,
  ItoPerformanceSnapshotSummary,
  ItoSelfHealingActionSummary,
  ItoTechnicalDebtRecordSummary,
  ItoTestRunSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureItAnalytics,
  captureItHealthSignals,
  fetchItApiReliabilitySnapshots,
  fetchItAiProviderHealth,
  fetchItAuditLogs,
  fetchItBackupVerifications,
  fetchItBuildRecords,
  fetchItDatabaseHealthSnapshots,
  fetchItDependencyRecords,
  fetchItIntegrationHealth,
  fetchItOperationsDashboard,
  fetchItPerformanceSnapshots,
  fetchItSelfHealingActions,
  fetchItTechnicalDebtRecords,
  fetchItTestRuns,
  syncItAlerts,
  syncItBugDetections,
} from '../../lib/enterprise-it-operations-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessItOperations,
  canManageItOperations,
  formatHealthStatus,
  formatSeverity,
  formatWorkflowStatus,
} from '../../features/it-operations/utils';
import { formatModuleKey } from '../../features/operations/utils';

type ItOperationsTab =
  | 'overview'
  | 'health'
  | 'self-healing'
  | 'bugs'
  | 'incidents'
  | 'deployments'
  | 'builds'
  | 'apis'
  | 'databases'
  | 'providers'
  | 'ai-providers'
  | 'performance'
  | 'security'
  | 'backups'
  | 'disaster-recovery'
  | 'technical-debt'
  | 'monitoring'
  | 'alerts'
  | 'audit'
  | 'assistant';

type SupplementaryData = {
  buildRecords: ItoBuildRecordSummary[];
  testRuns: ItoTestRunSummary[];
  databaseSnapshots: ItoDatabaseHealthSnapshotSummary[];
  apiSnapshots: ItoApiReliabilitySnapshotSummary[];
  aiProviderHealth: ItoAiProviderHealthSummary[];
  integrationHealth: ItoIntegrationHealthSummary[];
  performanceSnapshots: ItoPerformanceSnapshotSummary[];
  backupVerifications: ItoBackupVerificationSummary[];
  technicalDebtRecords: ItoTechnicalDebtRecordSummary[];
  dependencyRecords: ItoDependencyRecordSummary[];
  selfHealingActions: ItoSelfHealingActionSummary[];
  auditLogs: Array<{
    id: string;
    actionType: string;
    entityType: string | null;
    entityId: string | null;
    userId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
};

const emptySupplementary: SupplementaryData = {
  buildRecords: [],
  testRuns: [],
  databaseSnapshots: [],
  apiSnapshots: [],
  aiProviderHealth: [],
  integrationHealth: [],
  performanceSnapshots: [],
  backupVerifications: [],
  technicalDebtRecords: [],
  dependencyRecords: [],
  selfHealingActions: [],
  auditLogs: [],
};

export function ItOperationsPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<ItOperationsTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseItOperationsDashboard | null>(null);
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

  const canView = useMemo(() => (user ? canAccessItOperations(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageItOperations(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchItOperationsDashboard(accessToken);
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
        const data = await fetchItOperationsDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : 'Unable to load IT operations dashboard',
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

    const loaders: Partial<Record<ItOperationsTab, () => Promise<void>>> = {
      builds: async () => {
        const [buildRecords, testRuns] = await Promise.all([
          fetchItBuildRecords(accessToken),
          fetchItTestRuns(accessToken),
        ]);
        setSupplementary((prev) => ({ ...prev, buildRecords, testRuns }));
      },
      apis: async () => {
        const apiSnapshots = await fetchItApiReliabilitySnapshots(accessToken);
        setSupplementary((prev) => ({ ...prev, apiSnapshots }));
      },
      databases: async () => {
        const databaseSnapshots = await fetchItDatabaseHealthSnapshots(accessToken);
        setSupplementary((prev) => ({ ...prev, databaseSnapshots }));
      },
      providers: async () => {
        const integrationHealth = await fetchItIntegrationHealth(accessToken);
        setSupplementary((prev) => ({ ...prev, integrationHealth }));
      },
      'ai-providers': async () => {
        const aiProviderHealth = await fetchItAiProviderHealth(accessToken);
        setSupplementary((prev) => ({ ...prev, aiProviderHealth }));
      },
      performance: async () => {
        const performanceSnapshots = await fetchItPerformanceSnapshots(accessToken);
        setSupplementary((prev) => ({ ...prev, performanceSnapshots }));
      },
      backups: async () => {
        const backupVerifications = await fetchItBackupVerifications(accessToken);
        setSupplementary((prev) => ({ ...prev, backupVerifications }));
      },
      'technical-debt': async () => {
        const [technicalDebtRecords, dependencyRecords] = await Promise.all([
          fetchItTechnicalDebtRecords(accessToken),
          fetchItDependencyRecords(accessToken),
        ]);
        setSupplementary((prev) => ({ ...prev, technicalDebtRecords, dependencyRecords }));
      },
      'self-healing': async () => {
        const selfHealingActions = await fetchItSelfHealingActions(accessToken);
        setSupplementary((prev) => ({ ...prev, selfHealingActions }));
      },
      audit: async () => {
        const auditLogs = await fetchItAuditLogs(accessToken);
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
          title="IT Operations"
          description="You do not have permission to view IT operations."
        />
      </div>
    );
  }

  const tabs: Array<{ id: ItOperationsTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'health', label: 'Health' },
    { id: 'self-healing', label: 'Self-Healing' },
    { id: 'bugs', label: 'Bugs' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'deployments', label: 'Deployments' },
    { id: 'builds', label: 'Builds' },
    { id: 'apis', label: 'APIs' },
    { id: 'databases', label: 'Databases' },
    { id: 'providers', label: 'Providers' },
    { id: 'ai-providers', label: 'AI Providers' },
    { id: 'performance', label: 'Performance' },
    { id: 'security', label: 'Security' },
    { id: 'backups', label: 'Backups' },
    { id: 'disaster-recovery', label: 'Disaster Recovery' },
    { id: 'technical-debt', label: 'Technical Debt' },
    { id: 'monitoring', label: 'Monitoring' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'audit', label: 'Audit' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="IT Operations"
        description="Autonomous IT operations, self-healing, DevOps intelligence, and platform reliability. Real telemetry only — low-risk repairs require approval."
        actions={
          <div className="page-header-actions">
            <Link href="/operations">
              <Button variant="secondary">Production Operations</Button>
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
      {isLoading ? <p>Loading IT operations...</p> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard
              label="Overall Health"
              value={formatHealthStatus(dashboard.overallHealthStatus)}
            />
            <StatCard label="Open Incidents" value={String(dashboard.openIncidentCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
            <StatCard label="Degraded Monitors" value={String(dashboard.degradedMonitorCount)} />
            <StatCard label="Open Bugs" value={String(dashboard.openBugCount)} />
            <StatCard label="Failed Deployments" value={String(dashboard.failedDeploymentCount)} />
          </div>
          <Panel
            title="Platform Health Monitoring"
            description={
              dashboard.operationsMonitoring.alerts.join(' · ') ||
              'No active alerts from real platform data'
            }
          >
            <p>{dashboard.summary}</p>
            <ul className="simple-list">
              <li>Health monitors: {dashboard.monitorCount}</li>
              <li>Pending change requests: {dashboard.pendingChangeRequestCount}</li>
              <li>Technical debt items: {dashboard.technicalDebtCount}</li>
            </ul>
            {canWrite ? (
              <div className="panel-actions">
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => captureItAnalytics(accessToken!),
                      'Analytics captured from real platform data.',
                    )
                  }
                >
                  Capture Analytics
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => syncItAlerts(accessToken!),
                      'IT alerts synced from real monitoring signals.',
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
                      () => syncItBugDetections(accessToken!),
                      'Bug detections synced from real telemetry.',
                    )
                  }
                >
                  Sync Bug Detections
                </Button>
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => captureItHealthSignals(accessToken!),
                      'Health signals captured from live modules.',
                    )
                  }
                >
                  Capture Health Signals
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
                <li>Open incidents: {dashboard.analytics.openIncidentCount}</li>
                <li>Open alerts: {dashboard.analytics.openAlertCount}</li>
                <li>Degraded monitors: {dashboard.analytics.degradedMonitorCount}</li>
                <li>
                  Overall health: {formatHealthStatus(dashboard.analytics.overallHealthStatus)}
                </li>
              </ul>
            </Panel>
          ) : null}
        </>
      ) : null}

      {dashboard && activeTab === 'health' ? (
        <Panel
          title="Global Health Monitoring"
          description="Health from configured monitors and production readiness modules"
        >
          {dashboard.productionReadiness ? (
            <div className="data-list">
              {dashboard.productionReadiness.systemHealth.map((module) => (
                <div key={module.moduleKey} className="data-list-item">
                  <strong>{formatModuleKey(module.moduleKey)}</strong>
                  <span className="status-pill">{formatHealthStatus(module.status)}</span>
                  {module.availabilityPercent != null ? (
                    <p>Availability: {module.availabilityPercent}%</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No production readiness data"
              description="Capture health signals or configure monitors to populate module health."
            />
          )}
          {dashboard.recentHealthMonitors.length > 0 ? (
            <div className="data-list">
              {dashboard.recentHealthMonitors.map((monitor) => (
                <div key={monitor.id} className="data-list-item">
                  <strong>{monitor.name}</strong>
                  <span className="status-pill">{formatHealthStatus(monitor.healthStatus)}</span>
                  <p>
                    {monitor.monitorType}
                    {monitor.targetModule ? ` · ${monitor.targetModule}` : ''}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'self-healing' ? (
        <Panel
          title="Self-Healing Engine"
          description="Autonomous low-risk repairs with full audit trail"
        >
          {isSupplementaryLoading ? <p>Loading self-healing actions...</p> : null}
          {supplementary.selfHealingActions.length === 0 &&
          dashboard.recentRepairAttempts.length === 0 ? (
            <EmptyState
              title="No self-healing actions"
              description="Safe repairs appear here after detection and approval."
            />
          ) : (
            <div className="data-list">
              {supplementary.selfHealingActions.map((action) => (
                <div key={action.id} className="data-list-item">
                  <strong>{action.actionType}</strong>
                  <span className="status-pill">{formatWorkflowStatus(action.workflowStatus)}</span>
                  <p>
                    Risk: {action.riskLevel}
                    {action.outcome ? ` · ${action.outcome}` : ''}
                  </p>
                </div>
              ))}
              {dashboard.recentRepairAttempts.map((attempt) => (
                <div key={attempt.id} className="data-list-item">
                  <strong>{attempt.repairType}</strong>
                  <span className="status-pill">
                    {formatWorkflowStatus(attempt.workflowStatus)}
                  </span>
                  <p>
                    Risk: {attempt.riskLevel}
                    {attempt.success != null
                      ? ` · ${attempt.success ? 'Verified' : 'Failed verification'}`
                      : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'bugs' ? (
        <Panel
          title="Autonomous Bug Detection"
          description="Runtime errors and failures from real telemetry"
        >
          {dashboard.recentBugDetections.length === 0 ? (
            <EmptyState
              title="No bug detections"
              description="Sync bug detections from operational logs and monitoring."
            />
          ) : (
            <div className="data-list">
              {dashboard.recentBugDetections.map((bug) => (
                <div key={bug.id} className="data-list-item">
                  <strong>{bug.title}</strong>
                  <span className="status-pill">{formatSeverity(bug.severity)}</span>
                  <p>
                    {bug.detectionSource} · {formatWorkflowStatus(bug.workflowStatus)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'incidents' ? (
        <Panel
          title="Incident Management"
          description="Incidents linked to deployments, bugs, and providers"
        >
          {dashboard.recentIncidents.length === 0 ? (
            <EmptyState
              title="No incidents"
              description="Incidents are created from real platform failures and monitoring alerts."
            />
          ) : (
            <div className="data-list">
              {dashboard.recentIncidents.map((incident) => (
                <div key={incident.id} className="data-list-item">
                  <strong>{incident.title}</strong>
                  <span className="status-pill">{formatSeverity(incident.severity)}</span>
                  <p>
                    {incident.status}
                    {incident.sourceModule ? ` · ${incident.sourceModule}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'deployments' ? (
        <Panel
          title="Deployment Intelligence"
          description="Staging, production, canary, and rollback history"
        >
          {dashboard.recentDeployments.length === 0 ? (
            <EmptyState
              title="No deployments"
              description="Deployment records appear when builds are promoted through the pipeline."
            />
          ) : (
            <div className="data-list">
              {dashboard.recentDeployments.map((deployment) => (
                <div key={deployment.id} className="data-list-item">
                  <strong>{deployment.deploymentKey}</strong>
                  <span className="status-pill">
                    {formatWorkflowStatus(deployment.deploymentStatus)}
                  </span>
                  <p>
                    {deployment.environment}
                    {deployment.version ? ` · ${deployment.version}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
          {dashboard.recentChangeRequests.length > 0 ? (
            <>
              <h4>Change Requests</h4>
              <div className="data-list">
                {dashboard.recentChangeRequests.map((change) => (
                  <div key={change.id} className="data-list-item">
                    <strong>{change.title}</strong>
                    <span className="status-pill">
                      {formatWorkflowStatus(change.workflowStatus)}
                    </span>
                    <p>Risk: {change.riskLevel}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'builds' ? (
        <Panel
          title="Continuous Testing Platform"
          description="Build and test run history from real CI records"
        >
          {isSupplementaryLoading ? <p>Loading builds and tests...</p> : null}
          {supplementary.buildRecords.length === 0 && supplementary.testRuns.length === 0 ? (
            <EmptyState
              title="No build records"
              description="Build and test records appear when CI pipelines execute."
            />
          ) : (
            <>
              <div className="data-list">
                {supplementary.buildRecords.map((build) => (
                  <div key={build.id} className="data-list-item">
                    <strong>{build.buildKey}</strong>
                    <span className="status-pill">
                      {formatWorkflowStatus(build.workflowStatus)}
                    </span>
                    <p>
                      {build.branch ?? '—'}
                      {build.version ? ` · ${build.version}` : ''}
                    </p>
                  </div>
                ))}
              </div>
              {supplementary.testRuns.length > 0 ? (
                <>
                  <h4>Test Runs</h4>
                  <div className="data-list">
                    {supplementary.testRuns.map((run) => (
                      <div key={run.id} className="data-list-item">
                        <strong>{run.testSuite}</strong>
                        <span className="status-pill">
                          {formatWorkflowStatus(run.workflowStatus)}
                        </span>
                        <p>
                          Passed {run.passedCount} · Failed {run.failedCount} · Skipped{' '}
                          {run.skippedCount}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'apis' ? (
        <Panel
          title="API Reliability"
          description="Latency, error rate, and availability from captured snapshots"
        >
          {isSupplementaryLoading ? <p>Loading API reliability...</p> : null}
          {supplementary.apiSnapshots.length === 0 ? (
            <EmptyState
              title="No API snapshots"
              description="Capture health signals to populate API reliability metrics."
            />
          ) : (
            <div className="data-list">
              {supplementary.apiSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="data-list-item">
                  <strong>{snapshot.endpointGroup}</strong>
                  <span className="status-pill">{formatHealthStatus(snapshot.healthStatus)}</span>
                  <p>
                    {snapshot.availabilityPercent != null
                      ? `Availability ${snapshot.availabilityPercent}%`
                      : '—'}
                    {snapshot.p95LatencyMs != null ? ` · P95 ${snapshot.p95LatencyMs}ms` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'databases' ? (
        <Panel
          title="Database Reliability"
          description="Connections, latency, locks, and replication from real snapshots"
        >
          {isSupplementaryLoading ? <p>Loading database health...</p> : null}
          {supplementary.databaseSnapshots.length === 0 ? (
            <EmptyState
              title="No database snapshots"
              description="Database health appears after monitoring capture runs."
            />
          ) : (
            <div className="data-list">
              {supplementary.databaseSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="data-list-item">
                  <strong>Database snapshot</strong>
                  <span className="status-pill">{formatHealthStatus(snapshot.healthStatus)}</span>
                  <p>
                    Slow queries: {snapshot.slowQueryCount}
                    {snapshot.queryLatencyMs != null
                      ? ` · Latency ${snapshot.queryLatencyMs}ms`
                      : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'providers' ? (
        <Panel
          title="Integration Reliability"
          description="Configured CRM, accounting, fleet, and communication providers"
        >
          {isSupplementaryLoading ? <p>Loading integration health...</p> : null}
          {supplementary.integrationHealth.length === 0 ? (
            <EmptyState
              title="No integration health records"
              description="Integration health is captured from the Universal Connector Platform."
            />
          ) : (
            <div className="data-list">
              {supplementary.integrationHealth.map((item) => (
                <div key={item.id} className="data-list-item">
                  <strong>{item.integrationKey}</strong>
                  <span className="status-pill">{formatHealthStatus(item.healthStatus)}</span>
                  <p>
                    Failures: {item.failureCount}
                    {item.latencyMs != null ? ` · ${item.latencyMs}ms` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'ai-providers' ? (
        <Panel
          title="AI Provider Reliability"
          description="Availability, latency, and failover from configured AI providers"
        >
          {isSupplementaryLoading ? <p>Loading AI provider health...</p> : null}
          {supplementary.aiProviderHealth.length === 0 ? (
            <EmptyState
              title="No AI provider health records"
              description="AI provider metrics appear when providers are configured and monitored."
            />
          ) : (
            <div className="data-list">
              {supplementary.aiProviderHealth.map((item) => (
                <div key={item.id} className="data-list-item">
                  <strong>{item.providerKey}</strong>
                  <span className="status-pill">{formatHealthStatus(item.healthStatus)}</span>
                  <p>
                    Failovers: {item.failoverCount}
                    {item.latencyMs != null ? ` · ${item.latencyMs}ms` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'performance' ? (
        <Panel
          title="Performance Intelligence"
          description="CPU, memory, queue depth, and API latency trends"
        >
          {isSupplementaryLoading ? <p>Loading performance snapshots...</p> : null}
          {supplementary.performanceSnapshots.length === 0 ? (
            <EmptyState
              title="No performance snapshots"
              description="Performance data is captured from real platform telemetry."
            />
          ) : (
            <div className="data-list">
              {supplementary.performanceSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="data-list-item">
                  <strong>Performance snapshot</strong>
                  <span className="status-pill">{formatHealthStatus(snapshot.healthStatus)}</span>
                  <p>
                    Queue depth: {snapshot.queueDepth}
                    {snapshot.apiP95LatencyMs != null
                      ? ` · API P95 ${snapshot.apiP95LatencyMs}ms`
                      : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'security' ? (
        <Panel
          title="Platform Security Monitoring"
          description="Recommendations from Enterprise Security — no autonomous policy changes"
        >
          {dashboard.productionReadiness ? (
            <p>{dashboard.productionReadiness.summary}</p>
          ) : (
            <EmptyState
              title="No security context"
              description="Security posture integrates with the Enterprise Security platform."
            />
          )}
          <Link href="/enterprise-security">
            <Button variant="secondary">Open Security Platform</Button>
          </Link>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'backups' ? (
        <Panel
          title="Backup Verification"
          description="Backup integrity checks — backups are never deleted automatically"
        >
          {isSupplementaryLoading ? <p>Loading backup verifications...</p> : null}
          {supplementary.backupVerifications.length === 0 ? (
            <EmptyState
              title="No backup verifications"
              description="Record backup verification results after restore testing."
            />
          ) : (
            <div className="data-list">
              {supplementary.backupVerifications.map((item) => (
                <div key={item.id} className="data-list-item">
                  <strong>{item.backupRef}</strong>
                  <span className="status-pill">
                    {formatWorkflowStatus(item.verificationStatus)}
                  </span>
                  <p>
                    {item.verificationPassed == null
                      ? 'Pending verification'
                      : item.verificationPassed
                        ? 'Passed'
                        : 'Failed'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'disaster-recovery' ? (
        <Panel
          title="Disaster Recovery"
          description="Recovery plans and drills from production readiness"
        >
          {dashboard.productionReadiness?.recovery ? (
            <ul className="simple-list">
              <li>Restore test: {dashboard.productionReadiness.recovery.restoreTestStatus}</li>
              <li>
                RPO: {dashboard.productionReadiness.recovery.recoveryPointObjectiveMinutes ?? '—'}{' '}
                min
              </li>
              <li>
                RTO: {dashboard.productionReadiness.recovery.recoveryTimeObjectiveMinutes ?? '—'}{' '}
                min
              </li>
              <li>Latest backup: {dashboard.productionReadiness.recovery.latestBackupAt ?? '—'}</li>
              <li>
                Multi-region:{' '}
                {dashboard.productionReadiness.recovery.multiRegionEnabled ? 'enabled' : 'disabled'}
              </li>
            </ul>
          ) : (
            <EmptyState
              title="No disaster recovery data"
              description="Configure recovery objectives in production operations."
            />
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'technical-debt' ? (
        <Panel
          title="Technical Debt Intelligence"
          description="Improvement plans only — no autonomous refactors"
        >
          {isSupplementaryLoading ? <p>Loading technical debt...</p> : null}
          {supplementary.technicalDebtRecords.length === 0 &&
          supplementary.dependencyRecords.length === 0 ? (
            <EmptyState
              title="No technical debt records"
              description="Track debt items and dependency advisories for planning."
            />
          ) : (
            <>
              <div className="data-list">
                {supplementary.technicalDebtRecords.map((item) => (
                  <div key={item.id} className="data-list-item">
                    <strong>{item.title}</strong>
                    <span className="status-pill">{formatSeverity(item.severity)}</span>
                    <p>
                      {item.category} · {formatWorkflowStatus(item.workflowStatus)}
                    </p>
                  </div>
                ))}
              </div>
              {supplementary.dependencyRecords.length > 0 ? (
                <>
                  <h4>Dependencies</h4>
                  <div className="data-list">
                    {supplementary.dependencyRecords.map((item) => (
                      <div key={item.id} className="data-list-item">
                        <strong>{item.dependencyName}</strong>
                        <span className="status-pill">{formatHealthStatus(item.healthStatus)}</span>
                        <p>
                          {item.dependencyType}
                          {item.version ? ` · ${item.version}` : ''}
                          {item.isCritical ? ' · critical' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'monitoring' ? (
        <Panel
          title="Health Monitors"
          description="Configurable heartbeat intervals across platform modules"
        >
          {dashboard.recentHealthMonitors.length === 0 ? (
            <EmptyState
              title="No health monitors"
              description="Configure monitors to track infrastructure, APIs, and providers."
            />
          ) : (
            <div className="data-list">
              {dashboard.recentHealthMonitors.map((monitor) => (
                <div key={monitor.id} className="data-list-item">
                  <strong>{monitor.name}</strong>
                  <span className="status-pill">{formatHealthStatus(monitor.healthStatus)}</span>
                  <p>
                    {monitor.monitorKey} · {monitor.isActive ? 'active' : 'inactive'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'alerts' ? (
        <Panel
          title="IT Alerts"
          description="Alerts synced from monitoring, incidents, and platform modules"
        >
          {dashboard.recentAlerts.length === 0 ? (
            <EmptyState
              title="No open alerts"
              description="Sync alerts from live platform monitoring signals."
            />
          ) : (
            <div className="data-list">
              {dashboard.recentAlerts.map((alert) => (
                <div key={alert.id} className="data-list-item">
                  <strong>{alert.title}</strong>
                  <span className="status-pill">{formatSeverity(alert.severity)}</span>
                  <p>
                    {alert.alertType}
                    {alert.sourceModule ? ` · ${alert.sourceModule}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'audit' ? (
        <Panel
          title="Audit Trail"
          description="Complete history of IT operations actions and changes"
        >
          {isSupplementaryLoading ? <p>Loading audit logs...</p> : null}
          {supplementary.auditLogs.length === 0 ? (
            <EmptyState
              title="No audit logs"
              description="Audit entries are recorded for every IT operations action."
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
          title="AURA IT Operations Agent"
          description="Diagnosis, drafts, and approved low-risk repairs only — no destructive autonomous actions"
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
              void sendAgentMessage(content, 'it_operations' as import('@titan/shared').AgentKey)
            }
            placeholder="Ask about incidents, health, deployments, self-healing, or platform reliability…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
