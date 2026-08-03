import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { PtiAuraInsightTarget, PtiOwnerDashboard } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgePtiInsight,
  createPtiAuraInsight,
  decidePtiInsight,
  fetchPtiDashboard,
  PayrollTimesheetIntelligenceApiClientError,
  refreshPtiInsights,
  updatePtiSettings,
} from '../../lib/payroll-timesheet-intelligence-api-client';

type Tab = 'dashboard' | 'hours' | 'payroll' | 'insights' | 'settings' | 'aura';

function isOwnerOrAdmin(roleName: string | undefined) {
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  if (permissions.includes('*')) return true;
  return isOwnerOrAdmin(roleName);
}

export function PayrollTimesheetIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<PtiOwnerDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] =
    useState<PtiAuraInsightTarget>('command_centre');
  const [settingsNotes, setSettingsNotes] = useState('');
  const [weeklyHours, setWeeklyHours] = useState('40');
  const [otThreshold, setOtThreshold] = useState('8');

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchPtiDashboard(accessToken);
    setDashboard(data);
    setSettingsNotes(data.settings.notes ?? '');
    setWeeklyHours(String(data.settings.standardWeeklyHours));
    setOtThreshold(String(data.settings.overtimeDailyThresholdHours));
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        setError(null);
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof PayrollTimesheetIntelligenceApiClientError
              ? err.message
              : 'Unable to load Payroll & Timesheet Intelligence',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function withFeedback(action: () => Promise<unknown>, ok: string) {
    try {
      setError(null);
      setSuccess(null);
      await action();
      await loadPage();
      setSuccess(ok);
    } catch (err) {
      setError(
        err instanceof PayrollTimesheetIntelligenceApiClientError
          ? err.message
          : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Payroll & Timesheet Intelligence"
          description="Labour hours and payroll prep insights"
        />
        <EmptyState
          title="Access restricted"
          description="Owner or Admin access is required for sensitive payroll intelligence. Technicians may use their own timesheet self-view via the API when enabled — never peer payroll."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'hours', label: 'Hours & attendance' },
    { id: 'payroll', label: 'Payroll & cost' },
    { id: 'insights', label: 'Insight drafts' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Payroll & Timesheet Intelligence"
        description="Real hours, overtime, attendance, approval backlog, and honest labour-cost availability — extending Workforce timesheets"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/workforce-intelligence" className="text-cyan-300 hover:underline">
          Workforce timesheets
        </Link>
        <Link href="/hr-employee-intelligence" className="text-cyan-300 hover:underline">
          Employee Intelligence
        </Link>
        <Link href="/technician-intelligence" className="text-cyan-300 hover:underline">
          Technician Intelligence
        </Link>
        <Link href="/scheduling" className="text-cyan-300 hover:underline">
          Scheduling
        </Link>
        <Link href="/jobs" className="text-cyan-300 hover:underline">
          Jobs
        </Link>
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
        <p className="text-sm">
          No invented wages. No automatic payroll mutation. Sensitive payroll is Owner/Admin only.
          Labour cost stays unavailable without a stored hourly rate. Timesheet approve/correct
          remains under Workforce Intelligence — this layer drafts insights only.
        </p>
      </Panel>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">
          <p className="text-sm">{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Saved" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
          <p className="text-sm">{success}</p>
        </Panel>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.id
                ? 'bg-cyan-700/40 text-cyan-100 ring-1 ring-cyan-500/50'
                : 'bg-slate-900 text-slate-300 ring-1 ring-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <Panel title="Loading" className="border-slate-800 bg-slate-950/80">
          <p className="text-sm text-slate-400">Loading Payroll & Timesheet Intelligence…</p>
        </Panel>
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-4">
              <Panel title="Summary" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {dashboard.productClarification.thisLayer}
                </p>
              </Panel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Hours availability"
                  value={dashboard.hours.availability === 'unavailable' ? 'n/a' : dashboard.hours.availability}
                />
                <StatCard
                  label="Timesheets"
                  value={
                    dashboard.hours.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.hours.timesheetCount)
                  }
                />
                <StatCard
                  label="Overtime hours"
                  value={
                    dashboard.hours.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.hours.totalOvertimeHours)
                  }
                />
                <StatCard
                  label="Pending approvals"
                  value={String(dashboard.hours.pendingApprovalCount)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Labour cost"
                  value={
                    dashboard.labourCost.labourCostCents === null
                      ? 'unavailable'
                      : String(dashboard.labourCost.labourCostCents)
                  }
                />
                <StatCard
                  label="Payroll periods"
                  value={
                    dashboard.payrollSummary.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.payrollSummary.periodCount)
                  }
                />
                <StatCard
                  label="Cost forecast"
                  value={
                    dashboard.costForecast.forecastLabourCostCents === null
                      ? 'hours-only / n/a'
                      : String(dashboard.costForecast.forecastLabourCostCents)
                  }
                />
              </div>
              <Panel title="Honesty notes" className="border-slate-800 bg-slate-950/80">
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
                  <li>{dashboard.hours.rationale}</li>
                  <li>{dashboard.labourCost.rationale}</li>
                  <li>{dashboard.payrollSummary.rationale}</li>
                  <li>{dashboard.costForecast.rationale}</li>
                </ul>
              </Panel>
              <Panel title="Connections" className="border-slate-800 bg-slate-950/80">
                <ul className="space-y-2 text-sm">
                  {dashboard.connections.map((c) => (
                    <li key={c.target} className="flex flex-wrap items-baseline gap-2">
                      <Link href={c.href} className="text-cyan-300 hover:underline">
                        {c.label}
                      </Link>
                      <span className="text-slate-500">
                        [{c.availability}] {c.note}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}

          {tab === 'hours' ? (
            <div className="space-y-4">
              <Panel title="Employee hours" className="border-slate-800 bg-slate-950/80">
                {dashboard.employeeHours.length === 0 ? (
                  <EmptyState
                    title="No hours yet"
                    description="Hours stay unavailable until real timesheets exist — not invented."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="py-2 pr-4">Employee</th>
                          <th className="py-2 pr-4">Standard</th>
                          <th className="py-2 pr-4">OT</th>
                          <th className="py-2 pr-4">Travel</th>
                          <th className="py-2 pr-4">Submitted</th>
                          <th className="py-2 pr-4">Approved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.employeeHours.map((row) => (
                          <tr key={row.userId} className="border-t border-slate-800">
                            <td className="py-2 pr-4">{row.userName ?? row.userId}</td>
                            <td className="py-2 pr-4">{row.standardHours}</td>
                            <td className="py-2 pr-4">{row.overtimeHours}</td>
                            <td className="py-2 pr-4">{row.travelHours}</td>
                            <td className="py-2 pr-4">{row.submittedCount}</td>
                            <td className="py-2 pr-4">{row.approvedCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
              <Panel title="Attendance" className="border-slate-800 bg-slate-950/80">
                {dashboard.attendance.length === 0 ? (
                  <p className="text-sm text-slate-500">No attendance signals from timesheets.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.attendance.map((a) => (
                      <li key={a.userId}>
                        <span className="text-cyan-200">{a.userName ?? a.userId}</span> — in{' '}
                        {a.clockInCount} / out {a.clockOutCount}; incomplete{' '}
                        {a.incompleteClockPairs}. {a.rationale}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Job time" className="border-slate-800 bg-slate-950/80">
                {dashboard.jobTime.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No job-linked timesheets or mobile time entries yet.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.jobTime.slice(0, 20).map((j) => (
                      <li key={j.jobId}>
                        Job {j.jobId.slice(0, 8)}… — {j.totalMinutes} min (
                        {j.timesheetMinutes} timesheet / {j.mobileEntryMinutes} mobile)
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'payroll' ? (
            <div className="space-y-4">
              <Panel title="Labour cost" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">
                  Availability: {dashboard.labourCost.availability}. Minutes:{' '}
                  {dashboard.labourCost.labourMinutes}. Cost cents:{' '}
                  {dashboard.labourCost.labourCostCents ?? 'null'}.
                </p>
                <p className="mt-2 text-xs text-slate-500">{dashboard.labourCost.rationale}</p>
              </Panel>
              <Panel title="Payroll prep summary" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">
                  Periods: {dashboard.payrollSummary.periodCount}. Batches:{' '}
                  {dashboard.payrollSummary.batchCount}. Exported:{' '}
                  {dashboard.payrollSummary.exportedBatchCount}. Earnings cents:{' '}
                  {dashboard.payrollSummary.earningsTotalCents ?? 'n/a'}.
                </p>
                <p className="mt-2 text-xs text-slate-500">{dashboard.payrollSummary.rationale}</p>
              </Panel>
              <Panel title="Cost forecasting" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">
                  Recent week hours: {dashboard.costForecast.recentWeekHours}. Prior:{' '}
                  {dashboard.costForecast.priorWeekHours}. Trend %:{' '}
                  {dashboard.costForecast.hoursTrendPercent ?? 'n/a'}. Forecast cost:{' '}
                  {dashboard.costForecast.forecastLabourCostCents ?? 'unavailable'}.
                </p>
                <p className="mt-2 text-xs text-slate-500">{dashboard.costForecast.rationale}</p>
              </Panel>
            </div>
          ) : null}

          {tab === 'insights' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    void withFeedback(
                      () => refreshPtiInsights(accessToken!, { submitForApproval: false }),
                      'Insight drafts refreshed from real hours',
                    )
                  }
                >
                  Refresh drafts
                </Button>
                <Button
                  onClick={() =>
                    void withFeedback(
                      () => refreshPtiInsights(accessToken!, { submitForApproval: true }),
                      'Insight drafts submitted for Owner approval',
                    )
                  }
                >
                  Refresh & submit for approval
                </Button>
              </div>
              {dashboard.insightDrafts.length === 0 ? (
                <EmptyState
                  title="No insight drafts"
                  description="Refresh to generate drafts from real timesheet/payroll signals. Nothing is invented."
                />
              ) : (
                <ul className="space-y-3">
                  {dashboard.insightDrafts.map((draft) => (
                    <Panel
                      key={draft.id}
                      title={`${draft.kind} · ${draft.status}`}
                      className="border-slate-800 bg-slate-950/80"
                    >
                      <p className="text-sm font-medium text-cyan-100">{draft.title}</p>
                      <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-400">
                        {draft.body}
                      </pre>
                      {(draft.status === 'draft' || draft.status === 'pending_approval') && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decidePtiInsight(accessToken!, draft.id, {
                                    decision: 'approve',
                                  }),
                                'Insight approved (no payroll mutation)',
                              )
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decidePtiInsight(accessToken!, draft.id, {
                                    decision: 'reject',
                                  }),
                                'Insight rejected',
                              )
                            }
                          >
                            Reject
                          </Button>
                          <Button
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decidePtiInsight(accessToken!, draft.id, {
                                    decision: 'acknowledge',
                                  }),
                                'Insight acknowledged',
                              )
                            }
                          >
                            Acknowledge
                          </Button>
                        </div>
                      )}
                    </Panel>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'settings' ? (
            <Panel title="Owner settings" className="border-slate-800 bg-slate-950/80">
              <form
                className="space-y-3"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void withFeedback(
                    () =>
                      updatePtiSettings(accessToken!, {
                        insightsEnabled: dashboard.settings.insightsEnabled,
                        selfTimesheetViewEnabled: dashboard.settings.selfTimesheetViewEnabled,
                        standardWeeklyHours: Number(weeklyHours) || 40,
                        overtimeDailyThresholdHours: Number(otThreshold) || 8,
                        notes: settingsNotes || null,
                      }),
                    'Settings saved (wages still never invented)',
                  );
                }}
              >
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={dashboard.settings.insightsEnabled}
                    onChange={(e) =>
                      void withFeedback(
                        () =>
                          updatePtiSettings(accessToken!, {
                            insightsEnabled: e.target.checked,
                          }),
                        'Insights setting updated',
                      )
                    }
                  />
                  Insight drafts enabled
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={dashboard.settings.selfTimesheetViewEnabled}
                    onChange={(e) =>
                      void withFeedback(
                        () =>
                          updatePtiSettings(accessToken!, {
                            selfTimesheetViewEnabled: e.target.checked,
                          }),
                        'Self timesheet view setting updated',
                      )
                    }
                  />
                  Technician self timesheet view (own hours only)
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-400">
                    Standard weekly hours (insight policy)
                    <Input
                      value={weeklyHours}
                      onChange={(e) => setWeeklyHours(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                  <label className="block text-sm text-slate-400">
                    Daily OT threshold hours (insight policy)
                    <Input
                      value={otThreshold}
                      onChange={(e) => setOtThreshold(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                </div>
                <label className="block text-sm text-slate-400">
                  Notes
                  <Input
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                    className="mt-1"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  inventWagesEnabled={String(dashboard.settings.inventWagesEnabled)} ·
                  autoPayrollMutationEnabled=
                  {String(dashboard.settings.autoPayrollMutationEnabled)}
                </p>
                <Button type="submit">Save settings</Button>
              </form>
            </Panel>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="Create AURA insight handoff" className="border-slate-800 bg-slate-950/80">
                <form
                  className="space-y-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void withFeedback(
                      () =>
                        createPtiAuraInsight(accessToken!, {
                          target: insightTarget,
                          title: insightTitle,
                          insight: insightBody,
                        }),
                      'AURA insight created',
                    ).then(() => {
                      setInsightTitle('');
                      setInsightBody('');
                    });
                  }}
                >
                  <label className="block text-sm text-slate-400">
                    Target
                    <select
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                      value={insightTarget}
                      onChange={(e) =>
                        setInsightTarget(e.target.value as PtiAuraInsightTarget)
                      }
                    >
                      {[
                        'command_centre',
                        'executive_dashboard',
                        'hr_employee_intelligence',
                        'workforce_intelligence',
                        'technician_intelligence',
                        'scheduling',
                        'jobs',
                        'payroll',
                        'timesheets',
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-400">
                    Title
                    <Input
                      value={insightTitle}
                      onChange={(e) => setInsightTitle(e.target.value)}
                      className="mt-1"
                    />
                  </label>
                  <label className="block text-sm text-slate-400">
                    Insight
                    <textarea
                      value={insightBody}
                      onChange={(e) => setInsightBody(e.target.value)}
                      className="mt-1 min-h-[100px] w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </label>
                  <Button type="submit">Create handoff</Button>
                </form>
              </Panel>
              {dashboard.auraInsights.map((insight) => (
                <Panel
                  key={insight.id}
                  title={`${insight.target} · ${insight.status}`}
                  className="border-slate-800 bg-slate-950/80"
                >
                  <p className="text-sm font-medium text-cyan-100">{insight.title}</p>
                  <p className="mt-2 text-sm text-slate-400">{insight.insight}</p>
                  {insight.status === 'open' ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        onClick={() =>
                          void withFeedback(
                            () =>
                              acknowledgePtiInsight(accessToken!, insight.id, {
                                status: 'acknowledged',
                              }),
                            'Insight acknowledged',
                          )
                        }
                      >
                        Acknowledge
                      </Button>
                      <Button
                        onClick={() =>
                          void withFeedback(
                            () =>
                              acknowledgePtiInsight(accessToken!, insight.id, {
                                status: 'dismissed',
                              }),
                            'Insight dismissed',
                          )
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
