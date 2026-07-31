import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseAssetLifecycleDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  acknowledgeAssetAlert,
  captureAssetAnalytics,
  fetchAssetLifecycleDashboard,
  generateMaintenanceDue,
  resolveAssetAlert,
} from '../../lib/enterprise-asset-lifecycle-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessAssetIntelligence,
  canManageAssetIntelligence,
  formatAlertSeverity,
  formatIotProviderType,
  formatLifecycleStage,
} from '../../features/asset-intelligence/utils';

type AssetIntelligenceTab =
  | 'overview'
  | 'registry'
  | 'iot'
  | 'alerts'
  | 'maintenance'
  | 'predictive'
  | 'analytics'
  | 'assistant';

export function AssetIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AssetIntelligenceTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseAssetLifecycleDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const canView = useMemo(
    () => (user ? canAccessAssetIntelligence(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageAssetIntelligence(user.permissions) : false),
    [user],
  );

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchAssetLifecycleDashboard(accessToken);
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
        const data = await fetchAssetLifecycleDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load asset intelligence dashboard',
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
          title="Asset Intelligence"
          description="You do not have permission to view asset intelligence."
        />
      </div>
    );
  }

  const tabs: Array<{ id: AssetIntelligenceTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'registry', label: 'Asset Registry' },
    { id: 'iot', label: 'IoT Monitoring' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'predictive', label: 'Predictive' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Asset Intelligence"
        description="Enterprise asset lifecycle, IoT monitoring, and predictive maintenance. Real operational data only."
        actions={
          <div className="page-header-actions">
            <Link href="/asset-equipment">
              <Button variant="secondary">Asset Equipment</Button>
            </Link>
            <Link href="/digital-twin">
              <Button variant="secondary">Digital Twin</Button>
            </Link>
            {canWrite ? (
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => captureAssetAnalytics(accessToken!), 'Analytics captured')
                }
              >
                Capture analytics
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${activeTab === tab.id ? 'tab-button--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Panel title="Loading">Loading asset intelligence dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Asset intelligence dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'overview' ? (
            <div className="stat-grid">
              <StatCard label="Assets" value={String(dashboard.assetCount)} />
              <StatCard label="Registry profiles" value={String(dashboard.registryProfileCount)} />
              <StatCard label="IoT devices" value={String(dashboard.iotDeviceCount)} />
              <StatCard label="Active providers" value={String(dashboard.activeProviderCount)} />
              <StatCard label="Open alerts" value={String(dashboard.openAlertCount)} />
              <StatCard label="Maintenance due" value={String(dashboard.maintenanceDueCount)} />
              <StatCard
                label="Predictive assessments"
                value={String(dashboard.predictiveAssessmentCount)}
              />
              <StatCard
                label="Digital twin"
                value={dashboard.digitalTwinConnected ? 'Connected' : 'Available'}
              />
            </div>
          ) : null}

          {activeTab === 'registry' ? (
            <Panel title="Asset registry" description="Custom categories and lifecycle profiles">
              {dashboard.recentAssets.length === 0 ? (
                <EmptyState
                  title="No assets"
                  description="Assets appear when registered through asset equipment."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recentAssets.map((asset) => (
                    <div key={asset.id} className="data-list__item">
                      <strong>{asset.name}</strong>
                      <p className="page-muted">
                        {asset.profile?.customCategoryName ?? asset.assetType} ·{' '}
                        {formatLifecycleStage(asset.profile?.lifecycleStage ?? 'active_operation')}{' '}
                        · {asset.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'iot' ? (
            <Panel
              title="IoT providers & telemetry"
              description="Vendor-agnostic provider adapters"
            >
              {dashboard.iotProviders.length === 0 ? (
                <EmptyState
                  title="No IoT providers"
                  description="Configure IoT provider adapters to ingest telemetry."
                />
              ) : (
                <div className="data-list">
                  {dashboard.iotProviders.map((provider) => (
                    <div key={provider.id} className="data-list__item">
                      <strong>{provider.name}</strong>
                      <p className="page-muted">
                        {formatIotProviderType(provider.providerType)} · {provider.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {dashboard.recentTelemetry.length > 0 ? (
                <Panel title="Recent telemetry">
                  <ul className="portal-list">
                    {dashboard.recentTelemetry.slice(0, 10).map((reading) => (
                      <li key={reading.id}>
                        {reading.field}: {reading.normalizedValue}
                        {reading.unit ? ` ${reading.unit}` : ''} ·{' '}
                        {new Date(reading.recordedAt).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </Panel>
          ) : null}

          {activeTab === 'alerts' ? (
            <Panel
              title="Asset alerts"
              description="Threshold breaches and equipment alerts from real data"
            >
              {dashboard.recentAlerts.length === 0 ? (
                <EmptyState
                  title="No alerts"
                  description="Alerts appear when thresholds are breached or devices report faults."
                />
              ) : (
                <div className="data-list">
                  {dashboard.recentAlerts.map((alert) => (
                    <div key={alert.id} className="data-list__item">
                      <div>
                        <strong>{alert.title}</strong>
                        <p className="page-muted">
                          {formatAlertSeverity(alert.severity)} · {alert.status} ·{' '}
                          {alert.alertType.replace(/_/g, ' ')}
                        </p>
                      </div>
                      {canWrite && alert.status === 'open' ? (
                        <div className="page-header-actions">
                          <Button
                            size="sm"
                            disabled={isWorking}
                            onClick={() =>
                              void runAction(
                                () => acknowledgeAssetAlert(accessToken!, alert.id),
                                'Alert acknowledged',
                              )
                            }
                          >
                            Acknowledge
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isWorking}
                            onClick={() =>
                              void runAction(
                                () => resolveAssetAlert(accessToken!, alert.id),
                                'Alert resolved',
                              )
                            }
                          >
                            Resolve
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'maintenance' ? (
            <Panel title="Preventive maintenance" description="Due records from real schedules">
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => generateMaintenanceDue(accessToken!),
                      'Maintenance due records generated',
                    )
                  }
                >
                  Generate due records
                </Button>
              ) : null}
              {dashboard.maintenanceDue.length === 0 ? (
                <EmptyState
                  title="No maintenance due"
                  description="Due records appear when schedules become due."
                />
              ) : (
                <ul className="portal-list">
                  {dashboard.maintenanceDue.map((due) => (
                    <li key={due.id}>
                      <strong>{due.title}</strong> — {due.status} · {due.dueReason}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {activeTab === 'predictive' ? (
            <Panel
              title="Predictive maintenance"
              description="AURA recommendations from real maintenance and telemetry data"
            >
              {dashboard.predictiveAssessments.length === 0 ? (
                <EmptyState
                  title="No assessments"
                  description="Generate predictive assessments from asset equipment with maintenance history."
                />
              ) : (
                <div className="data-list">
                  {dashboard.predictiveAssessments.map((assessment) => (
                    <div key={assessment.id} className="data-list__item">
                      <strong>Risk score: {assessment.failureRiskScore ?? '—'}</strong>
                      <p className="page-muted">
                        Confidence {assessment.confidenceScore ?? '—'}% · RUL{' '}
                        {assessment.remainingUsefulLifeDays ?? '—'} days
                      </p>
                      <p>{assessment.maintenanceRecommendation}</p>
                      <p className="page-muted">{assessment.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'analytics' ? (
            <Panel title="Asset analytics" description="Metrics from real operational data">
              <div className="stat-grid">
                <StatCard
                  label="Maintenance cost"
                  value={`${(dashboard.analytics.maintenanceCostCents / 100).toFixed(2)}`}
                />
                <StatCard
                  label="Device connectivity"
                  value={
                    dashboard.analytics.deviceConnectivityPercent != null
                      ? `${dashboard.analytics.deviceConnectivityPercent.toFixed(1)}%`
                      : '—'
                  }
                />
                <StatCard
                  label="Predictive risk avg"
                  value={
                    dashboard.analytics.predictiveRiskAvg != null
                      ? dashboard.analytics.predictiveRiskAvg.toFixed(1)
                      : '—'
                  }
                />
                <StatCard
                  label="Alert response"
                  value={
                    dashboard.analytics.alertResponseTimeHours != null
                      ? `${dashboard.analytics.alertResponseTimeHours.toFixed(1)}h`
                      : '—'
                  }
                />
              </div>
            </Panel>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel
              title="AURA Asset Intelligence Agent"
              description="Recommendations only — approval required for actions"
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
                  void sendAgentMessage(
                    content,
                    'asset_intelligence' as import('@titan/shared').AgentKey,
                  )
                }
                placeholder="Ask about assets, IoT telemetry, alerts, maintenance, or failure risk…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
