import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  TechnicianAuraInsightSummary,
  TechnicianIntelligenceOwnerOverview,
  TechnicianIntelligencePeriod,
  TechnicianPerformanceMetrics,
} from '@titan/shared';
import { lifecycleStepLabel, TECHNICIAN_LIFECYCLE_FLOW } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { LiveDispatchNav } from '../../features/dispatch/LiveDispatchNav';
import { useAuth } from '../../lib/auth-context';
import {
  decideTechnicianInsight,
  fetchTechnicianInsights,
  fetchTechnicianOwnerOverview,
  generateTechnicianInsights,
  TechnicianIntelligenceApiClientError,
} from '../../lib/technician-intelligence-api-client';

type Tab = 'overview' | 'insights';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('*') ||
    permissions.includes('ops:read') ||
    permissions.includes('ops:manage') ||
    permissions.includes('workforce_intelligence:read') ||
    permissions.includes('dispatch_intelligence:read') ||
    permissions.includes('dispatch:read') ||
    permissions.includes('intelligence:read')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('*') ||
    permissions.includes('ops:manage') ||
    permissions.includes('workforce_intelligence:write') ||
    permissions.includes('workforce_intelligence:manage') ||
    permissions.includes('dispatch_intelligence:write') ||
    permissions.includes('dispatch:write')
  );
}

function formatMetric(
  metric: TechnicianPerformanceMetrics[keyof TechnicianPerformanceMetrics],
): string {
  if (typeof metric === 'string') return metric;
  if (metric.value === null || metric.availability === 'unavailable') {
    return 'Unavailable';
  }
  if (metric.unit === 'hours' || metric.unit === 'minutes' || metric.unit === 'rating') {
    return String(metric.value);
  }
  if (metric.unit === 'percent' || metric.unit === 'score') {
    return `${metric.value}`;
  }
  return String(metric.value);
}

