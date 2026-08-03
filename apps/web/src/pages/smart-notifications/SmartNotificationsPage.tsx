import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  SnAuditEntry,
  SnCategory,
  SnDashboard,
  SnSeverity,
  SnSignalGroup,
} from '@titan/shared';
import {
  canAccessSmartNotifications,
  canManageSnSettings,
  SN_CATEGORY_LABELS,
  SN_SEVERITIES,
} from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  actOnSnSignal,
  decideSnActionDraft,
  fetchSnCompanyAudit,
  fetchSnDashboard,
  fetchSnSignalAudit,
  refreshSnActionDrafts,
  SmartNotificationsApiClientError,
  updateSnCategoryControl,
  updateSnSettings,
} from '../../lib/smart-notification-intelligence-api-client';

type Tab = 'feed' | 'brief' | 'held' | 'approvals' | 'controls' | 'audit';

const SEVERITY_STYLES: Record<SnSeverity, string> = {
  critical: 'border-rose-500/50 bg-rose-950/30 text-rose-100',
  high: 'border-amber-500/50 bg-amber-950/30 text-amber-100',
  medium: 'border-sky-500/50 bg-sky-950/30 text-sky-100',
  low: 'border-slate-600/50 bg-slate-900/40 text-slate-200',
  info: 'border-slate-700/50 bg-slate-900/30 text-slate-300',
};

const URGENCY_LABELS: Record<SnSignalGroup['urgency'], string> = {
  immediate: 'Needs attention now',
  today: 'Today',
  this_week: 'This week',
  when_convenient: 'When convenient',
};

/** Snooze options stay short so a signal is deferred, never buried. */
const SNOOZE_OPTIONS: Array<{ label: string; minutes: number }> = [
  { label: '1 hour', minutes: 60 },
  { label: 'Tomorrow', minutes: 1440 },
  { label: '3 days', minutes: 4320 },
];

