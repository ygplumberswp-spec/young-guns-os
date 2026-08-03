import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type {
  FarAuraConnection,
  FarAuraInsightSummary,
  FarAuraInsightTarget,
  FarCostSignal,
  FarDashboard,
  FarMaintenanceSignal,
  FarRecommendationDraftSummary,
  FarUsageSignal,
  FarVehicleSignal,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeFarInsight,
  createFarAuraInsight,
  decideFarRecommendation,
  fetchFarDashboard,
  FleetAiRecommendationsApiClientError,
  refreshFarRecommendations,
  updateFarSettings,
} from '../../lib/fleet-ai-recommendations-api-client';

type Tab = 'dashboard' | 'signals' | 'recommendations' | 'settings' | 'aura';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  if (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  ) {
    return true;
  }
  return (
    permissions.includes('*') ||
    permissions.includes('fleet:read') ||
    permissions.includes('fleet:write') ||
    permissions.includes('fleet_intelligence:read') ||
    permissions.includes('fleet_intelligence:write') ||
    permissions.includes('agents:read')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  if (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  ) {
    return true;
  }
  return (
    permissions.includes('*') ||
    permissions.includes('fleet:write') ||
    permissions.includes('fleet_intelligence:write')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

export function FleetAiRecommendationsPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<FarDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] = useState<FarAuraInsightTarget>('command_centre');
  const [settingsNotes, setSettingsNotes] = useState('');

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
    const data = await fetchFarDashboard(accessToken);
    setDashboard(data);
    setSettingsNotes(data.settings.notes ?? '');
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
            err instanceof FleetAiRecommendationsApiClientError
              ? err.message
              : 'Unable to load Fleet AI Recommendations',
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
        err instanceof FleetAiRecommendationsApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Fleet AI Recommendations"
          description="Owner-gated fleet optimisation drafts"
        />
        <EmptyState
          title="Access restricted"
          description="Owner/Admin or fleet permissions are required. Technicians and clients cannot access this surface."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'signals', label: 'Signals' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Fleet AI Recommendations"
        description="AURA optimisation drafts from real Cartrack, vehicles, jobs, costs, and maintenance — recommendations only"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/fleet" className="text-cyan-300 hover:underline">
          Fleet
        </Link>
        <Link href="/fleet-intelligence" className="text-cyan-300 hover:underline">
          Fleet Intelligence
        </Link>
        <Link href="/vehicle-intelligence" className="text-cyan-300 hover:underline">
          Vehicle Intelligence
        </Link>
        <Link href="/driver-intelligence" className="text-cyan-300 hover:underline">
          Driver Intelligence
        </Link>
        <Link href="/integrations/cartrack" className="text-cyan-300 hover:underline">
          Cartrack
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
          Recommendations only. No automatic assign, sell, replace, or maintenance execute. GPS and
          costs are never invented — unavailable when Cartrack or records are missing. Owner/Admin
          approval required for drafts.
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
          <p className="text-sm text-slate-400">Loading Fleet AI Recommendations…</p>
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
                <StatCard label="Vehicles" value={String(dashboard.totalVehicles)} />
                <StatCard
                  label="Cartrack"
                  value={
                    dashboard.cartrack.availability === 'available' ? 'available' : 'unavailable'
                  }
                />
                <StatCard
                  label="Costs"
                  value={dashboard.costs.availability === 'available' ? 'available' : 'unavailable'}
                />
                <StatCard
                  label="Maintenance"
                  value={
                    dashboard.maintenance.availability === 'available'
                      ? 'available'
                      : 'unavailable'
                  }
                />
                <StatCard
                  label="Usage / routes"
                  value={dashboard.usage.availability === 'available' ? 'available' : 'unavailable'}
                />
                <StatCard label="Pending drafts" value={String(dashboard.pendingApprovals)} />
              </div>
              <Panel title="Cartrack" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.cartrack.rationale}</p>
              </Panel>
              <Panel title="Efficiency" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.efficiency.rationale}</p>
              </Panel>
            </div>
          ) : null}

          {tab === 'signals' ? (
            <div className="space-y-4">
              <Panel title="Vehicle signals" className="border-slate-800 bg-slate-950/80">
                {dashboard.vehicleSignals.length === 0 ? (
                  <EmptyState
                    title="No vehicles"
                    description="Signals stay empty until real fleet vehicles exist — not invented."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.vehicleSignals.map((v: FarVehicleSignal) => (
                      <li key={v.vehicleId} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {v.name} · {v.licensePlate}
                        </div>
                        <div className="text-xs text-slate-500">
                          {v.status}
                          {v.assignedUserName ? ` · ${v.assignedUserName}` : ' · unassigned'}
                          {v.cartrackMapped ? ' · Cartrack mapped' : ' · not mapped'}
                          {' · '}
                          {v.jobAssignmentCount} job link(s) · costs {v.totalCostCents}¢
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Maintenance signals" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.maintenance.rationale}</p>
                {dashboard.maintenanceSignals.length === 0 ? (
                  <EmptyState
                    title="No maintenance signals"
                    description="Unavailable until vehicle maintenance status, schedules, or maintenance costs exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.maintenanceSignals.map((row: FarMaintenanceSignal) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {row.title} · {row.source}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.vehicleName ?? 'Unlinked'} · {row.status}
                          {row.nextDueAt ? ` · due ${row.nextDueAt}` : ''}
                          {row.amountCents != null ? ` · ${row.amountCents}¢` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Cost signals" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.costs.rationale}</p>
                {dashboard.costSignals.length === 0 ? (
                  <EmptyState
                    title="No cost records"
                    description="Cost reduction opportunities unavailable until real fleet operating costs exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.costSignals.slice(0, 30).map((row: FarCostSignal) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {row.vehicleName ?? 'Unassigned'} · {row.costType} · {row.amountCents}¢
                        </div>
                        <div className="text-xs text-slate-500">{row.recordedAt}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Usage / job links" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.usage.rationale}</p>
                {dashboard.usageSignals.length === 0 ? (
                  <EmptyState
                    title="No job–vehicle assignments"
                    description="Route/usage signals unavailable until real assignments exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.usageSignals.slice(0, 30).map((row: FarUsageSignal) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {row.vehicleName ?? 'Vehicle'} · {row.jobTitle ?? row.jobId}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.jobStatus ?? 'unknown'} · assigned {row.assignedAt}
                          {row.scheduledAt ? ` · scheduled ${row.scheduledAt}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'recommendations' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel
                  title="Refresh recommendation drafts"
                  className="border-slate-800 bg-slate-950/80"
                >
                  <p className="mb-3 text-sm text-slate-400">
                    Builds drafts from real maintenance, cost, route, efficiency, and replacement
                    signals only — never auto-executes vehicle decisions.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        void withFeedback(
                          () => refreshFarRecommendations(accessToken!, {}),
                          'Recommendation drafts refreshed',
                        )
                      }
                    >
                      Refresh drafts
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        void withFeedback(
                          () =>
                            refreshFarRecommendations(accessToken!, {
                              submitForApproval: true,
                            }),
                          'Recommendation drafts submitted for Owner/Admin approval',
                        )
                      }
                    >
                      Refresh + submit for approval
                    </Button>
                  </div>
                </Panel>
              ) : null}
              <Panel title="Recommendation drafts" className="border-slate-800 bg-slate-950/80">
                {dashboard.recommendationDrafts.length === 0 ? (
                  <EmptyState
                    title="No recommendation drafts"
                    description="Refresh when real fleet signals exist. Drafts never invent GPS or costs."
                  />
                ) : (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {dashboard.recommendationDrafts.map((draft: FarRecommendationDraftSummary) => (
                      <li key={draft.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {draft.title} · {draft.kind} · {draft.status}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                          {draft.body}
                        </p>
                        {canOwnerApprove &&
                        (draft.status === 'draft' || draft.status === 'pending_approval') ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideFarRecommendation(accessToken!, draft.id, {
                                      decision: 'approve',
                                    }),
                                  'Recommendation approved (no vehicle mutation)',
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
                                    decideFarRecommendation(accessToken!, draft.id, {
                                      decision: 'acknowledge',
                                    }),
                                  'Recommendation acknowledged',
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
                                    decideFarRecommendation(accessToken!, draft.id, {
                                      decision: 'reject',
                                    }),
                                  'Recommendation rejected',
                                )
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'settings' ? (
            <Panel title="Owner/Admin controls" className="border-slate-800 bg-slate-950/80">
              <p className="mb-3 text-sm text-slate-400">
                Auto vehicle decisions and invented GPS/costs stay permanently disabled.
              </p>
              <ul className="mb-4 space-y-1 text-sm text-slate-300">
                <li>Auto vehicle decisions: always off</li>
                <li>Invented GPS: always off</li>
                <li>Invented costs: always off</li>
                <li>
                  Recommendation drafts:{' '}
                  {dashboard.settings.recommendationDraftsEnabled ? 'enabled' : 'disabled'}
                </li>
              </ul>
              {canOwnerApprove ? (
                <form
                  className="space-y-3"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void withFeedback(
                      () =>
                        updateFarSettings(accessToken!, {
                          recommendationDraftsEnabled:
                            dashboard.settings.recommendationDraftsEnabled,
                          maintenanceSuggestionsEnabled:
                            dashboard.settings.maintenanceSuggestionsEnabled,
                          costReductionEnabled: dashboard.settings.costReductionEnabled,
                          routeImprovementsEnabled: dashboard.settings.routeImprovementsEnabled,
                          efficiencyInsightsEnabled: dashboard.settings.efficiencyInsightsEnabled,
                          replacementPlanningEnabled:
                            dashboard.settings.replacementPlanningEnabled,
                          notes: settingsNotes.trim() || null,
                        }),
                      'Settings saved',
                    );
                  }}
                >
                  {(
                    [
                      ['recommendationDraftsEnabled', 'Recommendation drafts enabled'],
                      ['maintenanceSuggestionsEnabled', 'Maintenance suggestions'],
                      ['costReductionEnabled', 'Cost reduction'],
                      ['routeImprovementsEnabled', 'Route improvements'],
                      ['efficiencyInsightsEnabled', 'Fleet efficiency insights'],
                      ['replacementPlanningEnabled', 'Replacement planning'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={dashboard.settings[key]}
                        onChange={(e) =>
                          setDashboard({
                            ...dashboard,
                            settings: {
                              ...dashboard.settings,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <Input
                    label="Notes"
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                  />
                  <Button type="submit">Save settings</Button>
                </form>
              ) : (
                <EmptyState
                  title="Owner/Admin only"
                  description="Sensitive Fleet AI Recommendations settings require Company Owner or Admin."
                />
              )}
            </Panel>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="Connections" className="border-slate-800 bg-slate-950/80">
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.auraConnections.map((c: FarAuraConnection) => (
                    <li key={c.target}>
                      <Link href={c.href} className="text-cyan-300 hover:underline">
                        {c.label}
                      </Link>
                      <span className="text-xs text-slate-500"> — {c.note}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
              {canManage ? (
                <Panel
                  title="Create AURA insight handoff"
                  className="border-slate-800 bg-slate-950/80"
                >
                  <form
                    className="space-y-3"
                    onSubmit={(event: FormEvent) => {
                      event.preventDefault();
                      void withFeedback(async () => {
                        await createFarAuraInsight(accessToken!, {
                          target: insightTarget,
                          title: insightTitle,
                          insight: insightBody,
                          href: '/fleet-ai-recommendations',
                        });
                        setInsightTitle('');
                        setInsightBody('');
                      }, 'AURA insight created');
                    }}
                  >
                    <label className="block text-sm text-slate-300">
                      Target
                      <select
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
                        value={insightTarget}
                        onChange={(e) =>
                          setInsightTarget(e.target.value as FarAuraInsightTarget)
                        }
                      >
                        <option value="command_centre">Command Centre</option>
                        <option value="fleet">Fleet</option>
                        <option value="fleet_intelligence">Fleet Intelligence</option>
                        <option value="vehicle_intelligence">Vehicle Intelligence</option>
                        <option value="driver_intelligence">Driver Intelligence</option>
                        <option value="jobs">Jobs</option>
                        <option value="scheduling">Scheduling</option>
                        <option value="technicians">Technicians</option>
                        <option value="operations">Operations</option>
                        <option value="executive_dashboard">Executive dashboard</option>
                      </select>
                    </label>
                    <Input
                      label="Title"
                      value={insightTitle}
                      onChange={(e) => setInsightTitle(e.target.value)}
                      required
                    />
                    <label className="block text-sm text-slate-300">
                      Insight
                      <textarea
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
                        rows={4}
                        value={insightBody}
                        onChange={(e) => setInsightBody(e.target.value)}
                        required
                      />
                    </label>
                    <Button type="submit">Create handoff</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="AURA insights" className="border-slate-800 bg-slate-950/80">
                {dashboard.auraInsights.length === 0 ? (
                  <EmptyState
                    title="No AURA insights"
                    description="Create handoffs from real fleet optimisation signals only."
                  />
                ) : (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {dashboard.auraInsights.map((insight: FarAuraInsightSummary) => (
                      <li key={insight.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {insight.title} · {insight.target} · {insight.status}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                          {insight.insight}
                        </p>
                        {canManage && insight.status === 'open' ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    acknowledgeFarInsight(accessToken!, insight.id, {
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
                                    acknowledgeFarInsight(accessToken!, insight.id, {
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
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
