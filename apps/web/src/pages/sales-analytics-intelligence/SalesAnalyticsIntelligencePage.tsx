import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { SaiAuraInsightTarget, SaiOwnerDashboard } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeSaiInsight,
  captureSaiSnapshot,
  createSaiAuraInsight,
  decideSaiInsight,
  fetchSaiDashboard,
  refreshSaiInsights,
  SalesAnalyticsIntelligenceApiClientError,
  updateSaiSettings,
} from '../../lib/sales-analytics-intelligence-api-client';

type Tab = 'dashboard' | 'performance' | 'insights' | 'settings' | 'aura';

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
  if (isOwnerOrAdmin(roleName)) return true;
  return (
    permissions.includes('sales:read') ||
    permissions.includes('sales:write') ||
    permissions.includes('sales_intelligence:read') ||
    permissions.includes('leads:read') ||
    permissions.includes('analytics:read')
  );
}

function formatCents(cents: number | null, currency: string) {
  if (cents === null) return 'Unavailable';
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function formatPercent(value: number | null) {
  if (value === null) return 'Unavailable';
  return `${value}%`;
}

export function SalesAnalyticsIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<SaiOwnerDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] =
    useState<SaiAuraInsightTarget>('command_centre');
  const [settingsNotes, setSettingsNotes] = useState('');
  const [minSample, setMinSample] = useState('5');

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchSaiDashboard(accessToken);
    setDashboard(data);
    setSettingsNotes(data.settings.notes ?? '');
    setMinSample(String(data.settings.minConversionSample));
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
            err instanceof SalesAnalyticsIntelligenceApiClientError
              ? err.message
              : 'Unable to load Sales Analytics Intelligence',
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
        err instanceof SalesAnalyticsIntelligenceApiClientError
          ? err.message
          : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Sales Analytics Intelligence"
          description="Pipeline performance from real CRM, quotes, and opportunities"
        />
        <EmptyState
          title="Access restricted"
          description="Owner or sales/leads permissions are required. Technicians and clients cannot view sales analytics."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'performance', label: 'Performance' },
    { id: 'insights', label: 'Insight drafts' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Sales Analytics Intelligence"
        description="Leads, quotes, conversion, revenue opportunities, and sales performance — real pipeline data only"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/crm" className="yg-link">
          CRM
        </Link>
        <Link href="/leads" className="yg-link">
          Leads
        </Link>
        <Link href="/quotes" className="yg-link">
          Quotes
        </Link>
        <Link href="/jobs" className="yg-link">
          Jobs
        </Link>
        <Link href="/finance-reporting-forecast" className="yg-link">
          Finance
        </Link>
        <Link href="/sales-intelligence-agent" className="yg-link">
          Sales Agent
        </Link>
        <Link href="/sales-followup-intelligence" className="yg-link">
          Sales Follow-up
        </Link>
        <Link href="/sales-intelligence" className="yg-link">
          Sales Intelligence
        </Link>
        <Link href="/dashboard" className="yg-link">
          Executive Dashboard
        </Link>
        <Link href="/aura/command-centre" className="yg-link">
          Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="yg-panel-accent">
        <p className="text-sm">
          Real CRM/quotes/jobs/finance signals only. Conversion rates stay unavailable when sample
          size is insufficient — never invented. AURA insights are recommendations only; no
          automatic outreach.
        </p>
      </Panel>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">
          <p className="text-sm">{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Saved" className="yg-panel-accent">
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
                ? 'yg-tab-active'
                : 'bg-slate-900 text-slate-300 ring-1 ring-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <Panel title="Loading" className="border-slate-800 bg-slate-950/80">
          <p className="text-sm text-slate-400">Loading Sales Analytics Intelligence…</p>
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

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Leads created" value={String(dashboard.metrics.leadsCreated)} />
                <StatCard label="Quotes sent" value={String(dashboard.metrics.quotesSent)} />
                <StatCard
                  label="Quotes accepted"
                  value={String(dashboard.metrics.quotesAccepted)}
                />
                <StatCard
                  label="Conversion rate"
                  value={formatPercent(dashboard.metrics.quoteConversionRatePercent)}
                />
                <StatCard
                  label="Pipeline value"
                  value={formatCents(
                    dashboard.metrics.pipelineValueCents,
                    dashboard.metrics.currency,
                  )}
                />
                <StatCard
                  label="Win rate"
                  value={formatPercent(dashboard.metrics.winRatePercent)}
                />
              </div>

              <Panel title="Metric rationale" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-400">{dashboard.metrics.rationale}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Conversion: {dashboard.metrics.conversionAvailability} · Revenue:{' '}
                  {dashboard.metrics.revenueAvailability}
                </p>
              </Panel>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void withFeedback(
                      () => captureSaiSnapshot(accessToken!),
                      'Analytics snapshot captured from real pipeline data',
                    )
                  }
                >
                  Capture snapshot
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void withFeedback(
                      () => refreshSaiInsights(accessToken!, { submitForApproval: false }),
                      'Insight drafts refreshed (recommendations only)',
                    )
                  }
                >
                  Refresh insights
                </Button>
              </div>

              {dashboard.latestSnapshot ? (
                <Panel title="Latest snapshot" className="border-slate-800 bg-slate-950/80">
                  <p className="text-sm text-slate-300">
                    Captured {new Date(dashboard.latestSnapshot.createdAt).toLocaleString()} —{' '}
                    {dashboard.latestSnapshot.leadsCreated} leads ·{' '}
                    {dashboard.latestSnapshot.quotesSent} sent ·{' '}
                    {dashboard.latestSnapshot.quotesAccepted} accepted
                  </p>
                </Panel>
              ) : (
                <EmptyState
                  title="No snapshots yet"
                  description="Capture a snapshot to store an analytics point-in-time from real pipeline rows."
                />
              )}

              <Panel title="Connections" className="border-slate-800 bg-slate-950/80">
                <ul className="space-y-2 text-sm">
                  {dashboard.connections.map((c) => (
                    <li key={c.target} className="flex flex-wrap items-baseline gap-2">
                      <Link href={c.href} className="yg-link">
                        {c.label}
                      </Link>
                      <span className="text-slate-500">
                        ({c.status} · {c.availability})
                      </span>
                      <span className="text-slate-400">{c.note}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}

          {tab === 'performance' ? (
            <div className="space-y-4">
              <Panel title="Sales performance" className="border-slate-800 bg-slate-950/80">
                <div className="space-y-3">
                  {dashboard.performance.map((row) => (
                    <div
                      key={row.label}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800 pb-2"
                    >
                      <div>
                        <p className="text-sm text-slate-200">{row.label}</p>
                        <p className="text-xs text-slate-500">{row.note}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm yg-text-accent-soft">
                          {row.unit === 'percent'
                            ? formatPercent(row.value)
                            : row.unit === 'cents'
                              ? formatCents(row.value, dashboard.metrics.currency)
                              : row.value === null
                                ? 'Unavailable'
                                : String(row.value)}
                        </p>
                        <p className="text-xs text-slate-500">{row.availability}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Open / won / lost" className="border-slate-800 bg-slate-950/80">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard
                    label="Open opportunities"
                    value={String(dashboard.metrics.openOpportunityCount)}
                  />
                  <StatCard
                    label="Won"
                    value={String(dashboard.metrics.wonOpportunityCount)}
                  />
                  <StatCard
                    label="Lost"
                    value={String(dashboard.metrics.lostOpportunityCount)}
                  />
                </div>
              </Panel>
            </div>
          ) : null}

          {tab === 'insights' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void withFeedback(
                      () => refreshSaiInsights(accessToken!, { submitForApproval: true }),
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
                  description="Refresh insights when real leads/quotes/opportunities exist. Drafts never auto-outreach."
                />
              ) : (
                dashboard.insightDrafts.map((draft) => (
                  <Panel
                    key={draft.id}
                    title={`${draft.kind} · ${draft.status}`}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <p className="text-sm font-medium text-slate-100">{draft.title}</p>
                    <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-400">
                      {draft.body}
                    </pre>
                    {(draft.status === 'draft' || draft.status === 'pending_approval') && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() =>
                            void withFeedback(
                              () =>
                                decideSaiInsight(accessToken!, draft.id, {
                                  decision: 'approve',
                                }),
                              'Insight approved (no outreach sent)',
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            void withFeedback(
                              () =>
                                decideSaiInsight(accessToken!, draft.id, {
                                  decision: 'reject',
                                }),
                              'Insight rejected',
                            )
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </Panel>
                ))
              )}
            </div>
          ) : null}

          {tab === 'settings' ? (
            <Panel title="Settings" className="border-slate-800 bg-slate-950/80">
              <form
                className="space-y-3"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void withFeedback(
                    () =>
                      updateSaiSettings(accessToken!, {
                        insightsEnabled: dashboard.settings.insightsEnabled,
                        minConversionSample: Number(minSample) || 5,
                        notes: settingsNotes || null,
                      }),
                    'Settings saved (invent rates / auto outreach remain off)',
                  );
                }}
              >
                <label className="block text-sm text-slate-300">
                  Min conversion sample
                  <Input
                    value={minSample}
                    onChange={(e) => setMinSample(e.target.value)}
                    className="mt-1 border-slate-700 bg-slate-950 text-slate-100"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Notes
                  <Input
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                    className="mt-1 border-slate-700 bg-slate-950 text-slate-100"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Invent rates: off · Auto outreach: off · Insights enabled:{' '}
                  {dashboard.settings.insightsEnabled ? 'yes' : 'no'}
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
                    void withFeedback(async () => {
                      await createSaiAuraInsight(accessToken!, {
                        target: insightTarget,
                        title: insightTitle,
                        insight: insightBody,
                      });
                      setInsightTitle('');
                      setInsightBody('');
                    }, 'AURA insight draft created (recommendation only)');
                  }}
                >
                  <label className="block text-sm text-slate-300">
                    Target
                    <select
                      value={insightTarget}
                      onChange={(e) =>
                        setInsightTarget(e.target.value as SaiAuraInsightTarget)
                      }
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    >
                      <option value="command_centre">Command Centre</option>
                      <option value="executive_dashboard">Executive Dashboard</option>
                      <option value="sales_intelligence_agent">Sales Agent</option>
                      <option value="sales_followup_intelligence">Sales Follow-up</option>
                      <option value="crm">CRM</option>
                      <option value="quotes">Quotes</option>
                      <option value="jobs">Jobs</option>
                      <option value="finance">Finance</option>
                    </select>
                  </label>
                  <label className="block text-sm text-slate-300">
                    Title
                    <Input
                      value={insightTitle}
                      onChange={(e) => setInsightTitle(e.target.value)}
                      className="mt-1 border-slate-700 bg-slate-950 text-slate-100"
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Insight
                    <textarea
                      value={insightBody}
                      onChange={(e) => setInsightBody(e.target.value)}
                      rows={4}
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                  </label>
                  <Button type="submit">Create handoff</Button>
                </form>
              </Panel>

              {dashboard.auraInsights.length === 0 ? (
                <EmptyState
                  title="No AURA insights"
                  description="Refresh insights or create a handoff. Never auto-outreach."
                />
              ) : (
                dashboard.auraInsights.map((insight) => (
                  <Panel
                    key={insight.id}
                    title={`${insight.target} · ${insight.status}`}
                    className="border-slate-800 bg-slate-950/80"
                  >
                    <p className="text-sm font-medium text-slate-100">{insight.title}</p>
                    <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-400">
                      {insight.insight}
                    </pre>
                    {insight.href ? (
                      <Link href={insight.href} className="mt-2 yg-link inline-block">
                        Open link
                      </Link>
                    ) : null}
                    {insight.status === 'open' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() =>
                            void withFeedback(
                              () =>
                                acknowledgeSaiInsight(accessToken!, insight.id, {
                                  status: 'acknowledged',
                                }),
                              'Insight acknowledged',
                            )
                          }
                        >
                          Acknowledge
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            void withFeedback(
                              () =>
                                acknowledgeSaiInsight(accessToken!, insight.id, {
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
                ))
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
