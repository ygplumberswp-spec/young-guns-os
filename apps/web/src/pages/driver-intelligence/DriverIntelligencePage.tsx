import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { DriDashboard } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeDiInsight,
  decideDiRecommendation,
  DriverIntelligenceApiClientError,
  fetchDriDashboard,
  refreshDiRecommendations,
} from '../../lib/driver-intelligence-api-client';

type Tab =
  | 'overview'
  | 'drivers'
  | 'behaviour'
  | 'trips'
  | 'efficiency'
  | 'usage'
  | 'recommendations'
  | 'connections';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  if (permissions.includes('*')) return true;
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  );
}

export function DriverIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<DriDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );

  async function load() {
    if (!accessToken) return;
    const data = await fetchDriDashboard(accessToken);
    setDashboard(data);
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
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof DriverIntelligenceApiClientError
              ? err.message
              : 'Unable to load Driver Intelligence',
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
      await load();
      setSuccess(ok);
    } catch (err) {
      setError(
        err instanceof DriverIntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4 text-slate-100">
        <PageHeader title="Driver Intelligence" description="Owner/Admin driver behaviour layer" />
        <EmptyState
          title="Access restricted"
          description="Owner or Admin access is required for Driver Intelligence. Technicians and clients cannot view driver behaviour, trip analysis, or recommendation drafts."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'drivers', label: 'Drivers' },
    { id: 'behaviour', label: 'Behaviour' },
    { id: 'trips', label: 'Trips' },
    { id: 'efficiency', label: 'Efficiency' },
    { id: 'usage', label: 'Usage' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'connections', label: 'Connections' },
  ];

  return (
    <div className="space-y-6 bg-[radial-gradient(circle_at_top,_#164e63_0%,_#0b1220_42%,_#020617_100%)] p-1 text-slate-100">
      <PageHeader
        title="Driver Intelligence"
        description="Real driver profiles, behaviour insights, route efficiency, trip analysis, and Owner/Admin-gated AURA drafts — no fake GPS, never auto-discipline"
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
        <Link href="/jobs" className="text-cyan-300 hover:underline">
          Jobs
        </Link>
        <Link href="/hr-employee-intelligence" className="text-cyan-300 hover:underline">
          Employee Intelligence
        </Link>
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
        <p className="text-sm">
          Owner/Admin only. No fake GPS or invented behaviour. Recommendation drafts never
          auto-discipline, auto-sanction, or mutate HR. When Cartrack/trips/behaviour are missing,
          signals stay unavailable.
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
                : 'bg-slate-950 text-slate-300 ring-1 ring-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <Panel title="Loading" className="border-slate-800 bg-slate-950/80">
          <p className="text-sm text-slate-400">Loading Driver Intelligence…</p>
        </Panel>
      ) : (
        <>
          {tab === 'overview' ? (
            <div className="space-y-4">
              <Panel title="Summary" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {dashboard.productClarification.thisLayer}
                </p>
              </Panel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Drivers" value={String(dashboard.totalDrivers)} />
                <StatCard
                  label="Cartrack"
                  value={
                    dashboard.cartrack.availability === 'available' ? 'available' : 'unavailable'
                  }
                />
                <StatCard
                  label="Trips"
                  value={dashboard.trips.availability === 'available' ? 'available' : 'unavailable'}
                />
                <StatCard
                  label="Behaviour"
                  value={
                    dashboard.behaviour.availability === 'available' ? 'available' : 'unavailable'
                  }
                />
                <StatCard
                  label="Usage"
                  value={dashboard.usage.availability === 'available' ? 'available' : 'unavailable'}
                />
                <StatCard
                  label="Pending drafts"
                  value={String(dashboard.pendingRecommendations)}
                />
              </div>
              <Panel title="Cartrack" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.cartrack.rationale}</p>
              </Panel>
            </div>
          ) : null}

          {tab === 'drivers' ? (
            <Panel title="Driver profiles" className="border-slate-800 bg-slate-950/80">
              {dashboard.driverProfiles.length === 0 ? (
                <EmptyState
                  title="No driver profiles yet"
                  description="Profiles appear from real vehicle assignees and job–vehicle assignments — not invented."
                />
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.driverProfiles.map((d) => (
                    <li
                      key={d.userId}
                      className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <div className="font-medium text-cyan-100">{d.displayName}</div>
                      <div className="text-xs text-slate-500">
                        {d.roleName} · {d.email} · {d.isActive ? 'active' : 'inactive'}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        Vehicles: {d.assignedVehicleNames.join(', ') || 'none'} · Jobs{' '}
                        {d.jobAssignmentCount} · Trips {d.tripCount} · Behaviour{' '}
                        {d.behaviourEventCount} · {d.totalDistanceKm.toFixed(1)} km
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'behaviour' ? (
            <Panel title="Behaviour events" className="border-slate-800 bg-slate-950/80">
              <p className="mb-3 text-xs text-slate-500">{dashboard.behaviour.rationale}</p>
              {dashboard.behaviourRows.length === 0 ? (
                <EmptyState
                  title="No behaviour events"
                  description="Behaviour stays unavailable until real fleet behaviour events exist — never invented."
                />
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.behaviourRows.slice(0, 100).map((row) => (
                    <li
                      key={row.id}
                      className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <div className="font-medium text-cyan-100">
                        {row.eventType} · severity {row.severity}
                      </div>
                      <div className="text-xs text-slate-400">
                        {row.driverName ?? 'Unassigned driver'} · {row.vehicleName ?? 'No vehicle'} ·{' '}
                        {new Date(row.occurredAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'trips' ? (
            <Panel title="Trip analysis" className="border-slate-800 bg-slate-950/80">
              <p className="mb-3 text-xs text-slate-500">{dashboard.trips.rationale}</p>
              {dashboard.tripRows.length === 0 ? (
                <EmptyState
                  title="No trip segments"
                  description="Trip analysis requires real GPS-derived segments from Fleet Intelligence / Cartrack."
                />
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.tripRows.slice(0, 100).map((row, idx) => (
                    <li
                      key={`${row.vehicleId ?? 'v'}-${row.startedAt}-${idx}`}
                      className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <div className="font-medium text-cyan-100">
                        {row.vehicleName ?? 'Vehicle'} · {row.distanceKm.toFixed(1)} km
                      </div>
                      <div className="text-xs text-slate-400">
                        {row.driverName ?? 'Unassigned'} · idle {row.idleMinutes}m / drive{' '}
                        {row.drivingMinutes}m · stops {row.stopCount} ·{' '}
                        {new Date(row.startedAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'efficiency' ? (
            <Panel title="Route efficiency" className="border-slate-800 bg-slate-950/80">
              {dashboard.routeEfficiency.length === 0 ? (
                <EmptyState
                  title="Insufficient trip data"
                  description="Efficiency scores need real trip minutes — never invented."
                />
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.routeEfficiency.map((row, idx) => (
                    <li
                      key={`${row.driverUserId ?? 'd'}-${row.vehicleId ?? 'v'}-${idx}`}
                      className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <div className="font-medium text-cyan-100">
                        {row.driverName ?? 'Unassigned'} · {row.efficiencyLabel}
                      </div>
                      <div className="text-xs text-slate-400">
                        {row.vehicleName ?? 'No vehicle'} · {row.tripCount} trip(s) ·{' '}
                        {row.totalDistanceKm.toFixed(1)} km · {row.rationale}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'usage' ? (
            <Panel title="Vehicle usage" className="border-slate-800 bg-slate-950/80">
              <p className="mb-3 text-xs text-slate-500">{dashboard.usage.rationale}</p>
              {dashboard.vehicleUsage.length === 0 ? (
                <EmptyState
                  title="No vehicles"
                  description="Usage analysis needs real vehicles and job–vehicle assignments."
                />
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.vehicleUsage.map((row) => (
                    <li
                      key={row.vehicleId}
                      className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <div className="font-medium text-cyan-100">
                        {row.vehicleName} · {row.licensePlate}
                      </div>
                      <div className="text-xs text-slate-400">
                        {row.assignedUserName ?? 'Unassigned'} · jobs {row.jobAssignmentCount} (
                        {row.distinctJobCount} distinct) · trips {row.tripCount} ·{' '}
                        {row.totalDistanceKm.toFixed(1)} km · status {row.status}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'recommendations' ? (
            <div className="space-y-4">
              <Panel title="Refresh drafts" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-sm text-slate-400">
                  Create efficiency / risk / training recommendation drafts from real signals only.
                  Drafts never auto-discipline.
                </p>
                <Button
                  type="button"
                  onClick={() =>
                    void withFeedback(
                      () => refreshDiRecommendations(accessToken!),
                      'Recommendation drafts refreshed from real signals.',
                    )
                  }
                >
                  Refresh recommendation drafts
                </Button>
              </Panel>
              <Panel title="Recommendation drafts" className="border-slate-800 bg-slate-950/80">
                {dashboard.recommendations.length === 0 ? (
                  <EmptyState
                    title="No drafts yet"
                    description="Refresh to generate Owner/Admin review drafts from real driver signals."
                  />
                ) : (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {dashboard.recommendations.map((rec) => (
                      <li
                        key={rec.id}
                        className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
                      >
                        <div className="font-medium text-cyan-100">{rec.title}</div>
                        <div className="text-xs text-slate-500">
                          {rec.kind} · {rec.status} · autoDiscipline={String(rec.autoDiscipline)} ·
                          inventedGps={String(rec.inventedGps)}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{rec.body}</p>
                        {rec.status === 'draft' ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideDiRecommendation(accessToken!, rec.id, {
                                      decision: 'acknowledge',
                                    }),
                                  'Recommendation acknowledged (no discipline executed).',
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
                                    decideDiRecommendation(accessToken!, rec.id, {
                                      decision: 'dismiss',
                                    }),
                                  'Recommendation dismissed.',
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
              <Panel title="AURA insights" className="border-slate-800 bg-slate-950/80">
                {dashboard.auraInsights.length === 0 ? (
                  <EmptyState
                    title="No AURA insights"
                    description="Insights can be created via API for Owner review handoffs."
                  />
                ) : (
                  <ul className="space-y-3 text-sm text-slate-300">
                    {dashboard.auraInsights.map((insight) => (
                      <li
                        key={insight.id}
                        className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
                      >
                        <div className="font-medium text-cyan-100">{insight.title}</div>
                        <div className="text-xs text-slate-500">
                          {insight.target} · {insight.status}
                        </div>
                        <p className="mt-2 text-xs text-slate-400">{insight.insight}</p>
                        {insight.status === 'open' ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    acknowledgeDiInsight(accessToken!, insight.id, {
                                      status: 'acknowledged',
                                    }),
                                  'Insight acknowledged.',
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
                                    acknowledgeDiInsight(accessToken!, insight.id, {
                                      status: 'dismissed',
                                    }),
                                  'Insight dismissed.',
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

          {tab === 'connections' ? (
            <Panel title="AURA connections" className="border-slate-800 bg-slate-950/80">
              <ul className="space-y-2 text-sm text-slate-300">
                {dashboard.auraConnections.map((c) => (
                  <li
                    key={c.target}
                    className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-cyan-100">{c.label}</span>
                      <span className="text-xs text-slate-500">{c.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{c.note}</p>
                    <Link href={c.href} className="text-xs text-cyan-300 hover:underline">
                      Open {c.href}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
