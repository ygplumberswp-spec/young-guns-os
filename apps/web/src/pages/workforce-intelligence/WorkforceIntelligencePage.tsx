import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseWorkforceIntelligenceDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveLeaveApplication,
  approveTimesheet,
  captureTechnicianPerformance,
  captureWorkforceAnalytics,
  fetchWorkforceIntelligenceDashboard,
} from '../../lib/enterprise-workforce-intelligence-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessWorkforceIntelligence,
  canManageWorkforceIntelligence,
  formatLifecycleStage,
} from '../../features/workforce-intelligence/utils';

type WorkforceTab =
  | 'overview'
  | 'registry'
  | 'timesheets'
  | 'leave'
  | 'payroll'
  | 'performance'
  | 'providers'
  | 'analytics'
  | 'assistant';

export function WorkforceIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkforceTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseWorkforceIntelligenceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { agentMessages, isSending, pendingTasks, sendAgentMessage, updateTask, error: assistantError } =
    useAuraChat();

  const canView = useMemo(() => (user ? canAccessWorkforceIntelligence(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageWorkforceIntelligence(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchWorkforceIntelligenceDashboard(accessToken);
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
        const data = await fetchWorkforceIntelligenceDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load workforce intelligence dashboard');
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
        <PageHeader title="Workforce Intelligence" description="You do not have permission to view workforce intelligence." />
      </div>
    );
  }

  const tabs: Array<{ id: WorkforceTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'registry', label: 'Workforce Registry' },
    { id: 'timesheets', label: 'Timesheets' },
    { id: 'leave', label: 'Leave' },
    { id: 'payroll', label: 'Payroll Prep' },
    { id: 'performance', label: 'Performance' },
    { id: 'providers', label: 'Providers' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Workforce Intelligence"
        description="Enterprise workforce registry, HR, payroll preparation, and technician performance. Real operational data only."
        actions={
          <div className="page-header-actions">
            <Link href="/workforce/manager">
              <Button variant="secondary">Manager Workspace</Button>
            </Link>
            <Link href="/workforce/self-service">
              <Button variant="secondary">Self-Service</Button>
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
      {isLoading ? <p>Loading workforce intelligence...</p> : null}

      {dashboard && activeTab === 'overview' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Workforce Profiles" value={String(dashboard.profileCount)} />
            <StatCard label="Pending Leave" value={String(dashboard.pendingLeaveCount)} />
            <StatCard label="Timesheets Pending" value={String(dashboard.pendingTimesheetCount)} />
            <StatCard label="Active Providers" value={String(dashboard.activeProviderCount)} />
            <StatCard label="Candidates in Pipeline" value={String(dashboard.workforceStats.activePipelineCount)} />
            <StatCard label="Payroll Batches" value={String(dashboard.payrollBatchCount)} />
          </div>
          <Panel title="Summary" description={dashboard.summary}>
            <p>{dashboard.summary}</p>
            {canWrite ? (
              <div className="panel-actions">
                <Button disabled={isWorking} onClick={() => void runAction(() => captureWorkforceAnalytics(accessToken!), 'Analytics captured from real workforce data.')}>
                  Capture Analytics
                </Button>
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}

      {dashboard && activeTab === 'registry' ? (
        <Panel title="Workforce Registry" description="Tenant-configured workforce profiles">
          {dashboard.recentProfiles.length === 0 ? (
            <EmptyState title="No workforce profiles" description="Create profiles linked to team members when onboarding staff." />
          ) : (
            <ul className="simple-list">
              {dashboard.recentProfiles.map((profile) => (
                <li key={profile.id}>
                  <strong>{profile.userName}</strong> — {profile.jobTitle ?? 'No title'} ({formatLifecycleStage(profile.lifecycleStage)})
                  {profile.department ? ` · ${profile.department}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'timesheets' ? (
        <Panel title="Timesheets" description="Approved timesheets are never silently altered — corrections preserve audit history">
          {dashboard.recentTimesheets.length === 0 ? (
            <EmptyState title="No timesheets" description="Timesheets appear when employees submit time records." />
          ) : (
            <ul className="simple-list">
              {dashboard.recentTimesheets.map((ts) => (
                <li key={ts.id}>
                  {ts.userName}: {ts.periodStart} – {ts.periodEnd} ({ts.status}) — {ts.standardHours}h standard
                  {canWrite && ts.status === 'submitted' ? (
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() => void runAction(() => approveTimesheet(accessToken!, ts.id), 'Timesheet approved.')}
                    >
                      Approve
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'leave' ? (
        <Panel title="Leave Management" description="Configurable leave categories per tenant">
          {dashboard.pendingLeaveApplications.length === 0 ? (
            <EmptyState title="No pending leave" description="Leave applications appear when employees request time off." />
          ) : (
            <ul className="simple-list">
              {dashboard.pendingLeaveApplications.map((leave) => (
                <li key={leave.id}>
                  {leave.userName}: {leave.categoryName} {leave.startDate} – {leave.endDate} ({leave.daysRequested} days)
                  {canWrite ? (
                    <Button
                      variant="secondary"
                      disabled={isWorking}
                      onClick={() => void runAction(() => approveLeaveApplication(accessToken!, leave.id), 'Leave approved.')}
                    >
                      Approve
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'payroll' ? (
        <Panel title="Payroll Preparation" description="Payroll export requires approval — TITAN does not submit statutory payroll autonomously">
          {dashboard.payrollPreparations.length === 0 ? (
            <EmptyState title="No payroll batches" description="Create payroll periods and prepare batches from approved timesheets." />
          ) : (
            <ul className="simple-list">
              {dashboard.payrollPreparations.map((batch) => (
                <li key={batch.id}>
                  {batch.periodName}: {batch.status} — {batch.exceptionCount} exception(s)
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'performance' ? (
        <Panel title="Technician Performance" description="Performance scores from real job data with supporting evidence">
          {dashboard.technicianPerformance.length === 0 ? (
            <>
              <EmptyState title="No performance snapshots" description="Capture performance from real job completion data." />
              {canWrite ? (
                <Button
                  disabled={isWorking}
                  onClick={() => void runAction(() => captureTechnicianPerformance(accessToken!), 'Performance captured from real job data.')}
                >
                  Capture Performance
                </Button>
              ) : null}
            </>
          ) : (
            <ul className="simple-list">
              {dashboard.technicianPerformance.map((perf) => (
                <li key={perf.id}>
                  <strong>{perf.userName}</strong>: {perf.jobsCompleted}/{perf.jobsAssigned} jobs
                  {perf.firstTimeFixRate != null ? ` · ${perf.firstTimeFixRate}% completion` : ''}
                  {perf.explanation ? ` — ${perf.explanation}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'providers' ? (
        <Panel title="Payroll & HR Providers" description="Vendor-agnostic adapter framework — configure per tenant">
          {dashboard.providerCount === 0 ? (
            <EmptyState title="No providers configured" description="Add Sage, Xero, PaySpace, BambooHR, or custom REST/SFTP adapters." />
          ) : (
            <p>{dashboard.activeProviderCount} active of {dashboard.providerCount} configured provider(s).</p>
          )}
        </Panel>
      ) : null}

      {dashboard && activeTab === 'analytics' ? (
        <Panel title="Workforce Analytics" description="Real workforce metrics — no fabricated data">
          {dashboard.analytics ? (
            <ul className="simple-list">
              <li>Headcount: {dashboard.analytics.headcount}</li>
              <li>Contractors: {dashboard.analytics.contractorCount}</li>
              <li>Certification risks: {dashboard.analytics.certificationRiskCount}</li>
              <li>Payroll exceptions: {dashboard.analytics.payrollExceptionCount}</li>
            </ul>
          ) : (
            <EmptyState title="No analytics captured" description="Capture analytics from real workforce activity." />
          )}
        </Panel>
      ) : null}

      {activeTab === 'assistant' ? (
        <Panel title="AURA Workforce Intelligence Agent" description="Recommendations only — approval required for HR and payroll actions">
          {assistantError ? <p className="form-error">{assistantError}</p> : null}
          <AuraMessageList messages={agentMessages} isSending={isSending} />
          {pendingTasks.map((task) => (
            <AuraTaskApprovalCard key={task.id} task={task} accessToken={accessToken ?? ''} onUpdated={updateTask} />
          ))}
          <AuraComposer
            disabled={isSending}
            onSend={(content) => void sendAgentMessage(content, 'workforce_intelligence' as import('@titan/shared').AgentKey)}
            placeholder="Ask about workforce capacity, timesheets, leave, performance, or payroll exceptions…"
          />
        </Panel>
      ) : null}
    </div>
  );
}
