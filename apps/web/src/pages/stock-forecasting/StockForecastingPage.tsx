import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { SfDashboard, SfInsightTarget } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeSfInsight,
  createSfAuraInsight,
  decideSfRecommendation,
  fetchSfDashboard,
  refreshSfForecasts,
  StockForecastingApiClientError,
  updateSfSettings,
} from '../../lib/stock-forecasting-api-client';

type Tab = 'dashboard' | 'forecasts' | 'recommendations' | 'trends' | 'settings' | 'aura';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('inventory:read') ||
    permissions.includes('inventory:write') ||
    permissions.includes('procurement:read') ||
    permissions.includes('procurement:write') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    permissions.includes('inventory:write') ||
    permissions.includes('procurement:write')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner';
}

export function StockForecastingPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<SfDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] =
    useState<SfInsightTarget>('inventory_intelligence');
  const [settingsNotes, setSettingsNotes] = useState('');
  const [minIssueEvents, setMinIssueEvents] = useState('3');
  const [windowDays, setWindowDays] = useState('30');

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canWrite(user.permissions, user.roleName) : false),
    [user],
  );
  const canOwnerApprove = useMemo(
    () => (user ? canApprove(user.permissions, user.roleName) : false),
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchSfDashboard(accessToken);
    setDashboard(data);
    setSettingsNotes(data.settings.notes ?? '');
    setMinIssueEvents(String(data.settings.minIssueEvents));
    setWindowDays(String(data.settings.windowDays));
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
            err instanceof StockForecastingApiClientError
              ? err.message
              : 'Unable to load Stock Forecasting',
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

  async function withFeedback(action: () => Promise<void>, ok: string) {
    try {
      setError(null);
      setSuccess(null);
      await action();
      await loadPage();
      setSuccess(ok);
    } catch (err) {
      setError(err instanceof StockForecastingApiClientError ? err.message : 'Action failed');
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Stock Forecasting"
          description="Demand, shortage risk, and Owner-gated reorder recommendations"
        />
        <EmptyState
          title="Access restricted"
          description="Inventory or procurement permissions are required. Technicians and clients cannot access this forecasting surface."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'forecasts', label: 'Forecasts' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'trends', label: 'Usage trends' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Stock Forecasting"
        description="Material demand, shortage risk, and reorder timing from real movements — recommendations only"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/inventory-intelligence" className="text-cyan-300 hover:underline">
          Inventory Intelligence
        </Link>
        <Link href="/procurement-intelligence" className="text-cyan-300 hover:underline">
          Procurement Intelligence
        </Link>
        <Link href="/inventory/stock" className="text-cyan-300 hover:underline">
          Stock overview
        </Link>
        <Link href="/procurement" className="text-cyan-300 hover:underline">
          Procurement
        </Link>
        <Link href="/recurring-maintenance" className="text-cyan-300 hover:underline">
          Maintenance
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
          Recommendations only. No automatic purchasing or reordering. Forecasts stay unavailable
          when issue/waste history is insufficient — demand is never invented. Assumptions are
          always explained. Owner approval required.
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
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <Panel title="Loading">
          <p className="text-sm text-slate-300">Loading stock forecasting…</p>
        </Panel>
      ) : null}

      {!isLoading && dashboard && tab === 'dashboard' ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">{dashboard.summary}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Forecast status" value={dashboard.forecast.availability} />
            <StatCard label="Forecastable items" value={String(dashboard.forecast.forecastableCount)} />
            <StatCard label="High shortage risk" value={String(dashboard.forecast.highRiskCount)} />
            <StatCard label="Pending approvals" value={String(dashboard.pendingApprovals)} />
          </div>
          <Panel title="Connections" className="border-slate-700 bg-slate-900/60">
            <ul className="space-y-2 text-sm text-slate-300">
              {dashboard.auraConnections.map((c) => (
                <li key={c.target}>
                  <Link href={c.href} className="text-cyan-300 hover:underline">
                    {c.label}
                  </Link>
                  <span className="text-slate-500"> — {c.note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              Active maintenance plans: {dashboard.maintenancePlanCount}. Suppliers linked:{' '}
              {dashboard.supplierLinkCount}.
            </p>
          </Panel>
          <Panel title="Product clarification" className="border-slate-700 bg-slate-900/60">
            <ul className="space-y-1 text-sm text-slate-300">
              <li>{dashboard.productClarification.inventoryOps}</li>
              <li>{dashboard.productClarification.inventoryIntelligence}</li>
              <li>{dashboard.productClarification.procurementIntelligence}</li>
              <li>{dashboard.productClarification.thisLayer}</li>
            </ul>
          </Panel>
          {canManage ? (
            <Button
              onClick={() =>
                void withFeedback(
                  async () => {
                    if (!accessToken) return;
                    await refreshSfForecasts(accessToken, {
                      submitRecommendationsForApproval: false,
                    });
                  },
                  'Forecasts refreshed from real movements (draft recommendations only).',
                )
              }
            >
              Refresh forecasts
            </Button>
          ) : null}
        </div>
      ) : null}

      {!isLoading && dashboard && tab === 'forecasts' ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">{dashboard.forecast.rationale}</p>
          {dashboard.itemForecasts.length === 0 ? (
            <EmptyState
              title="No forecasts yet"
              description="Refresh forecasts after real issue/waste movements exist. Unavailable when history is insufficient."
            />
          ) : (
            dashboard.itemForecasts.map((f) => (
              <Panel
                key={f.id}
                title={`${f.sku} — ${f.name}`}
                className="border-slate-700 bg-slate-900/60"
              >
                <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                  <p>Availability: {f.availability}</p>
                  <p>Shortage risk: {f.shortageRisk}</p>
                  <p>On-hand: {f.quantityOnHand}</p>
                  <p>Reorder level: {f.reorderLevel}</p>
                  <p>Avg daily demand: {f.avgDailyDemand ?? 'unavailable'}</p>
                  <p>Days of cover: {f.projectedDaysOfCover ?? 'unavailable'}</p>
                  <p>Suggested qty: {f.suggestedReorderQty ?? '—'}</p>
                  <p>Order by: {f.suggestedReorderBy ?? '—'}</p>
                  <p>Trend: {f.trend}</p>
                  <p>Job-linked consumption: {f.jobLinkedConsumption}</p>
                  <p>
                    Seasonal: {f.seasonal.availability}
                    {f.seasonal.availability === 'available'
                      ? ` · ${f.seasonal.direction} (${f.seasonal.method})`
                      : ''}
                  </p>
                </div>
                <p className="mt-2 text-sm text-slate-400">{f.rationale}</p>
                <p className="mt-1 text-sm text-slate-500">{f.seasonal.rationale}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
                  {f.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </Panel>
            ))
          )}
        </div>
      ) : null}

      {!isLoading && dashboard && tab === 'recommendations' ? (
        <div className="space-y-3">
          {canManage ? (
            <Button
              onClick={() =>
                void withFeedback(
                  async () => {
                    if (!accessToken) return;
                    await refreshSfForecasts(accessToken, {
                      submitRecommendationsForApproval: true,
                    });
                  },
                  'Forecasts refreshed; recommendations submitted for Owner approval.',
                )
              }
            >
              Refresh & submit for approval
            </Button>
          ) : null}
          {dashboard.recommendations.length === 0 ? (
            <EmptyState
              title="No reorder recommendations"
              description="Recommendations appear when forecasts show watch/high risk from real consumption. Never auto-purchased."
            />
          ) : (
            dashboard.recommendations.map((r) => (
              <Panel key={r.id} title={r.title} className="border-slate-700 bg-slate-900/60">
                <p className="text-xs text-cyan-300">
                  {r.kind} · {r.status}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{r.body}</p>
                <div className="mt-2 space-y-1 text-sm text-slate-400">
                  <p>
                    <span className="text-slate-500">What:</span> {r.whatToBuy}
                  </p>
                  <p>
                    <span className="text-slate-500">When:</span> {r.whenToBuy}
                  </p>
                  <p>
                    <span className="text-slate-500">Expected usage:</span> {r.expectedUsage}
                  </p>
                  <p>
                    <span className="text-slate-500">Why:</span> {r.whyNeeded}
                  </p>
                  {r.draftPurchaseOrderId ? (
                    <p>
                      <span className="text-slate-500">Draft PO:</span>{' '}
                      <Link
                        href={`/procurement/purchase-orders/${r.draftPurchaseOrderId}`}
                        className="text-cyan-300 hover:underline"
                      >
                        {r.draftPurchaseOrderId}
                      </Link>{' '}
                      (not ordered)
                    </p>
                  ) : null}
                </div>
                {canOwnerApprove &&
                (r.status === 'draft' ||
                  r.status === 'pending_approval' ||
                  r.status === 'approved') ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(r.status === 'draft' || r.status === 'pending_approval') && (
                      <Button
                        onClick={() =>
                          void withFeedback(
                            async () => {
                              if (!accessToken) return;
                              await decideSfRecommendation(accessToken, r.id, {
                                decision: 'approve',
                              });
                            },
                            'Recommendation approved (still no auto-purchase).',
                          )
                        }
                      >
                        Approve
                      </Button>
                    )}
                    <Button
                      onClick={() =>
                        void withFeedback(
                          async () => {
                            if (!accessToken) return;
                            await decideSfRecommendation(accessToken, r.id, {
                              decision: 'accept',
                              createDraftPurchaseOrder: Boolean(r.supplierId),
                            });
                          },
                          r.supplierId
                            ? 'Accepted — draft PO created if supplier linked (never ordered).'
                            : 'Accepted without draft PO (no linked supplier).',
                        )
                      }
                    >
                      Accept{r.supplierId ? ' + draft PO' : ''}
                    </Button>
                    <Button
                      onClick={() =>
                        void withFeedback(
                          async () => {
                            if (!accessToken) return;
                            await decideSfRecommendation(accessToken, r.id, {
                              decision: 'reject',
                            });
                          },
                          'Recommendation rejected.',
                        )
                      }
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </Panel>
            ))
          )}
        </div>
      ) : null}

      {!isLoading && dashboard && tab === 'trends' ? (
        <div className="space-y-3">
          {dashboard.usageTrends.length === 0 ? (
            <EmptyState
              title="No usage trend points"
              description="Trends appear from real issue/waste movements in the lookback window."
            />
          ) : (
            <Panel title="Daily consumption (real issues/waste)" className="border-slate-700 bg-slate-900/60">
              <ul className="space-y-1 text-sm text-slate-300">
                {dashboard.usageTrends.map((p) => (
                  <li key={p.day}>
                    {p.day}: {p.consumed} unit(s)
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      ) : null}

      {!isLoading && dashboard && tab === 'settings' ? (
        <Panel title="Owner settings" className="border-slate-700 bg-slate-900/60">
          {!canOwnerApprove ? (
            <p className="text-sm text-slate-400">
              Only Company Owner may change forecasting settings. Auto-reorder and auto-purchase
              remain permanently off.
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void withFeedback(async () => {
                  if (!accessToken) return;
                  await updateSfSettings(accessToken, {
                    forecastingEnabled: dashboard.settings.forecastingEnabled,
                    recommendationsEnabled: dashboard.settings.recommendationsEnabled,
                    minIssueEvents: Number(minIssueEvents) || 3,
                    windowDays: Number(windowDays) || 30,
                    notes: settingsNotes || null,
                  });
                }, 'Settings saved (auto-reorder/purchase remain false).');
              }}
            >
              <label className="block text-sm text-slate-300">
                Min issue events
                <Input
                  value={minIssueEvents}
                  onChange={(e) => setMinIssueEvents(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Window days
                <Input
                  value={windowDays}
                  onChange={(e) => setWindowDays(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Notes
                <Input
                  value={settingsNotes}
                  onChange={(e) => setSettingsNotes(e.target.value)}
                  className="mt-1"
                />
              </label>
              <p className="text-xs text-slate-500">
                autoReorderEnabled=false · autoPurchaseEnabled=false (invariants)
              </p>
              <Button type="submit">Save settings</Button>
            </form>
          )}
        </Panel>
      ) : null}

      {!isLoading && dashboard && tab === 'aura' ? (
        <div className="space-y-4">
          {canManage ? (
            <Panel title="Create AURA insight handoff" className="border-slate-700 bg-slate-900/60">
              <form
                className="space-y-3"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void withFeedback(async () => {
                    if (!accessToken) return;
                    await createSfAuraInsight(accessToken, {
                      target: insightTarget,
                      title: insightTitle,
                      insight: insightBody,
                    });
                    setInsightTitle('');
                    setInsightBody('');
                  }, 'AURA insight created for Owner review.');
                }}
              >
                <label className="block text-sm text-slate-300">
                  Target
                  <select
                    className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2"
                    value={insightTarget}
                    onChange={(e) => setInsightTarget(e.target.value as SfInsightTarget)}
                  >
                    <option value="inventory_intelligence">Inventory Intelligence</option>
                    <option value="procurement_intelligence">Procurement Intelligence</option>
                    <option value="command_centre">Command Centre</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="jobs">Jobs</option>
                    <option value="procurement">Procurement</option>
                    <option value="inventory">Inventory</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-300">
                  Title
                  <Input
                    value={insightTitle}
                    onChange={(e) => setInsightTitle(e.target.value)}
                    className="mt-1"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Insight
                  <Input
                    value={insightBody}
                    onChange={(e) => setInsightBody(e.target.value)}
                    className="mt-1"
                  />
                </label>
                <Button type="submit">Create insight</Button>
              </form>
            </Panel>
          ) : null}
          {dashboard.auraInsights.length === 0 ? (
            <EmptyState
              title="No AURA insights"
              description="Create handoffs from real forecast signals only."
            />
          ) : (
            dashboard.auraInsights.map((insight) => (
              <Panel key={insight.id} title={insight.title} className="border-slate-700 bg-slate-900/60">
                <p className="text-xs text-cyan-300">
                  {insight.target} · {insight.status}
                </p>
                <p className="mt-2 text-sm text-slate-300">{insight.insight}</p>
                {canManage && insight.status === 'open' ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      onClick={() =>
                        void withFeedback(
                          async () => {
                            if (!accessToken) return;
                            await acknowledgeSfInsight(accessToken, insight.id, {
                              status: 'acknowledged',
                            });
                          },
                          'Insight acknowledged.',
                        )
                      }
                    >
                      Acknowledge
                    </Button>
                    <Button
                      onClick={() =>
                        void withFeedback(
                          async () => {
                            if (!accessToken) return;
                            await acknowledgeSfInsight(accessToken, insight.id, {
                              status: 'dismissed',
                            });
                          },
                          'Insight dismissed.',
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
    </div>
  );
}