export function TechnicianIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<TechnicianIntelligencePeriod>('weekly');
  const [overview, setOverview] = useState<TechnicianIntelligenceOwnerOverview | null>(null);
  const [insights, setInsights] = useState<TechnicianAuraInsightSummary[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;
    const [overviewData, insightData] = await Promise.all([
      fetchTechnicianOwnerOverview(accessToken, period),
      fetchTechnicianInsights(accessToken),
    ]);
    setOverview(overviewData);
    setInsights(insightData.insights);
    setPendingCount(insightData.pendingCount);
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
            err instanceof TechnicianIntelligenceApiClientError
              ? err.message
              : 'Unable to load Technician Intelligence',
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
  }, [accessToken, canView, period]);

  async function handleGenerate() {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      const bundle = await generateTechnicianInsights(accessToken, { period });
      setInsights(bundle.insights);
      setPendingCount(bundle.pendingCount);
      setSuccess(
        `Generated draft insights from live metrics (${bundle.pendingCount} pending approval). No operational changes executed.`,
      );
      setTab('insights');
    } catch (err) {
      setError(
        err instanceof TechnicianIntelligenceApiClientError
          ? err.message
          : 'Unable to generate insights',
      );
    }
  }

  async function handleDecide(insightId: string, decision: 'approve' | 'reject') {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await decideTechnicianInsight(accessToken, insightId, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Insight approved (acknowledgment only — no auto schedule/dispatch changes).'
          : 'Insight rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof TechnicianIntelligenceApiClientError
          ? err.message
          : 'Unable to decide insight',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <LiveDispatchNav />
        <PageHeader
          title="Technician Intelligence"
          description="Company-scoped technician performance overview for owners and ops."
        />
        <EmptyState
          title="Access restricted"
          description="Technician Intelligence owner analytics require ops, dispatch, or workforce intelligence permissions."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LiveDispatchNav />
      <PageHeader
        title="Technician Intelligence"
        description="Real job lifecycle, timesheet overtime, quality callbacks, and CX ratings — no demo metrics."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              value={period}
              onChange={(e) => setPeriod(e.target.value as TechnicianIntelligencePeriod)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {canManage ? (
              <Button type="button" onClick={() => void handleGenerate()}>
                Generate AURA drafts
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex gap-2">
        {(['overview', 'insights'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === key
                ? 'yg-tab-active'
                : 'bg-slate-900 text-slate-300 ring-1 ring-slate-700'
            }`}
          >
            {key === 'overview' ? 'Overview' : `AURA insights (${pendingCount})`}
          </button>
        ))}
      </div>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">{error}</Panel>
      ) : null}
      {success ? (
        <Panel title="Status" className="yg-panel-accent">{success}</Panel>
      ) : null}

      {isLoading ? (
        <Panel title="Loading">Loading technician intelligence…</Panel>
      ) : tab === 'overview' && overview ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Technicians" value={String(overview.technicianCount)} />
            <StatCard
              label="Jobs completed"
              value={String(overview.companyTotals.jobsCompleted)}
            />
            <StatCard
              label="Callbacks"
              value={String(overview.companyTotals.callbacks)}
            />
            <StatCard
              label="Avg travel (min)"
              value={
                overview.companyTotals.averageTravelMinutes === null
                  ? 'Unavailable'
                  : String(overview.companyTotals.averageTravelMinutes)
              }
            />
          </div>

          <Panel title="Lifecycle tracking" className="space-y-2 border-slate-800 bg-slate-950/80">
            <h2 className="text-sm font-medium yg-text-accent-soft">Lifecycle tracking</h2>
            <p className="text-sm text-slate-400">
              Mapped onto existing field phases — not a separate fake status system.
            </p>
            <div className="flex flex-wrap gap-2">
              {TECHNICIAN_LIFECYCLE_FLOW.map((step) => (
                <span
                  key={step}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                >
                  {lifecycleStepLabel(step)}
                </span>
              ))}
            </div>
          </Panel>

          {overview.technicians.length === 0 ? (
            <EmptyState
              title="No technician job activity in range"
              description="Assign jobs to technicians or widen the period. Metrics are never fabricated."
            />
          ) : (
            <div className="space-y-3">
              {overview.technicians.map((tech) => (
                <Panel key={tech.technicianId} title={tech.technicianName} className="space-y-3 border-slate-800 bg-slate-950/70">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-medium text-slate-100">{tech.technicianName}</h3>
                    <span className="text-xs text-slate-500">
                      Productivity:{' '}
                      {formatMetric(tech.productivityScore)}
                      {tech.productivityScore.availability === 'unavailable'
                        ? ''
                        : ' score'}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 text-sm">
                    <div>
                      <div className="text-slate-500">Completed</div>
                      <div className="text-slate-100">{formatMetric(tech.jobsCompleted)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Assigned</div>
                      <div className="text-slate-100">{formatMetric(tech.jobsAssigned)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Avg completion (h)</div>
                      <div className="text-slate-100">
                        {formatMetric(tech.averageCompletionHours)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Avg travel (min)</div>
                      <div className="text-slate-100">
                        {formatMetric(tech.averageTravelMinutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Overtime (h)</div>
                      <div className="text-slate-100">{formatMetric(tech.overtimeHours)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Callbacks</div>
                      <div className="text-slate-100">{formatMetric(tech.callbacks)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Customer rating</div>
                      <div className="text-slate-100">
                        {formatMetric(tech.customerRatingAvg)}
                      </div>
                    </div>
                  </div>
                  {(
                    [
                      tech.averageTravelMinutes,
                      tech.overtimeHours,
                      tech.customerRatingAvg,
                      tech.averageCompletionHours,
                    ] as const
                  )
                    .filter((m) => m.honestyNote)
                    .slice(0, 2)
                    .map((m) => (
                      <p key={m.honestyNote!} className="text-xs text-slate-500">
                        {m.honestyNote}
                      </p>
                    ))}
                </Panel>
              ))}
            </div>
          )}

          {overview.honestyNotes.length > 0 ? (
            <Panel title="Data honesty" className="space-y-1 border-slate-800">
              <h2 className="text-sm font-medium text-slate-300">Data honesty</h2>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
                {overview.honestyNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : tab === 'insights' ? (
        <div className="space-y-4">
          <Panel title="AURA policy" className="yg-panel-muted text-sm text-slate-300">
            AURA insights are draft/advisory only. Approving records acknowledgment — TITAN never
            auto-reassigns, reschedules, or messages customers from this surface.
          </Panel>
          {insights.length === 0 ? (
            <EmptyState
              title="No insights yet"
              description="Generate drafts from live technician metrics when delay, callback, or overtime signals exist."
            />
          ) : (
            insights.map((insight) => (
              <Panel key={insight.id} title={insight.subject} className="space-y-2 border-slate-800 bg-slate-950/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide yg-text-accent/80">
                      {insight.insightType} · {insight.status}
                    </div>
                    <h3 className="text-base text-slate-100">{insight.subject}</h3>
                  </div>
                  {insight.status === 'pending_approval' && canManage ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleDecide(insight.id, 'reject')}
                      >
                        Reject
                      </Button>
                      <Button type="button" onClick={() => void handleDecide(insight.id, 'approve')}>
                        Approve
                      </Button>
                    </div>
                  ) : null}
                </div>
                <p className="text-sm text-slate-300">{insight.body}</p>
                {insight.supportingSignals.length > 0 ? (
                  <p className="text-xs text-slate-500">
                    Signals: {insight.supportingSignals.join(' · ')}
                  </p>
                ) : null}
              </Panel>
            ))
          )}
          <p className="text-xs text-slate-500">
            Related:{' '}
            <Link href="/dispatch-intelligence" className="yg-link">
              Dispatch Intelligence
            </Link>{' '}
            ·{' '}
            <Link href="/quality" className="yg-link">
              Quality
            </Link>{' '}
            ·{' '}
            <Link href="/workforce-intelligence" className="yg-link">
              Workforce Intelligence
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
