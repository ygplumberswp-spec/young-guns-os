import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseBusinessContinuityDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  captureBusinessContinuityAnalytics,
  fetchBusinessContinuityAuditLogs,
  fetchBusinessContinuityDashboard,
  syncContinuityAlerts,
} from '../../lib/enterprise-business-continuity-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessBusinessContinuity,
  canManageBusinessContinuity,
  formatBytes,
  formatPercent,
  formatScenarioKey,
  formatScheduleType,
  formatSeverity,
  formatStatus,
} from '../../features/business-continuity/utils';

type BusinessContinuityTab =
  | 'overview'
  | 'policies'
  | 'jobs'
  | 'restore'
  | 'plans'
  | 'tests'
  | 'storage'
  | 'verification'
  | 'compliance'
  | 'analytics'
  | 'audit'
  | 'settings'
  | 'assistant';

export function BusinessContinuityPage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<BusinessContinuityTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseBusinessContinuityDashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof fetchBusinessContinuityAuditLogs>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupplementaryLoading, setIsSupplementaryLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { agentMessages, isSending, pendingTasks, sendAgentMessage, updateTask, error: assistantError } =
    useAuraChat();

  const canView = useMemo(() => (user ? canAccessBusinessContinuity(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageBusinessContinuity(user.permissions) : false), [user]);

  const tabs: Array<{ id: BusinessContinuityTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'policies', label: 'Backup Policies' },
    { id: 'jobs', label: 'Backup Jobs' },
    { id: 'restore', label: 'Restore Center' },
    { id: 'plans', label: 'Recovery Plans' },
    { id: 'tests', label: 'Recovery Tests' },
    { id: 'storage', label: 'Storage Health' },
    { id: 'verification', label: 'Verification' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'audit', label: 'Audit' },
    { id: 'settings', label: 'Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchBusinessContinuityDashboard(accessToken);
    setDashboard(data);
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
          setError(err instanceof ApiClientError ? err.message : 'Unable to load business continuity dashboard');
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
        const logs = await fetchBusinessContinuityAuditLogs(accessToken!);
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
      <div className="automation-page">
        <PageHeader title="Business Continuity" description="You do not have permission to view business continuity." />
      </div>
    );
  }

  return (
    <div className="automation-page">
      <PageHeader
        title="Business Continuity"
        description="Enterprise backup, disaster recovery, and business continuity — built on existing security, storage, and production readiness services. No fake backups or demo recovery events."
        actions={
          canWrite ? (
            <div className="page-header-actions">
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => void runAction(() => syncContinuityAlerts(accessToken!), 'Continuity alerts synced.')}
              >
                Sync Alerts
              </Button>
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() =>
                  void runAction(() => captureBusinessContinuityAnalytics(accessToken!), 'Analytics captured.')
                }
              >
                Capture Analytics
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
        <Panel title="Loading">Loading business continuity dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Business continuity dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'overview' ? (
            <>
              <div className="stat-grid">
                <StatCard label="Enabled Policies" value={String(dashboard.enabledPolicyCount)} />
                <StatCard label="Failed Backups" value={String(dashboard.continuityHealth.failedBackupCount)} />
                <StatCard label="Backup Success" value={formatPercent(dashboard.continuityHealth.backupSuccessRatePercent)} />
                <StatCard label="Restore Readiness" value={formatStatus(dashboard.continuityHealth.restoreReadinessStatus)} />
                <StatCard label="Recovery Readiness" value={formatStatus(dashboard.continuityHealth.recoveryReadinessStatus)} />
                <StatCard label="Open Alerts" value={String(dashboard.openAlertCount)} />
              </div>
              <Panel title="Summary">
                <p>{dashboard.summary}</p>
              </Panel>
              {dashboard.recentAlerts.length > 0 ? (
                <Panel title="Recent Alerts">
                  <div className="data-list">
                    {dashboard.recentAlerts.map((alert) => (
                      <div key={alert.id} className="data-list-item">
                        <strong>{alert.title}</strong>
                        <span>{formatSeverity(alert.severity)} · {formatStatus(alert.status)}</span>
                        {alert.description ? <p>{alert.description}</p> : null}
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {activeTab === 'policies' ? (
            <Panel title="Backup Policies">
              {dashboard.backupPolicies.length === 0 ? (
                <EmptyState title="No policies" description="Configure backup policies with hourly, daily, weekly, monthly, or manual schedules." />
              ) : (
                <div className="data-list">
                  {dashboard.backupPolicies.map((policy) => (
                    <div key={policy.id} className="data-list-item">
                      <strong>{policy.name}</strong>
                      <span>{formatScheduleType(policy.scheduleType)} · {policy.retentionDays} day retention · {policy.isEnabled ? 'Enabled' : 'Disabled'}</span>
                      {policy.description ? <p>{policy.description}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'jobs' ? (
            <Panel title="Backup Jobs">
              {dashboard.backupJobs.length === 0 ? (
                <EmptyState title="No backup jobs" description="Backup jobs appear when policies run or manual backups are initiated." />
              ) : (
                <div className="data-list">
                  {dashboard.backupJobs.map((job) => (
                    <div key={job.id} className="data-list-item">
                      <strong>{job.policyName ?? 'Manual backup'}</strong>
                      <span>{formatStatus(job.status)} · {formatBytes(job.sizeBytes)} · {job.encrypted ? 'Encrypted' : 'Unencrypted'}</span>
                      {job.errorMessage ? <p>{job.errorMessage}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'restore' ? (
            <Panel title="Restore Center">
              {dashboard.restoreRequests.length === 0 ? (
                <EmptyState title="No restore requests" description="Restore requests require explicit owner approval before modifying production data." />
              ) : (
                <div className="data-list">
                  {dashboard.restoreRequests.map((request) => (
                    <div key={request.id} className="data-list-item">
                      <strong>{request.title}</strong>
                      <span>{formatStatus(request.restoreScope)} · {formatStatus(request.status)}</span>
                      {request.requiresOwnerApproval ? <span>Owner approval required</span> : null}
                      {request.description ? <p>{request.description}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'plans' ? (
            <Panel title="Recovery Plans">
              {dashboard.recoveryPlans.length === 0 ? (
                <EmptyState title="No recovery plans" description="Disaster recovery plans are seeded for standard failure scenarios." />
              ) : (
                <div className="data-list">
                  {dashboard.recoveryPlans.map((plan) => (
                    <div key={plan.id} className="data-list-item">
                      <strong>{plan.name}</strong>
                      <span>{formatScenarioKey(plan.scenarioKey)} · {plan.estimatedRecoveryTimeMinutes ?? '—'} min RTO</span>
                      {plan.description ? <p>{plan.description}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'tests' ? (
            <Panel title="Recovery Tests">
              {dashboard.recoveryTests.length === 0 ? (
                <EmptyState title="No recovery tests" description="Schedule recovery drills that never affect production data." />
              ) : (
                <div className="data-list">
                  {dashboard.recoveryTests.map((test) => (
                    <div key={test.id} className="data-list-item">
                      <strong>{test.title}</strong>
                      <span>{formatStatus(test.status)} · {test.isProductionSafe ? 'Production-safe' : 'Isolated'}</span>
                      {test.lessonsLearned ? <p>{test.lessonsLearned}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'storage' ? (
            <Panel title="Storage Health">
              {dashboard.storageHealth.length === 0 ? (
                <EmptyState title="No storage snapshots" description="Capture storage health snapshots to monitor redundancy and capacity." />
              ) : (
                <div className="data-list">
                  {dashboard.storageHealth.map((snapshot) => (
                    <div key={snapshot.id} className="data-list-item">
                      <strong>{snapshot.storageType}</strong>
                      <span>{formatStatus(snapshot.healthStatus)} · {formatBytes(snapshot.usageBytes)} used</span>
                      {snapshot.redundancyLevel ? <span>Redundancy: {snapshot.redundancyLevel}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'verification' ? (
            <Panel title="Backup Verification">
              {dashboard.verificationRecords.length === 0 ? (
                <EmptyState title="No verifications" description="Verification records track backup integrity, encryption, and restore capability." />
              ) : (
                <div className="data-list">
                  {dashboard.verificationRecords.map((record) => (
                    <div key={record.id} className="data-list-item">
                      <strong>{formatStatus(record.verificationType)}</strong>
                      <span>{formatStatus(record.status)} · {record.passed === true ? 'Passed' : record.passed === false ? 'Failed' : 'Pending'}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'compliance' ? (
            <Panel title="Recovery Compliance">
              {dashboard.complianceRecords.length === 0 ? (
                <EmptyState title="No compliance records" description="Track RPO/RTO compliance and recovery readiness." />
              ) : (
                <div className="data-list">
                  {dashboard.complianceRecords.map((record) => (
                    <div key={record.id} className="data-list-item">
                      <strong>{formatStatus(record.complianceType)}</strong>
                      <span>{formatStatus(record.status)} · RPO {record.rpoMinutes ?? '—'} min · RTO {record.rtoMinutes ?? '—'} min</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'analytics' ? (
            <Panel title="Analytics">
              {dashboard.analytics ? (
                <div className="data-list">
                  {Object.entries(dashboard.analytics.metrics).map(([key, value]) => (
                    <div key={key} className="data-list-item">
                      <strong>{formatStatus(key)}</strong>
                      <span>{String(value)}</span>
                    </div>
                  ))}
                  <span>Captured {new Date(dashboard.analytics.capturedAt).toLocaleString()}</span>
                </div>
              ) : (
                <EmptyState title="No analytics" description="Capture analytics to track backup success rate and recovery readiness." />
              )}
            </Panel>
          ) : null}

          {activeTab === 'audit' ? (
            <Panel title="Audit Log">
              {isSupplementaryLoading ? (
                <p>Loading audit logs…</p>
              ) : auditLogs.length === 0 ? (
                <EmptyState title="No audit entries" description="Business continuity actions are fully audited." />
              ) : (
                <div className="data-list">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="data-list-item">
                      <strong>{formatStatus(log.actionType)}</strong>
                      <span>{log.entityType ?? 'system'} · {new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'settings' ? (
            <Panel title="Platform Settings">
              <div className="data-list">
                <div className="data-list-item">
                  <strong>Encryption Required</strong>
                  <span>{dashboard.platformConfig.encryptionRequired ? 'Yes' : 'No'}</span>
                </div>
                <div className="data-list-item">
                  <strong>Audit Retention</strong>
                  <span>{dashboard.platformConfig.auditRetentionDays} days</span>
                </div>
                <div className="data-list-item">
                  <strong>Overall Health</strong>
                  <span>{formatStatus(dashboard.overallBusinessContinuityHealthStatus)}</span>
                </div>
              </div>
            </Panel>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Business Continuity Agent">
              {assistantError ? <p className="form-error">{assistantError}</p> : null}
              <AuraMessageList messages={agentMessages} isSending={isSending} />
              {pendingTasks.map((task) => (
                <AuraTaskApprovalCard key={task.id} task={task} accessToken={accessToken ?? ''} onUpdated={updateTask} />
              ))}
              <AuraComposer
                disabled={isSending}
                onSend={(content) => void sendAgentMessage(content, 'business_continuity' as import('@titan/shared').AgentKey)}
                placeholder="Ask about backup status, recovery plans, verification reports, or draft continuity improvements…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
