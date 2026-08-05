import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  SecmonAuditEntry,
  SecmonDashboard,
  SecmonRecommendation,
  SecmonSeverity,
  SecmonSignal,
  SecmonTriageState,
} from '@titan/shared';
import {
  SECMON_CATEGORY_LABELS,
  SECMON_SEVERITIES,
  canManageSecmonMonitoring,
  canReadSecmonMonitoring,
  canTriageSecmonSignals,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  SecurityMonitoringApiClientError,
  decideSecmonRecommendation,
  fetchSecmonAudit,
  fetchSecmonDashboard,
  openSecmonIncident,
  triageSecmonSignal,
  updateSecmonIncident,
  updateSecmonSettings,
} from '../../lib/security-monitoring-api-client';

type Tab = 'signals' | 'coverage' | 'withheld' | 'recommendations' | 'incidents' | 'controls' | 'audit';

const SEVERITY_STYLES: Record<SecmonSeverity, string> = {
  critical: 'border-rose-500/60 bg-rose-950/30 text-rose-100',
  high: 'border-orange-500/50 bg-orange-950/30 text-orange-100',
  medium: 'border-amber-500/50 bg-amber-950/30 text-amber-100',
  low: 'border-sky-500/50 bg-sky-950/30 text-sky-100',
  info: 'border-slate-600/50 bg-slate-900/40 text-slate-300',
};

const TRIAGE_LABELS: Record<SecmonTriageState, string> = {
  new: 'Not yet reviewed',
  acknowledged: 'Acknowledged',
  investigating: 'Being investigated',
  resolved: 'Resolved',
  false_positive: 'Marked not a problem',
};

const AVAILABILITY_LABELS: Record<SecmonSignal['availability'], string> = {
  available: 'Backed by evidence',
  needs_review: 'Needs review — not enough evidence to state a finding',
  unavailable: 'Nothing recorded in this area',
};

