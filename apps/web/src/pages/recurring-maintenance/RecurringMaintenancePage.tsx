import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type {
  OpsMaintenanceAuraSuggestionSummary,
  OpsMaintenanceCommRequestSummary,
  OpsMaintenanceDueItem,
  OpsMaintenanceReminderSummary,
  OpsMaintenanceRunSummary,
  OpsRecurringMaintenanceOverview,
  OpsRecurringMaintenancePlanSummary,
  PlumbingEquipmentKind,
} from '@titan/shared';
import { PLUMBING_EQUIPMENT_KIND_LABELS } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeRecurringMaintenanceReminder,
  completeRecurringMaintenanceCycle,
  createRecurringMaintenanceCommRequest,
  createRecurringMaintenancePlan,
  decideRecurringMaintenanceAuraSuggestion,
  decideRecurringMaintenanceCommRequest,
  executeRecurringMaintenanceCommRequest,
  fetchRecurringMaintenanceAuraSuggestions,
  fetchRecurringMaintenanceCommRequests,
  fetchRecurringMaintenanceDue,
  fetchRecurringMaintenanceHistory,
  fetchRecurringMaintenanceOverview,
  fetchRecurringMaintenancePlans,
  fetchRecurringMaintenanceReminders,
  generateRecurringMaintenanceAuraSuggestions,
  generateRecurringMaintenanceDue,
  RecurringMaintenanceApiClientError,
} from '../../lib/recurring-maintenance-api-client';

type Tab = 'overview' | 'plans' | 'due' | 'history' | 'approvals' | 'aura';

function canAccess(permissions: string[]) {
  return (
    permissions.includes('*') ||
    permissions.includes('asset_equipment:read') ||
    permissions.includes('asset_lifecycle:read') ||
    permissions.includes('ops:read') ||
    permissions.includes('ops:manage')
  );
}

function canWrite(permissions: string[]) {
  return (
    permissions.includes('*') ||
    permissions.includes('asset_equipment:write') ||
    permissions.includes('asset_lifecycle:write') ||
    permissions.includes('asset_lifecycle:manage') ||
    permissions.includes('ops:manage')
  );
}

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function kindLabel(kind: PlumbingEquipmentKind) {
  return PLUMBING_EQUIPMENT_KIND_LABELS[kind] ?? kind;
}

