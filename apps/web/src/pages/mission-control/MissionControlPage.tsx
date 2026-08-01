import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel, StatCard, TabNav } from '@titan/ui';
import { NAV_LABELS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  acknowledgeMissionControlAlert,
  captureMissionControlOperationsMap,
  fetchMissionControlModuleSnapshots,
  fetchMissionControlSummary,
  refreshMissionControlDepartmentHealth,
  syncMissionControlAlerts,
  syncMissionControlTimeline,
} from '../../lib/mission-control-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { SimpleAdvancedToggle } from '../../components/SimpleAdvancedToggle';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';
import { DayPlanningPanel } from '../../features/aura/DayPlanningPanel';
import { canWriteCompanyMemory } from '@titan/auth/browser';
import {
  canAccessMissionControl,
  canManageMissionControl,
  formatModuleName,
  formatSeverity,
  formatStatus,
} from '../../features/mission-control/utils';

type MissionControlTab =
  'dashboard' | 'alerts' | 'incidents' | 'timeline' | 'operations-map' | 'recommendations';

export function MissionControlPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<MissionControlTab>('dashboard');
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [moreSystemsOpen, setMoreSystemsOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessMissionControl(user.permissions) : false), [user]);
  const canWrite = useMemo(
    () => (user ? canManageMissionControl(user.permissions) : false),
    [user],
  );
  const canWriteDayPlan = useMemo(
    () =>
      user
        ? canWriteCompanyMemory({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  const {
    data: summary,
    error: summaryError,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useStaffCachedQuery({
    queryKey: 'mission-control/summary',
    enabled: canView,
    fetcher: async () => fetchMissionControlSummary(accessToken!),
  });

  const {
    data: moduleSnapshots,
    error: modulesError,
    isLoading: modulesLoading,
    refetch: refetchModules,
  } = useStaffCachedQuery({
    queryKey: 'mission-control/modules',
    enabled: canView,
    staleTimeMs: 45_000,
    fetcher: async () => fetchMissionControlModuleSnapshots(accessToken!),
  });

  const dashboard = summary
    ? {
        ...summary,
        moduleSnapshots: moduleSnapshots ?? [],
      }
    : null;
  const loadError = summaryError ?? modulesError;
  const isLoading = summaryLoading && !summary;

  useEffect(() => {
    if (loadError) {
      setError(loadError);
    }
  }, [loadError]);

  async function loadDashboard() {
    await Promise.all([refetchSummary(), refetchModules()]);
  }

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
      <div className="automation-page">
        <PageHeader
          title={NAV_LABELS.companyHealth}
          description="You do not have permission to view company health."
        />
      </div>
    );
  }

  const tabs: Array<{ id: MissionControlTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'alerts', label: 'Alert Center' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'timeline', label: 'Operations Timeline' },
    { id: 'operations-map', label: 'Live Operations Map' },
    { id: 'recommendations', label: 'AI Recommendations' },
  ];

  const priorityModules = new Set([
    'jobs',
    'operations',
    'finance',
    'customers',
    'sales',
    'fleet',
    'integrations',
    'security',
    'aura',
  ]);

  const moreSystemModules = new Set([
    'knowledge_graph',
    'digital_twin',
    'developer_platform',
    'data_migration',
    'release_management',
    'production_launch',
    'industry_packs',
    'saas_management',
    'business_continuity',
    'app_builder',
  ]);

  const visibleSnapshots = dashboard?.moduleSnapshots.filter((snapshot) => {
    if (viewMode === 'advanced') {
      return true;
    }
    if (priorityModules.has(snapshot.module)) {
      return true;
    }
    if (moreSystemModules.has(snapshot.module)) {
      return (
        moreSystemsOpen ||
        snapshot.status === 'critical' ||
        snapshot.status === 'warning' ||
        snapshot.status === 'attention_required'
      );
    }
    return snapshot.status === 'critical' || snapshot.status === 'attention_required';
  });

  return (
    <div className="automation-page page-shell">
      <PageHeader
        title={NAV_LABELS.companyHealth}
        description="Business overview, today’s operational priorities, and critical actions."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <SimpleAdvancedToggle
                mode={viewMode}
                onChange={setViewMode}
                canAccessAdvanced={canWrite}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={isWorking}
                onClick={() =>
                  void runAction(
                    () => syncMissionControlAlerts(accessToken!),
                    'Alerts synced from live module data.',
                  )
                }
              >
                Refresh alerts
              </Button>
            </div>
          ) : undefined
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <TabNav
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as MissionControlTab)}
        ariaLabel="Mission control sections"
      />

      {isLoading ? (
        <LoadingState label="Loading mission control summary…" />
      ) : !dashboard ? (
        <EmptyState title="No data" description="Mission control dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'dashboard' ? (
            <>
              <div className="stat-grid">
                {dashboard.businessHealthScore != null ? (
                  <StatCard label="Business Health" value={String(dashboard.businessHealthScore)} />
                ) : null}
                <StatCard label="Pending Alerts" value={String(dashboard.pendingAlertCount)} />
                <StatCard label="Critical Alerts" value={String(dashboard.criticalAlertCount)} />
                <StatCard label="Active Incidents" value={String(dashboard.activeIncidentCount)} />
                <StatCard label="Pending Actions" value={String(dashboard.pendingActionCount)} />
              </div>

              {accessToken ? (
                <Panel title="Today's plan">
                  <DayPlanningPanel accessToken={accessToken} canWrite={canWriteDayPlan} />
                </Panel>
              ) : null}

              <Panel title="Business overview">
                <p>{dashboard.summary}</p>
              </Panel>

              <Panel title="Systems">
                <AnalyticsTabPanel
                  isLoading={modulesLoading && moduleSnapshots === undefined}
                  error={modulesError}
                  hasData={moduleSnapshots !== undefined}
                  isEmpty={moduleSnapshots !== undefined && (visibleSnapshots?.length ?? 0) === 0}
                  emptyTitle="No systems to show"
                  emptyDescription="No module snapshots available."
                  loadingLabel="Loading module systems…"
                  onRetry={() => void refetchModules()}
                >
                  {visibleSnapshots && visibleSnapshots.length > 0 ? (
                    <div className="data-list">
                      {visibleSnapshots.map((snapshot) => {
                        const manageHref =
                          typeof snapshot.metrics.manageHref === 'string'
                            ? snapshot.metrics.manageHref
                            : null;

                        return (
                          <div key={snapshot.module} className="data-list-item">
                            <strong>{formatModuleName(snapshot.module)}</strong>
                            <span className={`status-pill status-pill--${snapshot.status}`}>
                              {formatStatus(snapshot.status)}
                            </span>
                            <p>{snapshot.summary}</p>
                            {manageHref ? (
                              <Link href={manageHref}>
                                <Button variant="secondary" size="sm">
                                  Manage capability
                                </Button>
                              </Link>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </AnalyticsTabPanel>
                {viewMode === 'simple' ? (
                  <div className="panel-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setMoreSystemsOpen((open) => !open)}
                    >
                      {moreSystemsOpen ? 'Hide more systems' : 'Show more systems'}
                    </Button>
                  </div>
                ) : null}
              </Panel>

              {viewMode === 'advanced' ? (
                <Panel title="Department Health">
                  {dashboard.departmentHealth.length === 0 ? (
                    <EmptyState
                      title="No department health"
                      description="Refresh department health from module data."
                    />
                  ) : (
                    <div className="data-list">
                      {dashboard.departmentHealth.map((dept) => (
                        <div key={dept.id} className="data-list-item">
                          <strong>{formatModuleName(dept.departmentKey)}</strong>
                          <span className={`status-pill status-pill--${dept.status}`}>
                            {formatStatus(dept.status)}
                          </span>
                          <span className="page-muted">
                            {dept.healthScore != null ? `${dept.healthScore}/100` : 'Not assessed'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {canWrite ? (
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() =>
                        void runAction(
                          () => refreshMissionControlDepartmentHealth(accessToken!),
                          'Department health refreshed from live module data.',
                        )
                      }
                    >
                      Refresh Department Health
                    </Button>
                  ) : null}
                </Panel>
              ) : null}
            </>
          ) : null}

          {activeTab === 'alerts' ? (
            <Panel title="Enterprise Alert Center">
              {dashboard.recentAlerts.length === 0 ? (
                <EmptyState
                  title="No alerts"
                  description="Sync alerts from executive, automation, integration, and digital twin modules."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recentAlerts.map((alert) => (
                    <div key={alert.id} className="data-list-item">
                      <strong>{alert.title}</strong>
                      <span className={`status-pill severity-${alert.severity}`}>
                        {formatSeverity(alert.severity)}
                      </span>
                      <span className="status-pill">{formatStatus(alert.status)}</span>
                      <p>{alert.description}</p>
                      {canWrite && alert.status === 'pending' ? (
                        <Button
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(async () => {
                              await acknowledgeMissionControlAlert(accessToken!, alert.id);
                            }, 'Alert acknowledged.')
                          }
                        >
                          Acknowledge
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'incidents' ? (
            <Panel title="Incident Management">
              {dashboard.activeIncidents.length === 0 ? (
                <EmptyState
                  title="No active incidents"
                  description="Incidents are tracked when created by your team — no demo incidents are generated."
                />
              ) : (
                <div className="data-list">
                  {dashboard.activeIncidents.map((incident) => (
                    <div key={incident.id} className="data-list-item">
                      <strong>{incident.title}</strong>
                      <span className={`status-pill severity-${incident.severity}`}>
                        {formatSeverity(incident.severity)}
                      </span>
                      <span className="status-pill">{formatStatus(incident.status)}</span>
                      <p>{incident.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'timeline' ? (
            <Panel title="Operational Timeline">
              {canWrite ? (
                <div className="panel-actions">
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() =>
                      void runAction(
                        () => syncMissionControlTimeline(accessToken!),
                        'Timeline synced from live module events.',
                      )
                    }
                  >
                    Sync Timeline
                  </Button>
                </div>
              ) : null}
              {dashboard.timelineEvents.length === 0 ? (
                <EmptyState
                  title="No events"
                  description="Sync the cross-module event stream from live data."
                />
              ) : (
                <div className="data-list">
                  {dashboard.timelineEvents.map((event) => (
                    <div key={event.id} className="data-list-item">
                      <strong>{event.title}</strong>
                      <span className="status-pill">{formatStatus(event.eventType)}</span>
                      {event.sourceModule ? <span>{event.sourceModule}</span> : null}
                      {event.description ? <p>{event.description}</p> : null}
                      <small>{new Date(event.eventAt).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'operations-map' ? (
            <Panel title="Live Operations Map">
              {canWrite ? (
                <div className="panel-actions">
                  <Button
                    variant="secondary"
                    disabled={isWorking}
                    onClick={() =>
                      void runAction(
                        () => captureMissionControlOperationsMap(accessToken!),
                        'Operations map captured from fleet GPS and active jobs.',
                      )
                    }
                  >
                    Capture Map
                  </Button>
                </div>
              ) : null}
              {dashboard.operationsMap.length === 0 ? (
                <EmptyState
                  title="No map points"
                  description="Capture fleet positions and active jobs from real GPS and job records."
                />
              ) : (
                <div className="data-list">
                  {dashboard.operationsMap.map((point) => (
                    <div key={point.id} className="data-list-item">
                      <strong>{point.label}</strong>
                      <span className="status-pill">{formatModuleName(point.mapType)}</span>
                      {point.latitude != null && point.longitude != null ? (
                        <span>
                          {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                        </span>
                      ) : (
                        <span>No coordinates</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'recommendations' ? (
            <Panel title="AI Executive Intelligence">
              {dashboard.recommendations.length === 0 ? (
                <EmptyState
                  title="No recommendations"
                  description="Generate recommendations from real alert, incident, and health signals."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recommendations.map((rec) => (
                    <div key={rec.id} className="data-list-item">
                      <strong>{rec.title}</strong>
                      <span className="status-pill">{formatSeverity(rec.priority)}</span>
                      <span className="status-pill">{formatStatus(rec.status)}</span>
                      <p>{rec.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
