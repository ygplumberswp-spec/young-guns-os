import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseProductionReadinessDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureOperationsHealth,
  captureOperationsPerformance,
  createBackupPolicy,
  createMaintenanceAction,
  fetchOperationsDashboard,
  runOperationsReadinessChecks,
  syncOperationsAlerts,
  syncOperationsLogs,
} from '../../lib/operations-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessOperations,
  canManageOperations,
  formatHealthStatus,
  formatModuleKey,
} from '../../features/operations/utils';

type OperationsTab =
  | 'health'
  | 'performance'
  | 'infrastructure'
  | 'ai-providers'
  | 'queues'
  | 'logs'
  | 'backups'
  | 'recovery'
  | 'scaling'
  | 'readiness'
  | 'maintenance'
  | 'assistant';

export function OperationsPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<OperationsTab>('health');
  const [dashboard, setDashboard] = useState<EnterpriseProductionReadinessDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    agentMessages,
    pendingTasks,
    isSending,
    error: assistantError,
    sendAgentMessage,
    updateTask,
  } = useAuraChat();

  const canView = useMemo(() => (user ? canAccessOperations(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageOperations(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchOperationsDashboard(accessToken);
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
            err instanceof ApiClientError ? err.message : 'Unable to load operations dashboard',
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

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    if (!accessToken) return;
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
      <div className="automation-page">
        <PageHeader
          title="Operations"
          description="You do not have permission to view production operations."
        />
      </div>
    );
  }

  const tabs: Array<{ id: OperationsTab; label: string }> = [
    { id: 'health', label: 'System Health' },
    { id: 'performance', label: 'Performance' },
    { id: 'infrastructure', label: 'Infrastructure' },
    { id: 'ai-providers', label: 'AI Providers' },
    { id: 'queues', label: 'Queues & Workers' },
    { id: 'logs', label: 'Logs' },
    { id: 'backups', label: 'Backups' },
    { id: 'recovery', label: 'Recovery' },
    { id: 'scaling', label: 'Scaling' },
    { id: 'readiness', label: 'Readiness Checks' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Operations"
        description="Enterprise production readiness — real health, performance, disaster recovery, and operational monitoring. No demo data."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => captureOperationsHealth(accessToken!),
                    'Health snapshots captured.',
                  )
                }
              >
                Capture Health
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => syncOperationsAlerts(accessToken!),
                    'Mission Control alerts synced.',
                  )
                }
              >
                Sync Alerts
              </Button>
            </div>
          ) : undefined
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

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

      {isLoading ? (
        <Panel title="Loading">Loading operations dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Operations dashboard is unavailable." />
      ) : (
        <>
          <Panel title="Operations Summary">
            <p>{dashboard.summary}</p>
            <span
              className={`status-pill ${dashboard.overallHealthStatus === 'healthy' ? 'status-healthy' : ''}`}
            >
              Overall: {formatHealthStatus(dashboard.overallHealthStatus)}
            </span>
            {dashboard.isPlatformOwner ? (
              <span className="status-pill status-healthy">
                Platform Owner — global operational visibility
              </span>
            ) : null}
          </Panel>

          {activeTab === 'health' ? (
            <Panel title="Service Module Health">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(() => captureOperationsHealth(accessToken!), 'Health captured.')
                  }
                >
                  Refresh Health
                </Button>
              ) : null}
              <div className="data-list">
                {dashboard.systemHealth.map((module) => (
                  <div key={module.moduleKey} className="data-list-item">
                    <strong>{formatModuleKey(module.moduleKey)}</strong>
                    <span className="status-pill">{formatHealthStatus(module.status)}</span>
                    {module.availabilityPercent != null ? (
                      <p>Availability: {module.availabilityPercent}%</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {activeTab === 'performance' ? (
            <Panel title="Performance Monitoring">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => captureOperationsPerformance(accessToken!),
                      'Performance snapshot captured.',
                    )
                  }
                >
                  Capture Performance
                </Button>
              ) : null}
              {dashboard.performance ? (
                <div className="stat-grid">
                  <StatCard label="Queue Depth" value={String(dashboard.performance.queueDepth)} />
                  <StatCard
                    label="Failed Jobs"
                    value={String(dashboard.performance.backgroundJobFailureCount)}
                  />
                  <StatCard
                    label="Memory (MB)"
                    value={String(dashboard.performance.memoryUsageMb ?? '—')}
                  />
                  <StatCard
                    label="AI Latency (ms)"
                    value={String(dashboard.performance.aiProviderLatencyMs ?? '—')}
                  />
                </div>
              ) : (
                <EmptyState
                  title="No performance snapshot"
                  description="Capture a performance snapshot to record real metrics."
                />
              )}
            </Panel>
          ) : null}

          {activeTab === 'infrastructure' ? (
            <Panel title="High Availability">
              <div className="stat-grid">
                <StatCard
                  label="Read Replica Ready"
                  value={dashboard.platformConfig.readReplicaEnabled ? 'Enabled' : 'Not configured'}
                />
                <StatCard
                  label="Multi-Region Ready"
                  value={dashboard.scaling.multiRegionReady ? 'Ready' : 'Not configured'}
                />
                <StatCard
                  label="Multi-Region Active"
                  value={dashboard.scaling.multiRegionActive ? 'Active' : 'Not active'}
                />
                <StatCard
                  label="DB Pool Max"
                  value={String(dashboard.scaling.dbPoolMaxConnections)}
                />
              </div>
              <p>
                Stateless API, distributed workers, readiness/liveness probes, and rolling
                deployments are supported via existing platform architecture.
              </p>
            </Panel>
          ) : null}

          {activeTab === 'ai-providers' ? (
            <Panel title="Multi-AI Provider Operations">
              {dashboard.aiProviders.length === 0 ? (
                <EmptyState
                  title="No configured providers"
                  description="Configure AI providers in AI Orchestration."
                />
              ) : (
                <div className="data-list">
                  {dashboard.aiProviders.map((provider) => (
                    <div
                      key={`${provider.providerKey}-${provider.providerId ?? 'env'}`}
                      className="data-list-item"
                    >
                      <strong>{provider.displayName}</strong>
                      <span className="status-pill">{provider.healthStatus}</span>
                      <p>
                        Latency: {provider.averageLatencyMs ?? '—'} ms · Failovers:{' '}
                        {provider.failoverCount} · Queue: {provider.queueDepth}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'queues' ? (
            <Panel title="Queues & Workers">
              <div className="stat-grid">
                <StatCard
                  label="Queue Depth"
                  value={String(dashboard.performance?.queueDepth ?? 0)}
                />
                <StatCard
                  label="Worker Throughput"
                  value={String(dashboard.performance?.workerThroughputPerMinute ?? '—')}
                />
                <StatCard
                  label="Background Failures"
                  value={String(dashboard.performance?.backgroundJobFailureCount ?? 0)}
                />
                <StatCard
                  label="AI Queue Concurrency"
                  value={String(dashboard.scaling.aiRequestQueueConcurrency)}
                />
              </div>
            </Panel>
          ) : null}

          {activeTab === 'logs' ? (
            <Panel title="Operational Logs">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => syncOperationsLogs(accessToken!),
                      'Logs indexed from real events.',
                    )
                  }
                >
                  Sync Logs
                </Button>
              ) : null}
              {dashboard.recentLogs.length === 0 ? (
                <EmptyState
                  title="No log entries"
                  description="Sync logs to index failover events and workflow failures."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recentLogs.map((log) => (
                    <div key={log.id} className="data-list-item">
                      <strong>{log.moduleKey}</strong>
                      <span className="status-pill">{log.severity}</span>
                      <p>{log.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'backups' ? (
            <>
              <Panel title="Backup Policies">
                {canWrite ? (
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() =>
                      void runAction(
                        () =>
                          createBackupPolicy(accessToken!, {
                            policyKey: `policy_${Date.now()}`,
                            name: 'Tenant Backup Policy',
                          }),
                        'Backup policy created (disabled until enabled).',
                      )
                    }
                  >
                    Create Backup Policy
                  </Button>
                ) : null}
                {dashboard.backupPolicies.length === 0 ? (
                  <EmptyState
                    title="No backup policies"
                    description="Create backup policies — no demo backups are seeded."
                  />
                ) : (
                  <div className="data-list">
                    {dashboard.backupPolicies.map((policy) => (
                      <div key={policy.id} className="data-list-item">
                        <strong>{policy.name}</strong>
                        <span className="status-pill">
                          {policy.isEnabled ? 'enabled' : 'disabled'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'recovery' ? (
            <>
              <Panel title="Recovery Objectives">
                <div className="stat-grid">
                  <StatCard
                    label="RPO (minutes)"
                    value={String(dashboard.platformConfig.recoveryPointObjectiveMinutes ?? '—')}
                  />
                  <StatCard
                    label="RTO (minutes)"
                    value={String(dashboard.platformConfig.recoveryTimeObjectiveMinutes ?? '—')}
                  />
                  <StatCard
                    label="Backup Retention"
                    value={`${dashboard.platformConfig.backupRetentionDays} days`}
                  />
                  <StatCard
                    label="Recovery Readiness"
                    value={dashboard.recovery.restoreTestStatus}
                  />
                </div>
              </Panel>
              <Panel title="Recovery Readiness">
                <p>Latest backup: {dashboard.recovery.latestBackupAt ?? 'None recorded'}</p>
                <p>Restore test: {dashboard.recovery.restoreTestStatus}</p>
                <p>
                  Freshness:{' '}
                  {dashboard.recovery.backupFreshnessHours != null
                    ? `${dashboard.recovery.backupFreshnessHours}h ago`
                    : '—'}
                </p>
                {dashboard.recentBackupRuns.length === 0 ? (
                  <EmptyState
                    title="No backup runs"
                    description="Backup runs appear here after policies are enabled and executed."
                  />
                ) : (
                  <div className="data-list">
                    {dashboard.recentBackupRuns.map((run) => (
                      <div key={run.id} className="data-list-item">
                        <strong>{run.id}</strong>
                        <span className="status-pill">{run.status}</span>
                        {run.errorMessage ? <p>{run.errorMessage}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {activeTab === 'scaling' ? (
            <Panel title="Scalability Framework">
              <div className="stat-grid">
                <StatCard
                  label="API Scaling"
                  value={dashboard.scaling.horizontalApiScalingEnabled ? 'Enabled' : 'Disabled'}
                />
                <StatCard
                  label="Worker Scaling"
                  value={dashboard.scaling.horizontalWorkerScalingEnabled ? 'Enabled' : 'Disabled'}
                />
                <StatCard
                  label="Queue Concurrency"
                  value={String(dashboard.scaling.queueConcurrencyLimit)}
                />
                <StatCard
                  label="Queue Partitions"
                  value={String(dashboard.scaling.queuePartitionCount)}
                />
                <StatCard
                  label="DB Pool Max"
                  value={String(dashboard.scaling.dbPoolMaxConnections)}
                />
                <StatCard
                  label="AI Queue Concurrency"
                  value={String(dashboard.scaling.aiRequestQueueConcurrency)}
                />
                <StatCard
                  label="Search Index Shards"
                  value={String(dashboard.scaling.searchIndexShards)}
                />
                <StatCard
                  label="Webhook Concurrency"
                  value={String(dashboard.scaling.webhookConcurrency)}
                />
              </div>
            </Panel>
          ) : null}

          {activeTab === 'readiness' ? (
            <Panel title="Operational Readiness Checks">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => runOperationsReadinessChecks(accessToken!),
                      'Readiness checks executed.',
                    )
                  }
                >
                  Run Readiness Checks
                </Button>
              ) : null}
              {!dashboard.latestReadinessRun ? (
                <EmptyState
                  title="No readiness run"
                  description="Run readiness checks to evaluate production configuration."
                />
              ) : (
                <>
                  <p>
                    Overall: {formatHealthStatus(dashboard.latestReadinessRun.overallStatus)} —{' '}
                    {dashboard.latestReadinessRun.readyCount} ready,{' '}
                    {dashboard.latestReadinessRun.warningCount} warning,{' '}
                    {dashboard.latestReadinessRun.criticalCount} critical
                  </p>
                  <div className="data-list">
                    {dashboard.latestReadinessRun.checks.map((check) => (
                      <div key={check.id} className="data-list-item">
                        <strong>{check.title}</strong>
                        <span className="status-pill">{formatHealthStatus(check.status)}</span>
                        <p>{check.description}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          ) : null}

          {activeTab === 'maintenance' ? (
            <Panel title="Maintenance Management">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        createMaintenanceAction(accessToken!, {
                          actionType: 'maintenance_plan',
                          subject: 'Planned maintenance',
                          recommendation: 'Draft maintenance action pending approval.',
                        }),
                      'Maintenance action submitted for approval.',
                    )
                  }
                >
                  Draft Maintenance Action
                </Button>
              ) : null}
              {dashboard.maintenanceActions.length === 0 ? (
                <EmptyState
                  title="No maintenance actions"
                  description="Maintenance follows Draft → Approval → Execution."
                />
              ) : (
                <div className="data-list">
                  {dashboard.maintenanceActions.map((action) => (
                    <div key={action.id} className="data-list-item">
                      <strong>{action.subject}</strong>
                      <span className="status-pill">{action.status}</span>
                      <p>{action.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Production Operations Agent">
              <p>
                Ask about platform health, performance, AI provider resilience, readiness risks,
                recovery, and maintenance. Recommendations only.
              </p>
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
                onSend={(content) => void sendAgentMessage(content, 'production_operations')}
                placeholder="Ask about health, performance, AI providers, backups, or readiness…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
