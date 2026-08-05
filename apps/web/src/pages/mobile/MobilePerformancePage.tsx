import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  TechnicianIntelligencePeriod,
  TechnicianIntelligenceSelfView,
} from '@titan/shared';
import { lifecycleStepLabel } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { WorkforceReportExportActions } from '../../features/reports/WorkforceReportExportActions';
import { useAuth } from '../../lib/auth-context';
import {
  fetchTechnicianSelfView,
  TechnicianIntelligenceApiClientError,
} from '../../lib/technician-intelligence-api-client';

function formatValue(
  value: number | null,
  unavailableLabel = 'Unavailable',
): string {
  return value === null ? unavailableLabel : String(value);
}

export function MobilePerformancePage() {
  const { accessToken } = useAuth();
  const [period, setPeriod] = useState<TechnicianIntelligencePeriod>('weekly');
  const [view, setView] = useState<TechnicianIntelligenceSelfView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        setError(null);
        const data = await fetchTechnicianSelfView(accessToken, period);
        if (!cancelled) setView(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof TechnicianIntelligenceApiClientError
              ? err.message
              : 'Unable to load your performance',
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
  }, [accessToken, period]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Performance"
        description="Your jobs, lifecycle progress, and completion history. Company finances and other technicians stay private."
        actions={
          <select
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            value={period}
            onChange={(e) => setPeriod(e.target.value as TechnicianIntelligencePeriod)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        }
      />

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">{error}</Panel>
      ) : null}

      {isLoading ? (
        <Panel title="Loading">Loading your performance…</Panel>
      ) : view ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="Completed"
              value={formatValue(view.performance.jobsCompleted.value)}
            />
            <StatCard
              label="Assigned"
              value={formatValue(view.performance.jobsAssigned.value)}
            />
            <StatCard
              label="Avg hours"
              value={formatValue(view.performance.averageCompletionHours.value)}
            />
            <StatCard
              label="Travel min"
              value={formatValue(view.performance.averageTravelMinutes.value)}
            />
            <StatCard
              label="Overtime h"
              value={formatValue(view.performance.overtimeHours.value)}
            />
            <StatCard
              label="Callbacks"
              value={formatValue(view.performance.callbacks.value)}
            />
            <StatCard
              label="Rating"
              value={formatValue(view.performance.customerRatingAvg.value)}
            />
            <StatCard
              label="Productivity"
              value={formatValue(view.performance.productivityScore.value)}
            />
          </div>

          {accessToken ? (
            <Panel title="My reports" className="space-y-3 border-slate-800 bg-slate-950/80">
              <p className="text-sm text-slate-400">
                Download your activity, timesheet and productivity reports for the selected period.
              </p>
              <WorkforceReportExportActions
                accessToken={accessToken}
                kind="technician_activity"
                target={{ scope: 'me' }}
              />
              <WorkforceReportExportActions
                accessToken={accessToken}
                kind="technician_timesheet"
                target={{ scope: 'me' }}
              />
              <WorkforceReportExportActions
                accessToken={accessToken}
                kind="technician_productivity"
                target={{ scope: 'me' }}
              />
            </Panel>
          ) : null}

          <Panel title="Assigned jobs" className="space-y-2 border-slate-800 bg-slate-950/80">
            <h2 className="text-sm font-medium yg-text-accent-soft">Assigned jobs</h2>
            {view.assignedJobs.length === 0 ? (
              <EmptyState
                title="No active assigned jobs"
                description="Jobs assigned to you in this period will appear here with lifecycle status."
              />
            ) : (
              <ul className="space-y-2">
                {view.assignedJobs.map((job) => (
                  <li key={job.jobId}>
                    <Link
                      href={`/mobile/jobs/${job.jobId}`}
                      className="block rounded-md border border-slate-800 bg-slate-900/80 px-3 py-2"
                    >
                      <div className="text-sm text-slate-100">
                        {job.jobNumber ? `${job.jobNumber} · ` : ''}
                        {job.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {job.lifecycleStep
                          ? lifecycleStepLabel(job.lifecycleStep)
                          : job.status}
                        {job.customerName ? ` · ${job.customerName}` : ''}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Completion history" className="space-y-2 border-slate-800 bg-slate-950/80">
            <h2 className="text-sm font-medium yg-text-accent-soft">Completion history</h2>
            {view.completionHistory.length === 0 ? (
              <p className="text-sm text-slate-500">No completed jobs in this range.</p>
            ) : (
              <ul className="space-y-2">
                {view.completionHistory.map((item) => (
                  <li
                    key={item.jobId}
                    className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm"
                  >
                    <div className="text-slate-100">
                      {item.jobNumber ? `${item.jobNumber} · ` : ''}
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.completedAt
                        ? new Date(item.completedAt).toLocaleString()
                        : 'Completed time unavailable'}
                      {item.completionHours !== null
                        ? ` · ${item.completionHours}h`
                        : ''}
                      {item.travelMinutes !== null
                        ? ` · travel ${item.travelMinutes}m`
                        : ''}
                      {item.hadCallback ? ' · callback' : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Privacy" className="space-y-1 border-slate-800 text-xs text-slate-500">
            <p>Hidden from this view: company finances, other technicians, owner analytics.</p>
            {view.honestyNotes.slice(0, 3).map((note) => (
              <p key={note}>{note}</p>
            ))}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
