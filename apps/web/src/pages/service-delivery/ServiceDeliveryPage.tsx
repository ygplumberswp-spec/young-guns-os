import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { EnterpriseServiceDeliveryDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureServiceAnalytics,
  fetchServiceDeliveryDashboard,
  syncServiceAlerts,
} from '../../lib/enterprise-service-delivery-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessServiceDelivery,
  canManageServiceDelivery,
  formatInspectionStatus,
  formatPercent,
  formatWorkflowStatus,
} from '../../features/service-delivery/utils';

type ServiceDeliveryTab =
  | 'overview'
  | 'jobs'
  | 'sla'
  | 'quality'
  | 'inspections'
  | 'warranties'
  | 'callbacks'
  | 'improvement'
  | 'cx'
  | 'workforce'
  | 'fleet'
  | 'inventory'
  | 'finance'
  | 'analytics'
  | 'alerts'
  | 'assistant';

export function ServiceDeliveryPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<ServiceDeliveryTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseServiceDeliveryDashboard | null>(null);
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
    () => (user ? canAccessServiceDelivery(user.permissions) : false),
    [user],
  );
  const canWrite = useMemo(
    () => (user ? canManageServiceDelivery(user.permissions) : false),
    [user],
  );

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchServiceDeliveryDashboard(accessToken);
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
        const data = await fetchServiceDeliveryDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load service delivery dashboard',
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
          title="Service Delivery"
          description="You do not have permission to view service delivery."
        />
      </div>
    );
  }

  const tabs: Array<{ id: ServiceDeliveryTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'jobs', label: 'Active Jobs' },
    { id: 'sla', label: 'SLA' },
    { id: 'quality', label: 'Quality' },
    { id: 'inspections', label: 'Inspections' },
    { id: 'warranties', label: 'Warranties' },
    { id: 'callbacks', label: 'Callbacks' },
    { id: 'improvement', label: 'Continuous Improvement' },
    { id: 'cx', label: 'Customer Experience' },
    { id: 'workforce', label: 'Workforce' },
    { id: 'fleet', label: 'Fleet' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'finance', label: 'Finance' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Service Delivery"
        description="Field operations quality, customer promises, SLA, inspections, and warranty intelligence. Real operational data only."
        actions={
          <div className="page-header-actions">
            <Link href="/jobs">
              <Button variant="secondary">Jobs</Button>
            </Link>
            <Link href="/quality">
              <Button variant="secondary">Quality</Button>
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
      {isLoading ? <p>Loading service delivery...</p> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Active Jobs" value={String(dashboard.jobStats.activeCount)} />
            <StatCard label="SLA Breaches" value={String(dashboard.slaBreachCount)} />
            <StatCard label="Open Defects" value={String(dashboard.openDefectCount)} />
            <StatCard label="Open Callbacks" value={String(dashboard.openCallbackCount)} />
            <StatCard label="Open Promises" value={String(dashboard.openPromiseCount)} />
            <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
          </div>
          <Panel
            title="Service Monitoring"
            description={
              dashboard.serviceMonitoring.alerts.join(' · ') ||
              'No active alerts from real operational data'
            }
          >
            <p>{dashboard.summary}</p>
            <ul className="simple-list">
              <li>Overdue inspections: {dashboard.serviceMonitoring.overdueInspectionCount}</li>
              <li>Promise breaches: {dashboard.serviceMonitoring.promiseBreachCount}</li>
              <li>
                Pending corrective actions:{' '}
                {dashboard.serviceMonitoring.pendingCorrectiveActionCount}
              </li>
              <li>
                First-time fix rate:{' '}
                {dashboard.qualityStats.firstTimeFixRatePercent != null
                  ? `${dashboard.qualityStats.firstTimeFixRatePercent.toFixed(1)}%`
                  : '—'}
              </li>
            </ul>
            {canWrite ? (
              <div className="panel-actions">
                <Button
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () => captureServiceAnalytics(accessToken!),
                      'Analytics captured from real service data.',
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
                      () => syncServiceAlerts(accessToken!),
                      'Service alerts synced from real records.',
                    )
                  }
                >
                  Sync Alerts
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
                <li>Completed jobs: {dashboard.analytics.completedJobCount}</li>
                <li>SLA breaches: {dashboard.analytics.slaBreachCount}</li>
                <li>
                  First-time fix rate: {formatPercent(dashboard.analytics.firstTimeFixRatePercent)}
                </li>
              </ul>
            </Panel>
          ) : null}
        </>
      ) : null}

      {dashboard && activeTab === 'jobs' ? (
        <Panel title="Active Jobs" description="Job execution intelligence from real job records">
          <div className="stat-grid">
            <StatCard label="Active" value={String(dashboard.jobStats.activeCount)} />
            <StatCard label="Total" value={String(dashboard.jobStats.totalCount)} />
          </div>
          <Link href="/jobs">
            <Button variant="secondary">Open Jobs</Button>
          </Link>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'sla' ? (
        <Panel
          title="SLA Intelligence"
          description="Configurable SLA frameworks — alerts from real data only"
        >
          {dashboard.recentSlaRecords.length === 0 ? (
            <EmptyState
              title="No SLA records"
              description="SLA records appear when tracked against real jobs."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentSlaRecords.map((record) => (
                <li key={record.id}>
                  {record.slaType} —{' '}
                  {record.breachedAt ? 'breached' : record.metAt ? 'met' : 'open'}
                  {record.targetAt ? ` · target ${record.targetAt}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'quality' ? (
        <Panel
          title="Quality Assurance"
          description="Defects, non-conformances, and corrective actions"
        >
          {dashboard.recentDefects.length === 0 ? (
            <EmptyState
              title="No defects"
              description="Quality records appear from real inspections and jobs."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentDefects.map((defect) => (
                <li key={defect.id}>
                  <strong>{defect.defectType}</strong> — {defect.severity} (
                  {formatWorkflowStatus(defect.workflowStatus)})
                </li>
              ))}
            </ul>
          )}
          {dashboard.recentCorrectiveActions.length > 0 ? (
            <>
              <h4>Corrective Actions</h4>
              <ul className="simple-list">
                {dashboard.recentCorrectiveActions.map((action) => (
                  <li key={action.id}>
                    <strong>{action.title}</strong> — {formatWorkflowStatus(action.workflowStatus)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'inspections' ? (
        <Panel
          title="Digital Inspections"
          description="Draft → Inspection → Review → Approval → Completion"
        >
          {dashboard.recentInspections.length === 0 ? (
            <EmptyState
              title="No inspections"
              description="Inspections appear when created from configurable templates."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentInspections.map((inspection) => (
                <li key={inspection.id}>
                  Inspection — {formatInspectionStatus(inspection.inspectionStatus)}
                  {inspection.completedAt ? ` · completed ${inspection.completedAt}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'warranties' ? (
        <Panel
          title="Warranty Intelligence"
          description="Warranty periods, claims, and repeat failures from real records"
        >
          <p>Open warranty claims (quality module): {dashboard.qualityStats.openWarrantyCount}</p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'callbacks' ? (
        <Panel
          title="Callback Intelligence"
          description="Repeat jobs and rework — recommendations only"
        >
          {dashboard.recentCallbacks.length === 0 ? (
            <EmptyState
              title="No callbacks"
              description="Callback records appear from real repeat visits and quality data."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentCallbacks.map((callback) => (
                <li key={callback.id}>
                  <strong>{callback.callbackReason}</strong> —{' '}
                  {formatWorkflowStatus(callback.workflowStatus)}
                  {callback.scheduledAt ? ` · scheduled ${callback.scheduledAt}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard &&
      ['improvement', 'cx', 'workforce', 'fleet', 'inventory', 'finance', 'analytics'].includes(
        activeTab,
      ) ? (
        <Panel
          title={tabs.find((t) => t.id === activeTab)?.label ?? 'Service Delivery'}
          description="Integrated with existing TITAN modules — real data only"
        >
          <p>
            {activeTab === 'cx' &&
              'Customer experience integration supports live ETA, service timeline, and portal tracking.'}
            {activeTab === 'workforce' &&
              'Workforce intelligence measures productivity, utilization, quality, and certification impact.'}
            {activeTab === 'fleet' &&
              'Fleet intelligence tracks travel efficiency, route quality, and vehicle utilization.'}
            {activeTab === 'inventory' &&
              'Inventory integration tracks parts usage, vehicle stock, and shortages.'}
            {activeTab === 'finance' &&
              'Financial planning integration measures job profitability, warranty cost, and rework cost.'}
            {activeTab === 'improvement' &&
              'Continuous improvement identifies trends from real operational data — recommendations only.'}
            {activeTab === 'analytics' &&
              'Analytics snapshots capture real job, SLA, and quality metrics.'}
          </p>
        </Panel>
      ) : null}

      {dashboard && activeTab === 'alerts' ? (
        <Panel
          title="Service Delivery Alerts"
          description="Real alerts from SLA breaches, quality, and callbacks"
        >
          {dashboard.recentAlerts.length === 0 ? (
            <EmptyState
              title="No open alerts"
              description="Alerts are generated from real tenant activity."
            />
          ) : (
            <ul className="simple-list">
              {dashboard.recentAlerts.map((alert) => (
                <li key={alert.id}>
                  <strong>{alert.title}</strong> — {alert.severity} ({alert.status})
                  {alert.description ? ` · ${alert.description}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel
          title="AURA Service Delivery Agent"
          description="Recommendations and drafts only — no autonomous job closure or quality approval"
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
              void sendAgentMessage(content, 'service_delivery' as import('@titan/shared').AgentKey)
            }
            placeholder="Ask about SLA, inspections, quality, warranties, or callbacks…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
