import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type {
  ViAuraInsightTarget,
  ViAuraConnection,
  ViCostRow,
  ViDashboard,
  ViFuelRow,
  ViInsightDraftSummary,
  ViAuraInsightSummary,
  ViMaintenanceRow,
  ViUsageRow,
  ViVehicleProfile,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeViInsight,
  createViAuraInsight,
  decideViInsightDraft,
  fetchViDashboard,
  refreshViInsights,
  updateViSettings,
  VehicleIntelligenceApiClientError,
} from '../../lib/vehicle-intelligence-api-client';

type Tab = 'dashboard' | 'vehicles' | 'fuel' | 'usage' | 'insights' | 'settings' | 'aura';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
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
  return (
    permissions.includes('*') ||
    permissions.includes('fleet:write') ||
    permissions.includes('fleet_intelligence:write')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner';
}

export function VehicleIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<ViDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [insightTarget, setInsightTarget] = useState<ViAuraInsightTarget>('command_centre');
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
    const data = await fetchViDashboard(accessToken);
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
            err instanceof VehicleIntelligenceApiClientError
              ? err.message
              : 'Unable to load Vehicle Intelligence',
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
        err instanceof VehicleIntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Vehicle Intelligence"
          description="Fleet profiles, fuel, costs, and usage foundation"
        />
        <EmptyState
          title="Access restricted"
          description="Fleet permissions are required. Technicians and clients cannot access this intelligence surface."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'vehicles', label: 'Vehicles' },
    { id: 'fuel', label: 'Fuel & costs' },
    { id: 'usage', label: 'Usage & maintenance' },
    { id: 'insights', label: 'Insight drafts' },
    { id: 'settings', label: 'Settings' },
    { id: 'aura', label: 'AURA Insights' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Vehicle Intelligence"
        description="Real vehicle profiles, fuel/cost/usage signals, maintenance cues, and Owner-gated AURA drafts — extending Fleet and Cartrack"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/fleet" className="text-cyan-300 hover:underline">
          Fleet
        </Link>
        <Link href="/fleet-intelligence" className="text-cyan-300 hover:underline">
          Fleet Intelligence
        </Link>
        <Link href="/integrations/cartrack" className="text-cyan-300 hover:underline">
          Cartrack
        </Link>
        <Link href="/jobs" className="text-cyan-300 hover:underline">
          Jobs
        </Link>
        <Link href="/scheduling" className="text-cyan-300 hover:underline">
          Scheduling
        </Link>
        <Link href="/technician-intelligence" className="text-cyan-300 hover:underline">
          Technicians
        </Link>
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
        <p className="text-sm">
          No fake GPS, tracking, or fuel data. When Cartrack is disconnected or records are missing,
          signals stay unavailable — never invented. Insight drafts require Owner approval and never
          auto-mutate fleet.
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
          <p className="text-sm text-slate-400">Loading Vehicle Intelligence…</p>
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
                  label="Fuel foundation"
                  value={dashboard.fuel.availability === 'available' ? 'available' : 'unavailable'}
                />
                <StatCard label="Pending drafts" value={String(dashboard.pendingApprovals)} />
                <StatCard
                  label="Technician links"
                  value={String(dashboard.technicianLinkCount)}
                />
                <StatCard
                  label="Scheduled job links"
                  value={String(dashboard.scheduledJobLinkCount)}
                />
              </div>
              <Panel title="Cartrack" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.cartrack.rationale}</p>
              </Panel>
              <Panel title="Fuel" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.fuel.rationale}</p>
              </Panel>
              <Panel title="Usage" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.usage.rationale}</p>
              </Panel>
              <Panel title="Maintenance" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.maintenance.rationale}</p>
              </Panel>
            </div>
          ) : null}

          {tab === 'vehicles' ? (
            <Panel title="Vehicle profiles" className="border-slate-800 bg-slate-950/80">
              {dashboard.vehicleProfiles.length === 0 ? (
                <EmptyState
                  title="No vehicles"
                  description="Profiles stay empty until real fleet vehicles exist — not invented."
                />
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.vehicleProfiles.map((v: ViVehicleProfile) => (
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
          ) : null}

          {tab === 'fuel' ? (
            <div className="space-y-4">
              <Panel title="Fuel records" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.fuel.rationale}</p>
                {dashboard.fuelRows.length === 0 ? (
                  <EmptyState
                    title="No fuel records"
                    description="Fuel tracking foundation unavailable until real fleet operating costs typed as fuel exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.fuelRows.map((row: ViFuelRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {row.vehicleName ?? 'Unassigned vehicle'} · {row.amountCents}¢
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.recordedAt}
                          {row.notes ? ` · ${row.notes}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="All operating costs" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.costs.rationale}</p>
                {dashboard.costRows.length === 0 ? (
                  <EmptyState
                    title="No cost records"
                    description="Vehicle costs stay unavailable until real fleet operating-cost rows exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.costRows.map((row: ViCostRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {row.costType} · {row.vehicleName ?? 'Unassigned'} · {row.amountCents}¢
                        </div>
                        <div className="text-xs text-slate-500">{row.recordedAt}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'usage' ? (
            <div className="space-y-4">
              <Panel title="Usage history" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.usage.rationale}</p>
                {dashboard.usageHistory.length === 0 ? (
                  <EmptyState
                    title="No usage history"
                    description="Usage stays unavailable until real job–vehicle assignments exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.usageHistory.map((row: ViUsageRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {row.vehicleName ?? 'Vehicle'} → {row.jobTitle ?? row.jobId}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.jobStatus ?? 'unknown'}
                          {row.assignedUserName ? ` · ${row.assignedUserName}` : ''}
                          {row.scheduledAt ? ` · scheduled ${row.scheduledAt}` : ''}
                          {' · assigned '}
                          {row.assignedAt}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Maintenance schedules" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-xs text-slate-500">{dashboard.maintenance.rationale}</p>
                {dashboard.maintenanceRows.length === 0 ? (
                  <EmptyState
                    title="No maintenance signals"
                    description="Maintenance cues stay unavailable until vehicles are in maintenance or vehicle-linked asset schedules exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.maintenanceRows.map((row: ViMaintenanceRow) => (
                      <li key={row.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">{row.title}</div>
                        <div className="text-xs text-slate-500">
                          {row.source} · {row.status}
                          {row.vehicleName ? ` · ${row.vehicleName}` : ''}
                          {row.nextDueAt ? ` · due ${row.nextDueAt}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'insights' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Refresh insight drafts" className="border-slate-800 bg-slate-950/80">
                  <p className="mb-3 text-sm text-slate-400">
                    Builds drafts from real maintenance, cost, fuel, and Cartrack risk signals only.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        void withFeedback(
                          () => refreshViInsights(accessToken!, {}),
                          'Insight drafts refreshed',
                        )
                      }
                    >
                      Refresh drafts
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        void withFeedback(
                          () => refreshViInsights(accessToken!, { submitForApproval: true }),
                          'Insight drafts submitted for Owner approval',
                        )
                      }
                    >
                      Refresh + submit for approval
                    </Button>
                  </div>
                </Panel>
              ) : null}
              <Panel title="Insight drafts" className="border-slate-800 bg-slate-950/80">
                {dashboard.insightDrafts.length === 0 ? (
                  <EmptyState
                    title="No insight drafts"
                    description="Refresh when real fleet signals exist. Drafts never invent GPS or fuel."
                  />
                ) : (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {dashboard.insightDrafts.map((draft: ViInsightDraftSummary) => (
                      <li key={draft.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium text-cyan-100">
                          {draft.title} · {draft.status}
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
                                    decideViInsightDraft(accessToken!, draft.id, {
                                      decision: 'approve',
                                    }),
                                  'Insight draft approved',
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
                                    decideViInsightDraft(accessToken!, draft.id, {
                                      decision: 'acknowledge',
                                    }),
                                  'Insight draft acknowledged',
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
                                    decideViInsightDraft(accessToken!, draft.id, {
                                      decision: 'reject',
                                    }),
                                  'Insight draft rejected',
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
            <Panel title="Owner controls" className="border-slate-800 bg-slate-950/80">
              <p className="mb-3 text-sm text-slate-400">
                Auto fleet mutation and invented tracking stay permanently disabled. Only Company
                Owner may change sensitive settings.
              </p>
              <ul className="mb-4 space-y-1 text-sm text-slate-300">
                <li>Auto fleet mutation: always off</li>
                <li>Invented tracking: always off</li>
                <li>
                  Insight drafts:{' '}
                  {dashboard.settings.insightDraftsEnabled ? 'enabled' : 'disabled'}
                </li>
                <li>
                  Fuel signals: {dashboard.settings.fuelSignalsEnabled ? 'enabled' : 'disabled'}
                </li>
                <li>
                  Maintenance signals:{' '}
                  {dashboard.settings.maintenanceSignalsEnabled ? 'enabled' : 'disabled'}
                </li>
              </ul>
              {canOwnerApprove ? (
                <form
                  className="space-y-3"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void withFeedback(
                      () =>
                        updateViSettings(accessToken!, {
                          insightDraftsEnabled: dashboard.settings.insightDraftsEnabled,
                          fuelSignalsEnabled: dashboard.settings.fuelSignalsEnabled,
                          maintenanceSignalsEnabled: dashboard.settings.maintenanceSignalsEnabled,
                          notes: settingsNotes.trim() || null,
                        }),
                      'Settings saved',
                    );
                  }}
                >
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={dashboard.settings.insightDraftsEnabled}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            insightDraftsEnabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Insight drafts enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={dashboard.settings.fuelSignalsEnabled}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            fuelSignalsEnabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Fuel signals enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={dashboard.settings.maintenanceSignalsEnabled}
                      onChange={(e) =>
                        setDashboard({
                          ...dashboard,
                          settings: {
                            ...dashboard.settings,
                            maintenanceSignalsEnabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Maintenance signals enabled
                  </label>
                  <Input
                    label="Notes"
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">
                    Auto fleet mutation and invented tracking remain permanently disabled.
                  </p>
                  <Button type="submit">Save settings</Button>
                </form>
              ) : (
                <EmptyState
                  title="Owner only"
                  description="Sensitive Vehicle Intelligence settings require Company Owner."
                />
              )}
            </Panel>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="Connections" className="border-slate-800 bg-slate-950/80">
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.auraConnections.map((c: ViAuraConnection) => (
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
                <Panel title="Create AURA insight handoff" className="border-slate-800 bg-slate-950/80">
                  <form
                    className="space-y-3"
                    onSubmit={(event: FormEvent) => {
                      event.preventDefault();
                      void withFeedback(async () => {
                        await createViAuraInsight(accessToken!, {
                          target: insightTarget,
                          title: insightTitle,
                          insight: insightBody,
                          href: '/vehicle-intelligence',
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
                          setInsightTarget(e.target.value as ViAuraInsightTarget)
                        }
                      >
                        <option value="command_centre">Command Centre</option>
                        <option value="fleet">Fleet</option>
                        <option value="fleet_intelligence">Fleet Intelligence</option>
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
                    description="Create handoffs from real vehicle signals only."
                  />
                ) : (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {dashboard.auraInsights.map((insight: ViAuraInsightSummary) => (
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
                                    acknowledgeViInsight(accessToken!, insight.id, {
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
                                    acknowledgeViInsight(accessToken!, insight.id, {
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