function formatWhen(iso: string | null): string {
  if (!iso) return 'No recorded date';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'Unknown date';
  return new Date(parsed).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

export function SecurityMonitoringPage() {
  const { user, accessToken } = useAuth();
  const [dashboard, setDashboard] = useState<SecmonDashboard | null>(null);
  const [audit, setAudit] = useState<SecmonAuditEntry[]>([]);
  const [tab, setTab] = useState<Tab>('signals');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [incidentDraft, setIncidentDraft] = useState({ title: '', summary: '' });
  const [triageSignalKey, setTriageSignalKey] = useState<string | null>(null);

  const canView = useMemo(
    () =>
      user ? canReadSecmonMonitoring({ roleName: user.roleName, permissions: user.permissions }) : false,
    [user],
  );
  const canManage = useMemo(
    () =>
      user
        ? canManageSecmonMonitoring({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );
  const canTriage = useMemo(
    () =>
      user ? canTriageSecmonSignals({ roleName: user.roleName, permissions: user.permissions }) : false,
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    setDashboard(await fetchSecmonDashboard(accessToken));
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
            err instanceof SecurityMonitoringApiClientError
              ? err.message
              : 'Unable to load Security Monitoring',
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
      setError(err instanceof SecurityMonitoringApiClientError ? err.message : 'Action failed');
    }
  }

  async function loadAudit() {
    if (!accessToken) return;
    try {
      setError(null);
      setAudit(await fetchSecmonAudit(accessToken));
    } catch (err) {
      setError(
        err instanceof SecurityMonitoringApiClientError ? err.message : 'Unable to load history',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader title="Security Monitoring" />
        <EmptyState
          title="Not available to this role"
          description="Security logs, session metadata, integration security events and permission history are restricted. Technicians and clients have no access, and other staff only see alerts about their own account."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'signals', label: 'What needs attention' },
    { id: 'coverage', label: 'Coverage' },
    { id: 'withheld', label: 'Held back' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'controls', label: 'Controls' },
    { id: 'audit', label: 'Audit' },
  ];

  function renderSignal(item: SecmonSignal) {
    return (
      <div key={item.key} className={`rounded-lg border p-4 ${SEVERITY_STYLES[item.severity]}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{item.title}</h3>
          <span className="text-xs uppercase tracking-wide opacity-80">
            {item.severity} · {TRIAGE_LABELS[item.triage]}
          </span>
        </div>
        <p className="mt-1 text-sm opacity-90">{item.detail}</p>
        <p className="mt-2 text-xs opacity-80">
          {AVAILABILITY_LABELS[item.availability]} · confidence {item.confidence} ·{' '}
          {item.occurrenceCount} matching record(s)
          {item.groupedCount > 1 ? ' grouped into one item' : ''} · last seen{' '}
          {formatWhen(item.observedAt)}
          {item.subjectLabel ? ` · account ${item.subjectLabel}` : ''}
        </p>
        <p className="mt-1 text-xs opacity-75">{item.attributionNote}</p>
        {item.sensitiveDetailWithheld ? (
          <p className="mt-1 text-xs text-amber-200">
            Network addresses and full session detail are held back at your access level.
          </p>
        ) : null}

        {item.evidence.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs opacity-80">
            {item.evidence.map((entry) => (
              <li key={`${item.key}-${entry.source}`}>
                {entry.source.replace(/_/g, ' ')} · {entry.observationCount} record(s) · from{' '}
                {formatWhen(entry.firstObservedAt)} to {formatWhen(entry.lastObservedAt)}
                {entry.summary ? ` — ${entry.summary}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs opacity-75">
            No evidence is attached, so nothing is claimed here.
          </p>
        )}

        {canTriage ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {(['acknowledged', 'investigating', 'resolved', 'false_positive'] as SecmonTriageState[]).map(
              (state) => (
                <Button
                  key={state}
                  variant="secondary"
                  onClick={() =>
                    void withFeedback(
                      () => triageSecmonSignal(accessToken ?? '', item.key, { triage: state }),
                      `Recorded as ${TRIAGE_LABELS[state].toLowerCase()}. The record stays in the history.`,
                    )
                  }
                >
                  {TRIAGE_LABELS[state]}
                </Button>
              ),
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setTriageSignalKey(item.key);
                setIncidentDraft({ title: item.title, summary: item.detail });
                setTab('incidents');
              }}
            >
              Open an incident
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderRecommendation(item: SecmonRecommendation) {
    return (
      <div key={item.key} className={`rounded-lg border p-4 ${SEVERITY_STYLES[item.severity]}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{item.title}</h3>
          <span className="text-xs uppercase tracking-wide text-violet-300">
            AURA recommendation
          </span>
        </div>
        <p className="mt-1 text-sm opacity-90">{item.rationale}</p>
        <p className="mt-2 text-xs opacity-80">
          Suggested step: {item.action.replace(/_/g, ' ')} · severity {item.severity} · confidence{' '}
          {item.confidence} · decision {item.decision}
        </p>
        <p className="mt-1 text-xs text-amber-200">{item.boundary}</p>
        <ul className="mt-3 space-y-1 text-xs opacity-80">
          {item.evidence.map((entry) => (
            <li key={`${item.key}-${entry.source}`}>
              {entry.source.replace(/_/g, ' ')} · {entry.observationCount} record(s) · last seen{' '}
              {formatWhen(entry.lastObservedAt)}
            </li>
          ))}
        </ul>
        {canManage && item.decision === 'pending' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                void withFeedback(
                  () =>
                    decideSecmonRecommendation(accessToken ?? '', item.key, {
                      decision: 'approved',
                    }),
                  'Decision recorded. Nothing was deleted, revoked, rotated or disconnected.',
                )
              }
            >
              Approve the decision
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void withFeedback(
                  () =>
                    decideSecmonRecommendation(accessToken ?? '', item.key, {
                      decision: 'rejected',
                    }),
                  'Rejected. It stays in the audit history.',
                )
              }
            >
              Reject
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Security Monitoring" />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/security" className="yg-link">
          Security settings
        </Link>
        <Link href="/executive-command-centre" className="yg-link">
          Executive Command Centre
        </Link>
      </div>

      <Panel title="Policy" className="yg-panel-accent">
        <p className="text-sm">
          Real security records only. Every item says how many records back it, when they were
          recorded and how confident the reading is. A threat, a breach or an attacker is never
          invented, and who was behind an event is never asserted — without enough evidence the
          answer is needs review or nothing recorded. Credentials, tokens and secrets are monitored
          but never shown, and network addresses and session detail are held back below Owner
          level. Repeated events are grouped so one problem reads as one item, but a high or
          critical item is never hidden. AURA recommends; approval records a decision and never
          deletes an account, removes a permission, rotates a credential, revokes a session or
          shuts down an integration.
        </p>
      </Panel>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/20 text-rose-100">
          <p className="text-sm">{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Success" className="border-emerald-500/40 bg-emerald-950/20 text-emerald-100">
          <p className="text-sm">{success}</p>
        </Panel>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Button
            key={item.id}
            variant={tab === item.id ? 'primary' : 'secondary'}
            onClick={() => {
              setTab(item.id);
              if (item.id === 'audit') void loadAudit();
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <EmptyState title="Loading" description="Loading Security Monitoring…" />
      ) : (
        <>
          <Panel title="Summary">
            <p className="text-sm text-slate-300">
              {dashboard.scope === 'own_account_only'
                ? 'You can see security activity that concerns your own account.'
                : dashboard.scope === 'security_admin'
                  ? 'You can see security monitoring. Privileged history stays with the Owner.'
                  : 'You can see everything this company records about its own security.'}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Critical"
                value={String(dashboard.posture.criticalCount)}
                hint="Backed by evidence"
              />
              <StatCard label="High" value={String(dashboard.posture.highCount)} />
              <StatCard
                label="Open incidents"
                value={String(dashboard.posture.openIncidentCount)}
              />
              <StatCard
                label="Areas with nothing recorded"
                value={String(dashboard.posture.unavailableCategories)}
                hint="Shown rather than treated as all-clear"
              />
            </div>
          </Panel>

          {tab === 'signals' ? (
            <div className="space-y-3">
              {dashboard.signals.length === 0 ? (
                <EmptyState
                  title="Nothing to show"
                  description="No security records match the current window and severity floor. Nothing is invented to fill the page."
                />
              ) : (
                dashboard.signals.map(renderSignal)
              )}
              {dashboard.suppressed.length > 0 ? (
                <Panel title="Below your severity floor">
                  <p className="text-sm text-slate-300">
                    {dashboard.suppressed.length} routine item(s) are hidden by the severity floor.
                    High and critical items are never hidden.
                  </p>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {tab === 'coverage' ? (
            <Panel title="What each area is actually backed by">
              {dashboard.coverage.length === 0 ? (
                <p className="text-sm text-slate-300">
                  Coverage detail is available to the Owner and approved security administrators.
                </p>
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.coverage.map((entry) => (
                    <li key={entry.category}>
                      <span className="font-medium">{entry.label}</span>:{' '}
                      {AVAILABILITY_LABELS[entry.availability]}
                      {entry.observationCount > 0
                        ? ` (${entry.observationCount} record(s))`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'withheld' ? (
            <Panel title="Held back from this view">
              {dashboard.withheld.length === 0 ? (
                <p className="text-sm text-slate-300">Nothing is being held back.</p>
              ) : (
                <ul className="space-y-2">
                  {dashboard.withheld.map((held) => (
                    <li key={`${held.category}-${held.reason}`} className="text-sm text-slate-300">
                      <span className="font-medium">{SECMON_CATEGORY_LABELS[held.category]}</span>
                      <br />
                      <span className="text-xs text-slate-400">{held.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'recommendations' ? (
            <div className="space-y-3">
              {dashboard.recommendations.length === 0 ? (
                <EmptyState
                  title="No recommendation"
                  description="A recommendation is only offered for a high or critical item that has evidence behind it, and only the Owner sees them."
                />
              ) : (
                dashboard.recommendations.map(renderRecommendation)
              )}
            </div>
          ) : null}

          {tab === 'incidents' ? (
            <div className="space-y-3">
              {canTriage ? (
                <Panel title="Open an incident record">
                  <div className="space-y-2">
                    <input
                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
                      placeholder="Short title"
                      value={incidentDraft.title}
                      onChange={(event) =>
                        setIncidentDraft((prev) => ({ ...prev, title: event.target.value }))
                      }
                    />
                    <textarea
                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100"
                      placeholder="What was observed and what is being checked"
                      rows={3}
                      value={incidentDraft.summary}
                      onChange={(event) =>
                        setIncidentDraft((prev) => ({ ...prev, summary: event.target.value }))
                      }
                    />
                    <Button
                      variant="primary"
                      disabled={!incidentDraft.title.trim() || !incidentDraft.summary.trim()}
                      onClick={() =>
                        void withFeedback(async () => {
                          const linked = dashboard.signals.find(
                            (item) => item.key === triageSignalKey,
                          );
                          await openSecmonIncident(accessToken ?? '', {
                            title: incidentDraft.title.trim(),
                            summary: incidentDraft.summary.trim(),
                            category: linked?.category ?? 'policy_posture',
                            severity: linked?.severity ?? 'medium',
                            linkedSignalKeys: triageSignalKey ? [triageSignalKey] : [],
                          });
                          setIncidentDraft({ title: '', summary: '' });
                          setTriageSignalKey(null);
                        }, 'Incident recorded.')
                      }
                    >
                      Record the incident
                    </Button>
                  </div>
                </Panel>
              ) : null}

              {dashboard.incidents.length === 0 ? (
                <EmptyState
                  title="No incident recorded"
                  description="Nothing has been raised as an incident for this company."
                />
              ) : (
                dashboard.incidents.map((incident) => (
                  <div
                    key={incident.id}
                    className={`rounded-lg border p-4 ${SEVERITY_STYLES[incident.severity]}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold">{incident.title}</h3>
                      <span className="text-xs uppercase tracking-wide opacity-80">
                        {incident.reference} · {incident.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm opacity-90">{incident.summary}</p>
                    <p className="mt-2 text-xs opacity-80">
                      {SECMON_CATEGORY_LABELS[incident.category]} · opened{' '}
                      {formatWhen(incident.openedAt)}
                      {incident.resolvedAt ? ` · closed ${formatWhen(incident.resolvedAt)}` : ''}
                    </p>
                    {canTriage ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(['investigating', 'contained', 'resolved', 'closed'] as const).map(
                          (status) => (
                            <Button
                              key={status}
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    updateSecmonIncident(accessToken ?? '', incident.id, {
                                      status,
                                    }),
                                  `Incident marked ${status}.`,
                                )
                              }
                            >
                              {status}
                            </Button>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}

          {tab === 'controls' ? (
            <Panel title="Monitoring controls">
              {!canManage ? (
                <p className="text-sm text-slate-300">
                  Only the Owner can change these controls.
                </p>
              ) : (
                <div className="space-y-3 text-sm text-slate-300">
                  <p>
                    Window: last {dashboard.settings.lookbackDays} days · failed sign-in threshold{' '}
                    {dashboard.settings.failedLoginThreshold} · severity floor{' '}
                    {dashboard.settings.severityFloor} ·{' '}
                    {dashboard.settings.groupDuplicates
                      ? 'duplicates grouped'
                      : 'every record listed separately'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[7, 30, 90].map((days) => (
                      <Button
                        key={days}
                        variant="secondary"
                        onClick={() =>
                          void withFeedback(
                            () =>
                              updateSecmonSettings(accessToken ?? '', { lookbackDays: days }),
                            `Window set to ${days} days.`,
                          )
                        }
                      >
                        Last {days} days
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SECMON_SEVERITIES.map((severity) => (
                      <Button
                        key={severity}
                        variant="secondary"
                        onClick={() =>
                          void withFeedback(
                            () =>
                              updateSecmonSettings(accessToken ?? '', { severityFloor: severity }),
                            `Severity floor set to ${severity}. High and critical items stay visible either way.`,
                          )
                        }
                      >
                        Floor: {severity}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void withFeedback(
                        () =>
                          updateSecmonSettings(accessToken ?? '', {
                            groupDuplicates: !dashboard.settings.groupDuplicates,
                          }),
                        'Grouping updated.',
                      )
                    }
                  >
                    {dashboard.settings.groupDuplicates
                      ? 'List every record separately'
                      : 'Group duplicates'}
                  </Button>
                  <p className="text-xs text-slate-400">
                    Automatic remediation cannot be switched on, and secrets cannot be revealed.
                    Both are fixed in the database, not settings.
                  </p>
                </div>
              )}
            </Panel>
          ) : null}

          {tab === 'audit' ? (
            <Panel title="What this department did">
              {audit.length === 0 ? (
                <p className="text-sm text-slate-300">No history loaded yet.</p>
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {audit.map((entry) => (
                    <li key={entry.id}>
                      <span className="font-medium">{entry.eventKind.replace(/_/g, ' ')}</span>
                      {entry.subjectKey ? ` · ${entry.subjectKey}` : ''}
                      <br />
                      <span className="text-xs text-slate-400">
                        {formatWhen(entry.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-400">
                This history is append-only. A record is never edited or removed.
              </p>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
