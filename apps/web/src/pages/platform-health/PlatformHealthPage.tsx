import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Button, EmptyState, GroupedTabNav, LoadingState, Panel, StatCard } from '@titan/ui';
import type { EnterprisePlatformHealthDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureCapacitySnapshot,
  captureHealthSnapshot,
  capturePlatformHealthAnalytics,
  createPlatformHealthIncident,
  fetchPlatformHealthAuditLogs,
  fetchPlatformHealthDashboard,
  generatePerformanceInsights,
  resolvePlatformHealthIncident,
  runDiagnostics,
  syncPlatformHealthAlerts,
} from '../../lib/enterprise-platform-health-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessPlatformHealth,
  canAdministerPlatformHealth,
  canManagePlatformHealth,
  formatHealthStatus,
  formatSeverity,
} from '../../features/platform-health/utils';
import { SettingsNav } from '../../features/settings/SettingsNav';
import { PlatformTechnicalSystemsPanel } from '../../features/platform-health/PlatformTechnicalSystemsPanel';
import { fetchMissionControlModuleSnapshots } from '../../lib/mission-control-api-client';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';

type PlatformHealthTab =
  | 'overview'
  | 'platform_systems'
  | 'services'
  | 'diagnostics'
  | 'performance'
  | 'capacity'
  | 'incidents'
  | 'integrations'
  | 'background_jobs'
  | 'analytics'
  | 'audit'
  | 'settings'
  | 'assistant';