function formatWhen(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'Unknown time';
  return new Date(parsed).toLocaleString('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function SmartNotificationsPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('feed');
  const [dashboard, setDashboard] = useState<SnDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [companyAudit, setCompanyAudit] = useState<SnAuditEntry[]>([]);
  const [signalAudit, setSignalAudit] = useState<{ groupKey: string; entries: SnAuditEntry[] } | null>(
    null,
  );

  const canView = useMemo(
    () =>
      user
        ? canAccessSmartNotifications({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );
  const canManage = useMemo(
    () =>
      user
        ? canManageSnSettings({ roleName: user.roleName, permissions: user.permissions })
        : false,
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    setDashboard(await fetchSnDashboard(accessToken));
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
            err instanceof SmartNotificationsApiClientError
              ? err.message
              : 'Unable to load Smart Notifications',
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
        err instanceof SmartNotificationsApiClientError ? err.message : 'Action failed',
      );
    }
  }

  async function openSignalAudit(groupKey: string) {
    if (!accessToken) return;
    try {
      setError(null);
      setSignalAudit({ groupKey, entries: await fetchSnSignalAudit(accessToken, groupKey) });
    } catch (err) {
      setError(
        err instanceof SmartNotificationsApiClientError ? err.message : 'Unable to load history',
      );
    }
  }

  async function openCompanyAudit() {
    if (!accessToken) return;
    try {
      setError(null);
      setCompanyAudit(await fetchSnCompanyAudit(accessToken));
    } catch (err) {
      setError(
        err instanceof SmartNotificationsApiClientError ? err.message : 'Unable to load audit',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader title="Smart Notifications" description="Prioritised alerts over real events" />
        <EmptyState
          title="Access restricted"
          description="Smart Notifications requires a signed-in role on this company."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'feed', label: 'Needs attention' },
    { id: 'brief', label: 'Daily brief' },
    { id: 'held', label: 'Held back' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'controls', label: 'Controls' },
    { id: 'audit', label: 'Audit' },
  ];

  function renderSignal(signal: SnSignalGroup) {
    return (
      <div
        key={signal.groupKey}
        className={`rounded-lg border p-4 ${SEVERITY_STYLES[signal.severity]}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{signal.title}</h3>
          <span className="text-xs uppercase tracking-wide opacity-80">
            {signal.severity} · {URGENCY_LABELS[signal.urgency]}
          </span>
        </div>
        <p className="mt-1 text-sm opacity-90">{signal.detail}</p>
        <p className="mt-2 text-xs opacity-75">
          {SN_CATEGORY_LABELS[signal.category]} · {signal.eventCount} real row(s)
          {signal.duplicateCount > 0 ? ` · ${signal.duplicateCount} duplicate(s) grouped` : ''}
          {signal.unreadCount > 0 ? ` · ${signal.unreadCount} unread` : ''} · last seen{' '}
          {formatWhen(signal.lastSeenAt)}
        </p>
        {signal.status !== 'open' ? (
          <p className="mt-1 text-xs opacity-75">
            Status: {signal.status}
            {signal.snoozedUntil ? ` until ${formatWhen(signal.snoozedUntil)}` : ''}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              void withFeedback(
                () =>
                  actOnSnSignal(accessToken ?? '', {
                    groupKey: signal.groupKey,
                    action: 'acknowledge',
                  }),
                'Acknowledged.',
              )
            }
          >
            Acknowledge
          </Button>
          {SNOOZE_OPTIONS.map((option) => (
            <Button
              key={option.minutes}
              variant="secondary"
              onClick={() =>
                void withFeedback(
                  () =>
                    actOnSnSignal(accessToken ?? '', {
                      groupKey: signal.groupKey,
                      action: 'snooze',
                      snoozeMinutes: option.minutes,
                    }),
                  `Snoozed for ${option.label.toLowerCase()}.`,
                )
              }
            >
              Snooze {option.label}
            </Button>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              void withFeedback(
                () =>
                  actOnSnSignal(accessToken ?? '', {
                    groupKey: signal.groupKey,
                    action: 'dismiss',
                  }),
                'Dismissed. It stays in the audit history.',
              )
            }
          >
            Dismiss
          </Button>
          {dashboard?.scope === 'company_wide' ? (
            <Button
              variant="secondary"
              onClick={() =>
                void withFeedback(
                  () =>
                    actOnSnSignal(accessToken ?? '', {
                      groupKey: signal.groupKey,
                      action: 'escalate',
                    }),
                  'Escalated.',
                )
              }
            >
              Escalate
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => void openSignalAudit(signal.groupKey)}>
            History
          </Button>
        </div>
        {signalAudit?.groupKey === signal.groupKey ? (
          <ul className="mt-3 space-y-1 text-xs opacity-80">
            {signalAudit.entries.length === 0 ? (
              <li>No decision has been recorded on this signal yet.</li>
            ) : (
              signalAudit.entries.map((entry) => (
                <li key={entry.id}>
                  {formatWhen(entry.occurredAt)} — {entry.kind}
                  {entry.notes ? ` — ${entry.notes}` : ''}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Smart Notifications"
        description="Grouped, prioritised signals over your real notification and alert rows"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/notifications" className="text-cyan-300 hover:underline">
          Notifications inbox
        </Link>
        <Link href="/settings/notifications" className="text-cyan-300 hover:underline">
          Notification settings
        </Link>
        <Link href="/security" className="text-cyan-300 hover:underline">
          Security
        </Link>
      </div>

      <Panel title="Policy" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
        <p className="text-sm">
          Real rows only. Every signal is grouped from notification and alert rows that already
          exist — nothing is invented, and a category with no evidence says so. Signals held back by
          Owner controls are listed with the reason rather than disappearing. Finance, payroll,
          security and strategy categories are Owner only. AURA recommends; every recommendation is
          a draft requiring Owner approval and never releases a payment, runs payroll, publishes
          content or changes permissions.
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
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <EmptyState title="Loading" description="Loading Smart Notifications…" />
      ) : (
        <>
          <Panel title="Summary">
            <p className="text-sm text-slate-300">{dashboard.summary}</p>
            <p className="mt-2 text-xs text-slate-400">{dashboard.scopeRationale}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Needs attention" value={String(dashboard.feed.length)} />
              <StatCard
                label="Critical"
                value={String(dashboard.feed.filter((s) => s.severity === 'critical').length)}
              />
              <StatCard
                label="Held back"
                value={String(dashboard.suppressed.length)}
                hint="Each with a stated reason"
              />
              <StatCard
                label="Real rows read"
                value={String(dashboard.totalSourceRows)}
                hint={`Grouped into ${dashboard.groupedRowCount} signal(s)`}
              />
            </div>
          </Panel>

          {tab === 'feed' ? (
            <div className="space-y-3">
              {dashboard.feed.length === 0 ? (
                <EmptyState
                  title="Nothing needs attention"
                  description={
                    dashboard.totalSourceRows === 0
                      ? 'No real notification or alert rows exist for this company yet.'
                      : 'Every signal is below the thresholds set in notification controls. Held-back signals are listed under Held back with the reason.'
                  }
                />
              ) : (
                dashboard.feed.map(renderSignal)
              )}
            </div>
          ) : null}

          {tab === 'brief' ? (
            <Panel title="AURA daily brief">
              <p className="text-sm text-slate-300">{dashboard.brief.summary}</p>
              {dashboard.brief.rationale ? (
                <p className="mt-1 text-xs text-slate-400">{dashboard.brief.rationale}</p>
              ) : null}
              <ul className="mt-3 space-y-2">
                {dashboard.brief.lines.map((line) => (
                  <li key={line.groupKey} className="text-sm text-slate-200">
                    <span className="text-xs uppercase tracking-wide text-slate-400">
                      {line.label} · {line.severity}
                    </span>
                    <br />
                    {line.title}
                    {line.eventCount > 1 ? ` (${line.eventCount} rows)` : ''}
                  </li>
                ))}
              </ul>

              <h3 className="mt-6 text-sm font-semibold text-slate-200">Evidence by category</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                {dashboard.coverage.map((entry) => (
                  <li key={entry.category}>
                    {entry.label}: {entry.availability}
                    {entry.evidenceCount > 0 ? ` (${entry.evidenceCount} row(s))` : ''}
                    {entry.rationale ? ` — ${entry.rationale}` : ''}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {tab === 'held' ? (
            <Panel title="Held back from the live feed">
              {dashboard.suppressed.length === 0 ? (
                <p className="text-sm text-slate-300">Nothing is being held back.</p>
              ) : (
                <ul className="space-y-2">
                  {dashboard.suppressed.map((held) => (
                    <li key={`${held.groupKey}-${held.reason}`} className="text-sm text-slate-300">
                      <span className="font-medium">{held.title}</span>{' '}
                      <span className="text-xs text-slate-400">
                        ({SN_CATEGORY_LABELS[held.category]} · {held.severity})
                      </span>
                      <br />
                      <span className="text-xs text-slate-400">{held.explanation}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'approvals' ? (
            <Panel title="Recommendations awaiting a decision">
              <div className="mb-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void withFeedback(
                      () => refreshSnActionDrafts(accessToken ?? '', { submitForApproval: true }),
                      'Recommendations refreshed from the current signals.',
                    )
                  }
                >
                  Draft from current signals
                </Button>
              </div>
              {dashboard.actionDrafts.length === 0 ? (
                <p className="text-sm text-slate-300">
                  No recommendation has been drafted. Recommendations are only created from real
                  critical or high signals.
                </p>
              ) : (
                <ul className="space-y-3">
                  {dashboard.actionDrafts.map((action) => (
                    <li key={action.id} className="rounded-lg border border-slate-700 p-3">
                      <p className="text-sm font-semibold text-slate-100">{action.title}</p>
                      <p className="mt-1 whitespace-pre-line text-xs text-slate-400">{action.body}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {action.status} · created {formatWhen(action.createdAt)}
                      </p>
                      {canManage &&
                      (action.status === 'draft' || action.status === 'pending_approval') ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decideSnActionDraft(accessToken ?? '', action.id, {
                                    decision: 'approve',
                                  }),
                                'Approved. The decision is recorded and nothing was executed.',
                              )
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  decideSnActionDraft(accessToken ?? '', action.id, {
                                    decision: 'reject',
                                  }),
                                'Rejected.',
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
          ) : null}

          {tab === 'controls' ? (
            <div className="space-y-4">
              {!canManage ? (
                <Panel title="Owner controls">
                  <p className="text-sm text-slate-300">
                    Notification categories and thresholds are set by the Owner. Your feed follows
                    those settings.
                  </p>
                </Panel>
              ) : (
                <>
                  <Panel title="Feed limits">
                    <p className="text-sm text-slate-300">
                      The live feed shows at most {dashboard.settings.maxFeedItems} signal(s) and the
                      daily brief at most {dashboard.settings.maxBriefItems} line(s). Anything over
                      the limit moves to the brief rather than being dropped.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-400">Global minimum severity</span>
                      {SN_SEVERITIES.map((severity) => (
                        <Button
                          key={severity}
                          variant={
                            dashboard.settings.globalMinSeverity === severity
                              ? 'primary'
                              : 'secondary'
                          }
                          onClick={() =>
                            void withFeedback(
                              () =>
                                updateSnSettings(accessToken ?? '', {
                                  globalMinSeverity: severity,
                                }),
                              'Global minimum severity updated.',
                            )
                          }
                        >
                          {severity}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void withFeedback(
                            () =>
                              updateSnSettings(accessToken ?? '', {
                                dailyBriefEnabled: !dashboard.settings.dailyBriefEnabled,
                              }),
                            'Daily brief preference updated.',
                          )
                        }
                      >
                        {dashboard.settings.dailyBriefEnabled
                          ? 'Switch daily brief off'
                          : 'Switch daily brief on'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void withFeedback(
                            () =>
                              updateSnSettings(accessToken ?? '', {
                                groupDuplicatesEnabled:
                                  !dashboard.settings.groupDuplicatesEnabled,
                              }),
                            'Duplicate grouping preference updated.',
                          )
                        }
                      >
                        {dashboard.settings.groupDuplicatesEnabled
                          ? 'Stop grouping duplicates'
                          : 'Group duplicates'}
                      </Button>
                    </div>
                  </Panel>

                  <Panel title="Categories and thresholds">
                    <ul className="space-y-3">
                      {dashboard.controls.map((control) => (
                        <li key={control.category} className="rounded-lg border border-slate-700 p-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-slate-100">
                              {control.label}
                            </span>
                            {control.ownerOnly ? (
                              <span className="text-xs uppercase tracking-wide text-amber-300">
                                Owner only
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              variant={control.enabled ? 'primary' : 'secondary'}
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    updateSnCategoryControl(
                                      accessToken ?? '',
                                      control.category as SnCategory,
                                      { enabled: !control.enabled },
                                    ),
                                  `${control.label} ${control.enabled ? 'switched off' : 'switched on'}.`,
                                )
                              }
                            >
                              {control.enabled ? 'On' : 'Off'}
                            </Button>
                            <Button
                              variant={control.digestOnly ? 'primary' : 'secondary'}
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    updateSnCategoryControl(
                                      accessToken ?? '',
                                      control.category as SnCategory,
                                      { digestOnly: !control.digestOnly },
                                    ),
                                  `${control.label} digest preference updated.`,
                                )
                              }
                            >
                              {control.digestOnly ? 'Brief only' : 'Live feed'}
                            </Button>
                            <span className="text-xs text-slate-400">Minimum</span>
                            {SN_SEVERITIES.map((severity) => (
                              <Button
                                key={severity}
                                variant={control.minSeverity === severity ? 'primary' : 'secondary'}
                                onClick={() =>
                                  void withFeedback(
                                    () =>
                                      updateSnCategoryControl(
                                        accessToken ?? '',
                                        control.category as SnCategory,
                                        { minSeverity: severity },
                                      ),
                                    `${control.label} threshold updated.`,
                                  )
                                }
                              >
                                {severity}
                              </Button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                </>
              )}
            </div>
          ) : null}

          {tab === 'audit' ? (
            <Panel title="Decision history">
              <p className="text-sm text-slate-300">
                Every acknowledge, snooze, dismiss, escalate and control change is recorded. A
                dismissal hides a signal from the feed; it never removes the history.
              </p>
              {canManage ? (
                <div className="mt-3">
                  <Button variant="secondary" onClick={() => void openCompanyAudit()}>
                    Load company history
                  </Button>
                </div>
              ) : null}
              <ul className="mt-3 space-y-1 text-xs text-slate-400">
                {companyAudit.length === 0 ? (
                  <li>No history loaded.</li>
                ) : (
                  companyAudit.map((entry) => (
                    <li key={entry.id}>
                      {formatWhen(entry.occurredAt)} — {entry.kind}
                      {entry.groupKey ? ` — ${entry.groupKey}` : ''}
                      {entry.notes ? ` — ${entry.notes}` : ''}
                    </li>
                  ))
                )}
              </ul>
            </Panel>
          ) : null}

          {dashboard.hiddenCategories.length > 0 ? (
            <Panel title="Not shown to your role">
              <p className="text-sm text-slate-300">
                {dashboard.hiddenCategories
                  .map((category) => SN_CATEGORY_LABELS[category])
                  .join(', ')}
                .
              </p>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
