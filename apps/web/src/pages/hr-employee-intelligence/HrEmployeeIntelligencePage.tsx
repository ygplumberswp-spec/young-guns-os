import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { HrIntelDashboard } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  decideHrIntelRecommendation,
  fetchHrIntelDashboard,
  HrEmployeeIntelligenceApiClientError,
  refreshHrIntelRecommendations,
} from '../../lib/hr-employee-intelligence-api-client';

type Tab = 'overview' | 'employees' | 'skills' | 'recommendations' | 'connections';

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

export function HrEmployeeIntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<HrIntelDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );

  async function load() {
    if (!accessToken) return;
    const data = await fetchHrIntelDashboard(accessToken);
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
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof HrEmployeeIntelligenceApiClientError
              ? err.message
              : 'Unable to load Employee Intelligence',
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
        err instanceof HrEmployeeIntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader title="Employee Intelligence" description="HR & workforce foundation" />
        <EmptyState
          title="Access restricted"
          description="Owner or Admin access is required for sensitive HR. Technicians cannot view payroll, other employees' private data, or HR analytics. Clients have no HR access."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Workforce overview' },
    { id: 'employees', label: 'Profiles' },
    { id: 'skills', label: 'Skills intelligence' },
    { id: 'recommendations', label: 'AURA recommendations' },
    { id: 'connections', label: 'Connections' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Employee Intelligence"
        description="Profiles, workforce overview, skills intelligence, and Owner/Admin-gated AURA recommendation drafts"
      />
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/technician-intelligence" className="yg-link">
          Technician Intelligence
        </Link>
        <Link href="/jobs" className="yg-link">
          Jobs
        </Link>
        <Link href="/scheduling" className="yg-link">
          Scheduling
        </Link>
        <Link href="/workforce-intelligence" className="yg-link">
          Workforce Intelligence
        </Link>
      </div>
      <Panel title="Privacy & policy" className="yg-panel-accent">
        <p className="text-sm">
          No fake employees or payroll. Sensitive HR and analytics are Owner/Admin only.
          Recommendations never auto-execute HR actions. Timesheets, payroll, and recruitment stay
          honest unavailable until real records exist.
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
          <p className="text-sm text-slate-400">Loading Employee Intelligence…</p>
        </Panel>
      ) : (
        <>
          {tab === 'overview' ? (
            <div className="space-y-4">
              <Panel title="Summary" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
              </Panel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Active employees"
                  value={
                    dashboard.workforce.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.workforce.activeUserCount)
                  }
                />
                <StatCard
                  label="Technicians available"
                  value={
                    dashboard.workforceAvailability.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.workforceAvailability.techniciansAvailable)
                  }
                />
                <StatCard
                  label="Skill gaps"
                  value={
                    dashboard.skillsIntelligence.availability === 'unavailable'
                      ? 'n/a'
                      : String(dashboard.skillsIntelligence.skillGapCount)
                  }
                />
                <StatCard
                  label="Recommendation drafts"
                  value={String(
                    dashboard.recommendations.filter((r) => r.status === 'draft').length,
                  )}
                />
              </div>
              <Panel title="Capacity" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">
                  {dashboard.workforceAvailability.rationale}
                </p>
              </Panel>
              <Panel title="Team structure" className="border-slate-800 bg-slate-950/80">
                {dashboard.team.length === 0 ? (
                  <EmptyState
                    title="No team members"
                    description="Team structure stays empty until real users exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.team.slice(0, 40).map((n) => (
                      <li key={n.userId} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">{n.displayName}</div>
                        <div className="text-xs text-slate-500">
                          {n.roleName}
                          {n.department ? ` · ${n.department}` : ''}
                          {n.managerName ? ` · reports to ${n.managerName}` : ''} ·{' '}
                          {n.availabilitySignal}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'employees' ? (
            <Panel title="Employee profiles" className="border-slate-800 bg-slate-950/80">
              {dashboard.employees.length === 0 ? (
                <EmptyState
                  title="No employees"
                  description="Profiles stay empty until real TITAN users exist — not invented."
                />
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.employees.map((e) => (
                    <li key={e.userId} className="rounded border border-slate-800 px-3 py-2">
                      <div className="font-medium yg-text-accent-muted">
                        {e.firstName} {e.lastName}
                        {!e.isActive ? ' · inactive' : ''}
                      </div>
                      <div className="text-xs text-slate-500">
                        {e.roleName}
                        {e.employment.department ? ` · ${e.employment.department}` : ''}
                        {e.employment.jobTitle ? ` · ${e.employment.jobTitle}` : ''} · skills{' '}
                        {e.skills.length} · quals {e.qualifications.length} · training{' '}
                        {e.training.length} · {e.availabilitySignal}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'skills' ? (
            <div className="space-y-4">
              <Panel title="Skills intelligence" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.skillsIntelligence.rationale}</p>
              </Panel>
              <Panel title="Skills overview" className="border-slate-800 bg-slate-950/80">
                {dashboard.skillsOverview.length === 0 ? (
                  <EmptyState
                    title="No skills recorded"
                    description="Skills overview stays empty until real employee_skills rows exist."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.skillsOverview.map((s) => (
                      <li key={s.skillKey} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {s.skillName} · {s.holderCount} holder(s)
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Skill gaps" className="border-slate-800 bg-slate-950/80">
                {dashboard.skillGaps.length === 0 ? (
                  <EmptyState
                    title="No gap signals"
                    description="Skill gap signals appear from real missing skills/quals/training only."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.skillGaps.map((g) => (
                      <li
                        key={`${g.userId}-${g.gapKind}`}
                        className="rounded border border-slate-800 px-3 py-2"
                      >
                        <div className="font-medium yg-text-accent-muted">
                          {g.displayName} · {g.gapKind}
                        </div>
                        <div className="text-xs text-slate-500">{g.rationale}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Qualification compliance" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-sm text-slate-300">
                  {dashboard.qualificationCompliance.rationale}
                </p>
                {dashboard.qualificationComplianceRows.length === 0 ? (
                  <EmptyState
                    title="No expiry signals"
                    description="Expiry signals appear only from real certification records that carry an expiry date."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.qualificationComplianceRows.map((q) => (
                      <li
                        key={q.certificationId}
                        className="rounded border border-slate-800 px-3 py-2"
                      >
                        <div className="font-medium yg-text-accent-muted">
                          {q.displayName} · {q.name} · {q.state}
                        </div>
                        <div className="text-xs text-slate-500">{q.rationale}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'recommendations' ? (
            <div className="space-y-4">
              <Panel title="Refresh drafts" className="border-slate-800 bg-slate-950/80">
                <p className="mb-3 text-sm text-slate-400">
                  Generates recommendation drafts from real skill/capacity signals. Never executes HR
                  actions.
                </p>
                <Button
                  type="button"
                  onClick={() =>
                    void withFeedback(
                      () => refreshHrIntelRecommendations(accessToken!),
                      'Recommendation drafts refreshed',
                    )
                  }
                >
                  Refresh AURA recommendation drafts
                </Button>
              </Panel>
              <Panel title="Drafts" className="border-slate-800 bg-slate-950/80">
                {dashboard.recommendations.length === 0 ? (
                  <EmptyState
                    title="No recommendation drafts"
                    description="Refresh to create drafts from real workforce signals when present."
                  />
                ) : (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {dashboard.recommendations.map((r) => (
                      <li key={r.id} className="rounded border border-slate-800 px-3 py-2">
                        <div className="font-medium yg-text-accent-muted">
                          {r.title} · {r.kind} · {r.status}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{r.body}</p>
                        {r.status === 'draft' ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideHrIntelRecommendation(accessToken!, r.id, {
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
                                    decideHrIntelRecommendation(accessToken!, r.id, {
                                      decision: 'dismiss',
                                    }),
                                  'Recommendation dismissed',
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
            <Panel title="Connected modules" className="border-slate-800 bg-slate-950/80">
              <ul className="space-y-2 text-sm text-slate-300">
                {dashboard.connections.map((c) => (
                  <li key={c.target} className="rounded border border-slate-800 px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium yg-text-accent-muted">{c.label}</span>
                      <span className="text-xs text-slate-500">
                        {c.availability} · {c.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{c.note}</p>
                    {c.status === 'available_link' ? (
                      <Link href={c.href} className="text-xs yg-link">
                        Open {c.label}
                      </Link>
                    ) : null}
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
