import { PageHeader, SummaryCardGrid } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, LoadingState, Panel, StatCard, TabNav } from '@titan/ui';
import { NAV_LABELS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  acknowledgeMissionControlAlert,
  fetchMissionControlModuleSnapshots,
  fetchMissionControlSummary,
  refreshMissionControlDepartmentHealth,
  syncMissionControlAlerts,
} from '../../lib/mission-control-api-client';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { SimpleAdvancedToggle } from '../../components/SimpleAdvancedToggle';
import { CompanyHealthAreasGrid } from '../../features/mission-control/CompanyHealthAreasGrid';
import {
  canAccessMissionControl,
  canManageMissionControl,
  formatModuleName,
  formatSeverity,
  formatStatus,
} from '../../features/mission-control/utils';

type CompanyHealthTab = 'dashboard' | 'alerts';

export function MissionControlPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<CompanyHealthTab>('dashboard');
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessMissionControl(user.permissions) : false), [user]);
  const canWrite = useMemo(
    () => (user ? canManageMissionControl(user.permissions) : false),
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

  const tabs: Array<{ id: CompanyHealthTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'alerts', label: 'Alerts' },
  ];

  const statCards = dashboard
    ? [
        dashboard.businessHealthScore != null
          ? { label: 'Business Health', value: String(dashboard.businessHealthScore) }
          : null,
        dashboard.pendingAlertCount > 0
          ? { label: 'Pending Alerts', value: String(dashboard.pendingAlertCount) }
          : null,
        dashboard.criticalAlertCount > 0
          ? { label: 'Critical Alerts', value: String(dashboard.criticalAlertCount) }
          : null,
        dashboard.activeIncidentCount > 0
          ? { label: 'Active Incidents', value: String(dashboard.activeIncidentCount) }
          : null,
        dashboard.pendingActionCount > 0
          ? { label: 'Pending Actions', value: String(dashboard.pendingActionCount) }
          : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="automation-page page-shell mission-control-page">
      <PageHeader
        title={NAV_LABELS.companyHealth}
        description="Business health across cash flow, jobs, customers, team, fleet, stock, compliance, and integrations."
        actions={
          <div className="page-header-actions">
            <Link href="/departments">
              <Button variant="secondary" size="sm">
                Departments
              </Button>
            </Link>
            {canWrite ? (
              <>
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
              </>
            ) : null}
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <TabNav
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as CompanyHealthTab)}
        ariaLabel="Company health sections"
      />

      {isLoading ? (
        <LoadingState label="Loading company health…" />
      ) : !dashboard ? (
        <EmptyState title="No data" description="Company health dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'dashboard' ? (
            <div className="mission-control-dashboard">
              <Panel title="Overall status" className="company-health-overall">
                <div className="company-health-overall__row">
                  <span className={`status-pill status-pill--${dashboard.systemHealthStatus}`}>
                    {formatStatus(dashboard.systemHealthStatus)}
                  </span>
                  <p className="company-health-overall__summary">{dashboard.summary}</p>
                </div>
              </Panel>

              {statCards.length > 0 ? (
                <SummaryCardGrid columns={4} className="mission-control-stats">
                  {statCards.map((card) =>
                    card ? <StatCard key={card.label} label={card.label} value={card.value} /> : null,
                  )}
                </SummaryCardGrid>
              ) : null}

              {modulesLoading && moduleSnapshots === undefined ? (
                <LoadingState label="Loading business areas…" />
              ) : (
                <CompanyHealthAreasGrid
                  snapshots={dashboard.moduleSnapshots}
                  recommendations={dashboard.recommendations}
                />
              )}

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
            </div>
          ) : null}

          {activeTab === 'alerts' ? (
            <Panel title="Business Alerts">
              {dashboard.recentAlerts.length === 0 ? (
                <EmptyState
                  title="No alerts"
                  description="Alerts appear when live business modules report issues."
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
        </>
      )}
    </div>
  );
}