export function RecurringMaintenancePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<OpsRecurringMaintenanceOverview | null>(null);
  const [plans, setPlans] = useState<OpsRecurringMaintenancePlanSummary[]>([]);
  const [dueItems, setDueItems] = useState<OpsMaintenanceDueItem[]>([]);
  const [history, setHistory] = useState<OpsMaintenanceRunSummary[]>([]);
  const [reminders, setReminders] = useState<OpsMaintenanceReminderSummary[]>([]);
  const [commRequests, setCommRequests] = useState<OpsMaintenanceCommRequestSummary[]>([]);
  const [suggestions, setSuggestions] = useState<OpsMaintenanceAuraSuggestionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newAssetId, setNewAssetId] = useState('');
  const [newIntervalDays, setNewIntervalDays] = useState('365');
  const [newKind, setNewKind] = useState<PlumbingEquipmentKind>('geyser');
  const [newNextDue, setNewNextDue] = useState('');
  const [commPlanId, setCommPlanId] = useState('');
  const [commSubject, setCommSubject] = useState('');
  const [commBody, setCommBody] = useState('');

  const canView = useMemo(() => (user ? canAccess(user.permissions) : false), [user]);
  const canManage = useMemo(() => (user ? canWrite(user.permissions) : false), [user]);

  async function loadPage() {
    if (!accessToken) return;
    const [ov, planRows, due, hist, rem, comm, aura] = await Promise.all([
      fetchRecurringMaintenanceOverview(accessToken),
      fetchRecurringMaintenancePlans(accessToken),
      fetchRecurringMaintenanceDue(accessToken),
      fetchRecurringMaintenanceHistory(accessToken),
      fetchRecurringMaintenanceReminders(accessToken),
      fetchRecurringMaintenanceCommRequests(accessToken),
      fetchRecurringMaintenanceAuraSuggestions(accessToken),
    ]);
    setOverview(ov);
    setPlans(planRows);
    setDueItems(due);
    setHistory(hist);
    setReminders(rem);
    setCommRequests(comm);
    setSuggestions(aura);
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
            err instanceof RecurringMaintenanceApiClientError
              ? err.message
              : 'Unable to load recurring maintenance',
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

  async function withFeedback(action: () => Promise<unknown>, okMessage: string) {
    if (!accessToken) return;
    try {
      setError(null);
      setSuccess(null);
      await action();
      setSuccess(okMessage);
      await loadPage();
    } catch (err) {
      setError(
        err instanceof RecurringMaintenanceApiClientError
          ? err.message
          : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Recurring Maintenance"
          description="You do not have permission to view Operations recurring maintenance."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring Maintenance"
        description="Operations maintenance plans for customer-installed equipment (geysers, PRVs, tanks). Extends live asset schedules and maintenance.due — no demo plans."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/workflow-automation">
              <Button variant="secondary">Workflow Automation</Button>
            </Link>
            <Link href="/email-centre">
              <Button variant="secondary">Email Centre</Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['overview', 'Overview'],
            ['plans', 'Plans'],
            ['due', 'Due / Missed'],
            ['history', 'History'],
            ['approvals', 'Comms approval'],
            ['aura', 'AURA drafts'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              tab === key
                ? 'yg-tab-active'
                : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-slate-400">Loading recurring maintenance…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="text-sm yg-text-accent-soft">{success}</p> : null}

      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active plans" value={String(overview.counts.activePlans)} />
          <StatCard label="Upcoming" value={String(overview.counts.upcoming)} />
          <StatCard label="Due" value={String(overview.counts.due)} />
          <StatCard label="Missed" value={String(overview.counts.missed)} />
        </div>
      ) : null}

      {tab === 'overview' && overview ? (
        <>
          <Panel title="Guarantees">
            <ul className="space-y-1 text-sm text-slate-300">
              <li>Tenant-isolated plans and runs only.</li>
              <li>No demo / fake maintenance plans or history.</li>
              <li>Reuses asset schedules + maintenance.due → Workflow Automation.</li>
              <li>Customer outbound: draft → Owner approve → Email Centre execute.</li>
              <li>In-app reminders may fire without external send.</li>
              <li>AURA suggestions stay draft until Owner acknowledgment (never auto-execute).</li>
            </ul>
          </Panel>

          <Panel title="Actions">
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void withFeedback(
                      () => generateRecurringMaintenanceDue(accessToken!),
                      'Due generation ran against live schedules (maintenance.due emitted when applicable).',
                    )
                  }
                >
                  Generate due & reminders
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void withFeedback(
                      () => generateRecurringMaintenanceAuraSuggestions(accessToken!),
                      'AURA draft suggestions generated from real plan state.',
                    )
                  }
                >
                  Generate AURA drafts
                </Button>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Write permission required to generate dues.</p>
            )}
          </Panel>

          <Panel title="Pending in-app reminders">
            {reminders.filter((r) => r.status === 'pending').length === 0 ? (
              <EmptyState
                title="No pending reminders"
                description="In-app reminders appear when active plans approach their due date."
              />
            ) : (
              <ul className="space-y-3">
                {reminders
                  .filter((r) => r.status === 'pending')
                  .map((item) => (
                    <li
                      key={item.id}
                      className="yg-card-accent rounded p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-100">{item.title}</p>
                          <p className="mt-1 text-sm text-slate-400">
                            Remind at {formatWhen(item.remindAt)}
                          </p>
                        </div>
                        {canManage ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              void withFeedback(
                                () =>
                                  acknowledgeRecurringMaintenanceReminder(accessToken!, item.id),
                                'Reminder acknowledged.',
                              )
                            }
                          >
                            Acknowledge
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {tab === 'plans' ? (
        <>
          {canManage ? (
            <Panel title="Create plan">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Name
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Annual geyser service"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Asset ID
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    value={newAssetId}
                    onChange={(e) => setNewAssetId(e.target.value)}
                    placeholder="Existing asset_equipment UUID"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Interval (days)
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    value={newIntervalDays}
                    onChange={(e) => setNewIntervalDays(e.target.value)}
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Plumbing kind
                  <select
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as PlumbingEquipmentKind)}
                  >
                    {(
                      [
                        'geyser',
                        'prv',
                        'tank',
                        'installed_equipment',
                        'other',
                      ] as PlumbingEquipmentKind[]
                    ).map((kind) => (
                      <option key={kind} value={kind}>
                        {kindLabel(kind)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-300 sm:col-span-2">
                  Next due (optional ISO)
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    value={newNextDue}
                    onChange={(e) => setNewNextDue(e.target.value)}
                    placeholder="2026-09-01T08:00:00.000Z"
                  />
                </label>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  onClick={() =>
                    void withFeedback(async () => {
                      const intervalDays = Number(newIntervalDays);
                      if (!newName.trim() || !newAssetId.trim()) {
                        throw new RecurringMaintenanceApiClientError(
                          'Name and asset ID are required',
                          400,
                          'VALIDATION_ERROR',
                        );
                      }
                      await createRecurringMaintenancePlan(accessToken!, {
                        name: newName.trim(),
                        assetId: newAssetId.trim(),
                        intervalDays,
                        plumbingKind: newKind,
                        nextDueAt: newNextDue.trim() || null,
                        status: 'active',
                      });
                      setNewName('');
                      setNewAssetId('');
                      setNewNextDue('');
                    }, 'Plan created and linked to asset schedule.')
                  }
                >
                  Create plan
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Customer/property are pulled from the asset registry profile when present. Asset type
                stays <code>equipment</code>; plumbing kind is tracked on the plan.
              </p>
            </Panel>
          ) : null}

          <Panel title="Maintenance plans">
            {plans.length === 0 ? (
              <EmptyState
                title="No maintenance plans yet"
                description="Create a plan against a real asset. Nothing is seeded as demo data."
              />
            ) : (
              <ul className="space-y-3">
                {plans.map((plan) => (
                  <li
                    key={plan.id}
                    className="yg-card-accent rounded p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-100">{plan.name}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {kindLabel(plan.plumbingKind)} · every {plan.intervalDays} days ·{' '}
                          {plan.status}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Next due {formatWhen(plan.nextDueAt)} · Last completed{' '}
                          {formatWhen(plan.lastCompletedAt)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Asset {plan.assetId}
                          {plan.customerId ? ` · Customer ${plan.customerId}` : ''}
                          {plan.propertyId ? ` · Property ${plan.propertyId}` : ''}
                          {plan.jobId ? ` · Job ${plan.jobId}` : ''}
                          {plan.documentIds.length
                            ? ` · ${plan.documentIds.length} document(s)`
                            : ''}
                        </p>
                      </div>
                      {canManage && plan.status === 'active' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            void withFeedback(
                              () => completeRecurringMaintenanceCycle(accessToken!, plan.id),
                              'Cycle completed — next due rolled forward.',
                            )
                          }
                        >
                          Complete cycle
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {tab === 'due' ? (
        <Panel title="Due / missed / upcoming">
          {dueItems.length === 0 ? (
            <EmptyState
              title="No active due items"
              description="Activate plans with next due dates to see upcoming, due, and missed maintenance."
            />
          ) : (
            <ul className="space-y-3">
              {dueItems.map((item) => (
                <li
                  key={item.planId}
                  className="yg-card-accent rounded p-3"
                >
                  <p className="font-medium text-slate-100">{item.planName}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    <span className="yg-text-accent-soft">{item.bucket}</span>
                    {' · '}
                    {kindLabel(item.plumbingKind)}
                    {' · '}
                    due {formatWhen(item.nextDueAt)}
                    {item.daysUntilDue !== null ? ` (${item.daysUntilDue} days)` : ''}
                  </p>
                  {item.dueRecordId ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Linked due record {item.dueRecordId} ({item.dueStatus})
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'history' ? (
        <Panel title="Maintenance history">
          {history.length === 0 ? (
            <EmptyState
              title="No maintenance history"
              description="Completed cycles create history runs linked to asset maintenance records and optional jobs/documents."
            />
          ) : (
            <ul className="space-y-3">
              {history.map((run) => (
                <li
                  key={run.id}
                  className="rounded border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-300"
                >
                  <span className="yg-text-accent-soft">{run.status}</span>
                  {' · '}
                  {formatWhen(run.completedAt)}
                  {run.jobId ? ` · job ${run.jobId}` : ''}
                  {run.maintenanceRecordId ? ` · record ${run.maintenanceRecordId}` : ''}
                  {run.notes ? ` · ${run.notes}` : ''}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === 'approvals' ? (
        <>
          {canManage ? (
            <Panel title="Draft customer communication">
              <div className="grid gap-3">
                <label className="block text-sm text-slate-300">
                  Plan ID (optional)
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    value={commPlanId}
                    onChange={(e) => setCommPlanId(e.target.value)}
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Subject
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    value={commSubject}
                    onChange={(e) => setCommSubject(e.target.value)}
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Body
                  <textarea
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    rows={4}
                    value={commBody}
                    onChange={(e) => setCommBody(e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  onClick={() =>
                    void withFeedback(async () => {
                      await createRecurringMaintenanceCommRequest(accessToken!, {
                        planId: commPlanId.trim() || null,
                        subject: commSubject.trim(),
                        body: commBody.trim(),
                      });
                      setCommSubject('');
                      setCommBody('');
                    }, 'Communication request queued for Owner approval (not sent).')
                  }
                >
                  Queue for Owner approval
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Never auto-sends. After Owner approve → execute, an Email Centre draft is created;
                Email Centre still requires its own approve → execute.
              </p>
            </Panel>
          ) : null}

          <Panel title="Customer communication approval queue">
            {commRequests.length === 0 ? (
              <EmptyState
                title="No communication requests"
                description="Customer-facing maintenance messages appear here as drafts until Owner approval."
              />
            ) : (
              <ul className="space-y-3">
                {commRequests.map((item) => (
                  <li
                    key={item.id}
                    className="yg-card-accent rounded p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-100">{item.subject}</p>
                        <p className="mt-1 text-sm text-slate-400">{item.body}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Status {item.status}
                          {item.emailDraftId ? ` · Email draft ${item.emailDraftId}` : ''}
                          {' · '}
                          {formatWhen(item.createdAt)}
                        </p>
                      </div>
                      {canManage ? (
                        <div className="flex flex-wrap gap-2">
                          {['draft', 'pending_approval'].includes(item.status) ? (
                            <>
                              <Button
                                type="button"
                                onClick={() =>
                                  void withFeedback(
                                    () =>
                                      decideRecurringMaintenanceCommRequest(
                                        accessToken!,
                                        item.id,
                                        'approve',
                                      ),
                                    'Approved — execute to create Email Centre draft.',
                                  )
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  void withFeedback(
                                    () =>
                                      decideRecurringMaintenanceCommRequest(
                                        accessToken!,
                                        item.id,
                                        'reject',
                                      ),
                                    'Communication request rejected.',
                                  )
                                }
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {item.status === 'approved' ? (
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    executeRecurringMaintenanceCommRequest(accessToken!, item.id),
                                  'Email Centre draft created. Approve & execute there to send.',
                                )
                              }
                            >
                              Create Email Centre draft
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {tab === 'aura' ? (
        <Panel title="AURA maintenance suggestions (draft only)">
          {suggestions.length === 0 ? (
            <EmptyState
              title="No AURA suggestions"
              description="Generate drafts from real upcoming/missed plans. Suggestions never auto-execute or message customers."
            />
          ) : (
            <ul className="space-y-3">
              {suggestions.map((item) => (
                <li
                  key={item.id}
                  className="yg-card-accent rounded p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-100">
                        <span className="yg-text-accent-soft">{item.kind}</span> · {item.subject}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">{item.body}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.status} · autoExecuted={String(item.autoExecuted)} ·{' '}
                        {formatWhen(item.createdAt)}
                      </p>
                    </div>
                    {canManage && ['draft', 'pending_approval'].includes(item.status) ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={() =>
                            void withFeedback(
                              () =>
                                decideRecurringMaintenanceAuraSuggestion(
                                  accessToken!,
                                  item.id,
                                  'approve',
                                ),
                              'Suggestion acknowledged — no customer send or job changes.',
                            )
                          }
                        >
                          Acknowledge
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            void withFeedback(
                              () =>
                                decideRecurringMaintenanceAuraSuggestion(
                                  accessToken!,
                                  item.id,
                                  'reject',
                                ),
                              'Suggestion rejected.',
                            )
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