export function PlatformHealthPage() {
  const { accessToken, user } = useAuth();
  const [location] = useLocation();
  const isSettingsRoute = location.startsWith('/settings/advanced/platform-health');
  const [activeTab, setActiveTab] = useState<PlatformHealthTab>('overview');
  const [dashboard, setDashboard] = useState<EnterprisePlatformHealthDashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<
    Awaited<ReturnType<typeof fetchPlatformHealthAuditLogs>>
  >([]);
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

  const canView = useMemo(() => (user ? canAccessPlatformHealth(user.permissions) : false), [user]);
  const canWrite = useMemo(
    () => (user ? canManagePlatformHealth(user.permissions) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canAdministerPlatformHealth(user.permissions) : false),
    [user],
  );

  const {
    data: moduleSnapshots,
    error: modulesError,
    isLoading: modulesLoading,
    refetch: refetchModules,
  } = useStaffCachedQuery({
    queryKey: 'platform-health/mission-control-modules',
    enabled: canView && activeTab === 'platform_systems',
    staleTimeMs: 45_000,
    fetcher: async () => fetchMissionControlModuleSnapshots(accessToken!),
  });

  const tabs: Array<{ id: PlatformHealthTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'platform_systems', label: 'Platform Systems' },
    { id: 'services', label: 'Services' },
    { id: 'diagnostics', label: 'Diagnostics' },
    { id: 'performance', label: 'Performance' },
    { id: 'capacity', label: 'Capacity' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'background_jobs', label: 'Background Jobs' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'audit', label: 'Audit' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  const tabGroups = [
    {
      id: 'overview',
      label: 'Overview',
      tabs: tabs.filter((t) => ['overview', 'platform_systems', 'services'].includes(t.id)),
    },
    {
      id: 'operations',
      label: 'Operations',
      tabs: tabs.filter((t) =>
        ['diagnostics', 'performance', 'capacity', 'background_jobs'].includes(t.id),
      ),
    },
    {
      id: 'issues',
      label: 'Issues',
      tabs: tabs.filter((t) => ['incidents', 'integrations'].includes(t.id)),
    },
    {
      id: 'administration',
      label: 'Administration',
      tabs: tabs.filter((t) => ['analytics', 'audit', 'settings', 'assistant'].includes(t.id)),
    },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    setDashboard(await fetchPlatformHealthDashboard(accessToken));
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
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load platform health dashboard',
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
        const logs = await fetchPlatformHealthAuditLogs(accessToken!);
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
          description="You do not have permission to view platform health."
        />
      </div>
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div className={`page-shell settings-page ${isSettingsRoute ? '' : 'p-6'}`.trim()}>
        {isSettingsRoute ? <SettingsNav /> : null}
        <PageHeader title="Platform Health" description="Loading platform health center..." />
      </div>
    );
  }

  const health = dashboard.platformHealth;

  return (
    <div className={`page-shell settings-page ${isSettingsRoute ? '' : 'space-y-6 p-6'}`.trim()}>
      <PageHeader
        title="Platform Health"
        description={
          isSettingsRoute
            ? 'Advanced platform diagnostics, deployment health, and technical operations — for platform owners.'
            : 'Unified platform health center — monitoring, diagnostics, performance intelligence, and incident management.'
        }
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => captureHealthSnapshot(accessToken!),
                    'Health snapshot captured.',
                  )
                }
              >
                Capture Health
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => runDiagnostics(accessToken!), 'Diagnostics completed.')
                }
              >
                Run Diagnostics
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => syncPlatformHealthAlerts(accessToken!), 'Alerts synced.')
                }
              >
                Sync Alerts
              </Button>
            </div>
          ) : null
        }
      />

      {isSettingsRoute ? <SettingsNav /> : null}

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <GroupedTabNav
        groups={tabGroups}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as PlatformHealthTab)}
        ariaLabel="Platform health sections"
      />

      {isLoading ? <LoadingState label="Loading platform health" /> : null}

      {!isLoading && activeTab === 'overview' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Health Score"
              value={
                health.overallHealthScore != null
                  ? String(health.overallHealthScore)
                  : 'Not assessed'
              }
            />
            <StatCard
              label="Status"
              value={formatHealthStatus(dashboard.overallPlatformHealthStatus)}
            />
            <StatCard label="Open Incidents" value={String(dashboard.incidents.length)} />
            <StatCard label="Platform Alerts" value={String(dashboard.openAlertCount)} />
          </div>
          <Panel title="Summary">{dashboard.summary}</Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'platform_systems' ? (
        <PlatformTechnicalSystemsPanel
          snapshots={moduleSnapshots ?? []}
          isLoading={modulesLoading && moduleSnapshots === undefined}
          error={modulesError}
          onRetry={() => void refetchModules()}
        />
      ) : null}

      {!isLoading && activeTab === 'services' ? (
        <Panel title="Service Health">
          {dashboard.serviceHealth.length === 0 ? (
            <EmptyState
              title="No service metrics"
              description="Capture a health snapshot to record service metrics from production readiness monitoring."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboard.serviceHealth.map((service) => (
                <li key={service.moduleKey} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{service.moduleName}</p>
                    <p className="text-sm text-slate-500">{service.moduleKey}</p>
                  </div>
                  <span className="text-sm">{formatHealthStatus(service.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'diagnostics' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(() => runDiagnostics(accessToken!), 'Diagnostics run completed.')
              }
            >
              Run Diagnostics
            </Button>
          ) : null}
          <Panel title="Diagnostic Runs">
            {dashboard.diagnosticRuns.length === 0 ? (
              <EmptyState
                title="No diagnostic runs"
                description="Run read-only diagnostic tests for database, API, auth, providers, and scheduler health."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.diagnosticRuns.map((run) => (
                  <li key={run.id} className="py-3">
                    <p className="font-medium">{run.runKey}</p>
                    <p className="text-sm text-slate-500">
                      {formatHealthStatus(run.status)} · {run.passedCount}/{run.testCount} passed ·{' '}
                      {run.failedCount} failed
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {dashboard.latestDiagnosticResults.length > 0 ? (
            <Panel title="Latest Results">
              <ul className="divide-y divide-slate-100">
                {dashboard.latestDiagnosticResults.map((result) => (
                  <li key={result.id} className="py-2 text-sm">
                    <span className="font-medium">{result.testName}</span> —{' '}
                    {formatHealthStatus(result.status)}
                    {result.message ? `: ${result.message}` : ''}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {!isLoading && activeTab === 'performance' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => generatePerformanceInsights(accessToken!),
                  'Performance insights generated.',
                )
              }
            >
              Generate Insights
            </Button>
          ) : null}
          <Panel title="Performance Insights">
            {dashboard.performanceInsights.length === 0 ? (
              <EmptyState
                title="No performance insights"
                description="Generate insights from real API latency, queue depth, and provider metrics."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.performanceInsights.map((insight) => (
                  <li key={insight.id} className="py-3">
                    <p className="font-medium">{insight.title}</p>
                    <p className="text-sm text-slate-500">{insight.description}</p>
                    {insight.recommendation ? (
                      <p className="mt-1 text-xs text-slate-400">{insight.recommendation}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'capacity' ? (
        <div className="space-y-4">
          {canWrite ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => captureCapacitySnapshot(accessToken!),
                  'Capacity snapshot captured.',
                )
              }
            >
              Capture Capacity
            </Button>
          ) : null}
          <Panel title="Capacity">
            {dashboard.latestCapacitySnapshot ? (
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-slate-500">AI usage (24h)</dt>
                  <dd className="font-medium">{dashboard.latestCapacitySnapshot.aiUsageCount}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">API requests (24h)</dt>
                  <dd className="font-medium">
                    {dashboard.latestCapacitySnapshot.apiRequestCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Active users</dt>
                  <dd className="font-medium">
                    {dashboard.latestCapacitySnapshot.activeUserCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Background job load</dt>
                  <dd className="font-medium">
                    {dashboard.latestCapacitySnapshot.backgroundJobLoad}
                  </dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-slate-500">Forecast trend</dt>
                  <dd className="font-medium">
                    {String(dashboard.latestCapacitySnapshot.forecast.trend ?? 'unknown')}
                  </dd>
                </div>
              </dl>
            ) : (
              <EmptyState
                title="No capacity data"
                description="Capture capacity metrics from real usage records and queue load."
              />
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'incidents' ? (
        <div className="space-y-4">
          {canManage ? (
            <Button
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () =>
                    createPlatformHealthIncident(accessToken!, {
                      title: 'Platform health incident',
                      severity: 'medium',
                      description: 'Investigation required',
                    }),
                  'Incident created.',
                )
              }
            >
              Create Incident
            </Button>
          ) : null}
          <Panel title="Incidents">
            {dashboard.incidents.length === 0 ? (
              <EmptyState
                title="No open incidents"
                description="Incidents are tracked via IT Operations — never auto-closed."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.incidents.map((incident) => (
                  <li key={incident.id} className="flex items-start justify-between gap-4 py-3">
                    <div>
                      <p className="font-medium">{incident.title}</p>
                      <p className="text-sm text-slate-500">
                        {formatSeverity(incident.severity)} · {formatHealthStatus(incident.status)}
                      </p>
                    </div>
                    {canWrite && incident.status !== 'resolved' && incident.status !== 'closed' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isWorking}
                        onClick={() =>
                          void runAction(
                            () => resolvePlatformHealthIncident(accessToken!, incident.id),
                            'Incident resolved.',
                          )
                        }
                      >
                        Resolve
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && activeTab === 'integrations' ? (
        <Panel title="Integration Health">
          {dashboard.integrations.length === 0 ? (
            <EmptyState
              title="No integrations"
              description="Connector health from Universal Connector Platform."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboard.integrations.map((integration) => (
                <li key={integration.key} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{integration.key}</p>
                    <p className="text-sm text-slate-500">
                      {integration.provider ?? 'Unknown provider'}
                    </p>
                  </div>
                  <span className="text-sm">{formatHealthStatus(integration.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'background_jobs' ? (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Queue Depth" value={String(dashboard.backgroundJobs.queueDepth)} />
          <StatCard label="Failed Jobs" value={String(dashboard.backgroundJobs.failedCount)} />
          <StatCard label="Pending Jobs" value={String(dashboard.backgroundJobs.pendingCount)} />
        </div>
      ) : null}

      {!isLoading && activeTab === 'analytics' ? (
        <Panel title="Analytics">
          {dashboard.analytics ? (
            <pre className="overflow-auto rounded bg-slate-50 p-4 text-xs">
              {JSON.stringify(dashboard.analytics.metrics, null, 2)}
            </pre>
          ) : (
            <EmptyState
              title="No analytics captured"
              description="Capture analytics to track platform health trends."
            />
          )}
          {canWrite ? (
            <Button
              className="mt-4"
              variant="secondary"
              disabled={isWorking}
              onClick={() =>
                void runAction(
                  () => capturePlatformHealthAnalytics(accessToken!),
                  'Analytics captured.',
                )
              }
            >
              Capture Analytics
            </Button>
          ) : null}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'audit' ? (
        <Panel title="Audit Log">
          {isSupplementaryLoading ? (
            <p className="text-sm text-slate-500">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <EmptyState
              title="No audit entries"
              description="All platform health actions are logged for auditability."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <li key={log.id} className="py-2 text-sm">
                  <span className="font-medium">{log.actionType}</span>
                  {log.entityType ? ` · ${log.entityType}` : ''}
                  <span className="text-slate-400">
                    {' '}
                    · {new Date(log.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'settings' ? (
        <Panel title="Platform Settings">
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Audit retention</dt>
              <dd className="font-medium">{dashboard.platformConfig.auditRetentionDays} days</dd>
            </div>
            <div>
              <dt className="text-slate-500">Diagnostics</dt>
              <dd className="font-medium">
                {(dashboard.platformConfig.diagnosticsPolicy as { readOnly?: boolean }).readOnly
                  ? 'Read-only'
                  : 'Configured'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Auto-close incidents</dt>
              <dd className="font-medium">
                {(dashboard.platformConfig.incidentPolicy as { autoClose?: boolean }).autoClose
                  ? 'Enabled'
                  : 'Disabled'}
              </dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'assistant' ? (
        <Panel title="AURA Platform Health Agent">
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
              void sendAgentMessage(content, 'platform_health' as import('@titan/shared').AgentKey)
            }
          />
          {assistantError ? <p className="mt-2 text-sm text-red-600">{assistantError}</p> : null}
        </Panel>
      ) : null}
    </div>
  );
}
