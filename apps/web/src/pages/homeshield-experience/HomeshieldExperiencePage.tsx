import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { HsDashboard } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  createHsBenefit,
  createHsOutreach,
  createHsPlan,
  createHsReminder,
  createHsSubscription,
  decideHsAuraInsight,
  decideHsOutreach,
  decideHsRenewal,
  fetchHsDashboard,
  HomeshieldExperienceApiClientError,
  refreshHsAuraInsights,
  refreshHsRenewals,
  updateHsSettings,
} from '../../lib/homeshield-experience-api-client';

type Tab =
  | 'dashboard'
  | 'plans'
  | 'subscriptions'
  | 'benefits'
  | 'reminders'
  | 'history'
  | 'renewals'
  | 'outreach'
  | 'aura'
  | 'settings';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  return (
    permissions.includes('*') ||
    permissions.includes('customers:read') ||
    permissions.includes('customers:write') ||
    permissions.includes('portal:read') ||
    permissions.includes('portal:manage') ||
    permissions.includes('agents:read') ||
    permissions.includes('finance:read') ||
    permissions.includes('finance:write')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  return (
    permissions.includes('*') ||
    permissions.includes('customers:write') ||
    permissions.includes('portal:manage') ||
    permissions.includes('finance:write')
  );
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canWrite(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return roleName === 'Company Owner' || roleName === 'Owner' || roleName === 'Platform Owner';
}

export function HomeshieldExperiencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<HsDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [planName, setPlanName] = useState('');
  const [planPrice, setPlanPrice] = useState('0');
  const [subPlanId, setSubPlanId] = useState('');
  const [subCustomerId, setSubCustomerId] = useState('');
  const [benefitTitle, setBenefitTitle] = useState('');
  const [benefitPlanId, setBenefitPlanId] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderBody, setReminderBody] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [reminderCustomerId, setReminderCustomerId] = useState('');
  const [outreachCustomerId, setOutreachCustomerId] = useState('');
  const [outreachSubject, setOutreachSubject] = useState('');
  const [outreachBody, setOutreachBody] = useState('');
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
    const data = await fetchHsDashboard(accessToken);
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
            err instanceof HomeshieldExperienceApiClientError
              ? err.message
              : 'Unable to load HomeShield Experience',
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
        err instanceof HomeshieldExperienceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  async function run(ok: string, action: () => Promise<unknown>) {
    await withFeedback(action, ok);
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader title="HomeShield Experience" description="Membership & renewals" />
        <EmptyState
          title="Access restricted"
          description="Customers, portal, agents, or finance permissions are required. Technicians and clients cannot access this Owner surface."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'plans', label: 'Plans' },
    { id: 'subscriptions', label: 'Subscriptions' },
    { id: 'benefits', label: 'Benefits' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'history', label: 'Maintenance history' },
    { id: 'renewals', label: 'Renewals' },
    { id: 'outreach', label: 'Outreach' },
    { id: 'aura', label: 'AURA Insights' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="HomeShield Experience"
        description="Membership plans, benefits, service history, reminders, renewals, retention insights, and Owner-gated AURA drafts — extending Recurring Maintenance, Portal, Communication, and Billing (never auto-bill)"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/recurring-maintenance" className="yg-link">
          Recurring Maintenance
        </Link>
        <Link href="/customer-experience" className="yg-link">
          Customer Experience
        </Link>
        <Link href="/email-centre" className="yg-link">
          Email Centre
        </Link>
        <Link href="/finance/invoices" className="yg-link">
          Billing
        </Link>
      </div>

      <Panel title="Policy" className="yg-panel-accent">
        <p className="text-sm">
          No fake memberships. No automatic billing or charges. AURA renewal/maintenance/customer-value/retention drafts and outreach require. No automatic billing or charges. Renewal and outreach drafts require
          Owner approval. Customers see only their own membership in the portal. Maintenance history
          is read from Recurring Maintenance — never invented.
        </p>
      </Panel>

      {error ? (
        <Panel title="Error" className="border-rose-500/40 bg-rose-950/30 text-rose-100">
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
            variant={tab === item.id ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <Panel title="Loading">
          <p className="text-sm text-slate-300">Loading HomeShield Experience…</p>
        </Panel>
      ) : (
        <>
          {tab === 'dashboard' ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Plans" value={String(dashboard.membership.planCount)} />
                <StatCard
                  label="Active subscriptions"
                  value={String(dashboard.membership.activeSubscriptionCount)}
                />
                <StatCard
                  label="Pending renewals"
                  value={String(dashboard.pendingRenewalApprovals)}
                />
                <StatCard
                  label="Pending outreach"
                  value={String(dashboard.pendingOutreachApprovals)}
                />
              </div>
              <Panel title="Summary">
                <p className="text-sm text-slate-200">{dashboard.summary}</p>
                <p className="mt-2 text-sm text-slate-400">{dashboard.membership.rationale}</p>
                {dashboard.retention ? (
                  <p className="mt-2 text-sm text-slate-300">{dashboard.retention.rationale}</p>
                ) : null}
              </Panel>
              <Panel title="Customer lifetime value">
                <p className="text-sm text-slate-200">
                  Status: {dashboard.customerLifetimeValue.availability}
                  {dashboard.customerLifetimeValue.estimatedValueCents != null
                    ? ` · ${dashboard.customerLifetimeValue.currency ?? ''} ${(
                        dashboard.customerLifetimeValue.estimatedValueCents / 100
                      ).toFixed(2)}`
                    : ' · no stored value'}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {dashboard.customerLifetimeValue.rationale}
                </p>
              </Panel>
              <Panel title="Connections">
                <ul className="space-y-2 text-sm">
                  {dashboard.connections.map((c) => (
                    <li key={c.key}>
                      <Link href={c.href} className="yg-link">
                        {c.label}
                      </Link>
                      <span className="ml-2 text-slate-400">{c.note}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}

          {tab === 'plans' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create membership plan">
                  <form
                    className="flex flex-wrap gap-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (!accessToken || !planName.trim()) return;
                      void withFeedback(
                        () =>
                          createHsPlan(accessToken, {
                            name: planName.trim(),
                            priceCents: Math.max(0, Math.round(Number(planPrice) || 0)),
                            status: 'draft',
                          }),
                        'Plan created (draft)',
                      ).then(() => {
                        setPlanName('');
                        setPlanPrice('0');
                      });
                    }}
                  >
                    <Input
                      placeholder="Plan name"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                    />
                    <Input
                      placeholder="Price (cents)"
                      value={planPrice}
                      onChange={(e) => setPlanPrice(e.target.value)}
                    />
                    <Button type="submit">Create plan</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Membership plans">
                {dashboard.plans.length === 0 ? (
                  <EmptyState
                    title="No membership plans"
                    description="Create a real HomeShield plan — none are invented for demo."
                  />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {dashboard.plans.map((p) => (
                      <li key={p.id} className="rounded border border-slate-700/60 p-3">
                        <strong>{p.name}</strong>
                        <span className="ml-2 text-slate-400">
                          {p.status} · {(p.priceCents / 100).toFixed(2)} {p.currency} /{' '}
                          {p.billingInterval} · {p.benefitCount} benefit(s)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'subscriptions' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Link subscription to real customer">
                  <form
                    className="flex flex-wrap gap-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (!accessToken || !subPlanId.trim() || !subCustomerId.trim()) return;
                      void withFeedback(
                        () =>
                          createHsSubscription(accessToken, {
                            planId: subPlanId.trim(),
                            customerId: subCustomerId.trim(),
                            status: 'draft',
                          }),
                        'Subscription created (draft — no auto-billing)',
                      ).then(() => {
                        setSubPlanId('');
                        setSubCustomerId('');
                      });
                    }}
                  >
                    <Input
                      placeholder="Plan UUID"
                      value={subPlanId}
                      onChange={(e) => setSubPlanId(e.target.value)}
                    />
                    <Input
                      placeholder="Customer UUID"
                      value={subCustomerId}
                      onChange={(e) => setSubCustomerId(e.target.value)}
                    />
                    <Button type="submit">Create subscription</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Subscriptions">
                {dashboard.subscriptions.length === 0 ? (
                  <EmptyState
                    title="No subscriptions"
                    description="Link a real customer to a real plan. Fake subscriptions are not created."
                  />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {dashboard.subscriptions.map((s) => (
                      <li key={s.id} className="rounded border border-slate-700/60 p-3">
                        <strong>{s.customerName ?? s.customerId}</strong>
                        <span className="ml-2 text-slate-400">
                          {s.planName ?? s.planId} · {s.status}
                          {s.renewsAt ? ` · renews ${s.renewsAt.slice(0, 10)}` : ''}
                          {' · auto-billing off'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'benefits' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Add benefit">
                  <form
                    className="flex flex-wrap gap-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (!accessToken || !benefitTitle.trim()) return;
                      void withFeedback(
                        () =>
                          createHsBenefit(accessToken, {
                            title: benefitTitle.trim(),
                            planId: benefitPlanId.trim() || null,
                          }),
                        'Benefit created',
                      ).then(() => {
                        setBenefitTitle('');
                        setBenefitPlanId('');
                      });
                    }}
                  >
                    <Input
                      placeholder="Benefit title"
                      value={benefitTitle}
                      onChange={(e) => setBenefitTitle(e.target.value)}
                    />
                    <Input
                      placeholder="Plan UUID (optional)"
                      value={benefitPlanId}
                      onChange={(e) => setBenefitPlanId(e.target.value)}
                    />
                    <Button type="submit">Add benefit</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Customer benefits">
                {dashboard.benefits.length === 0 ? (
                  <EmptyState
                    title="No benefits"
                    description="Benefits appear here when linked to real membership plans."
                  />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {dashboard.benefits.map((b) => (
                      <li key={b.id}>
                        <strong>{b.title}</strong>
                        <span className="ml-2 text-slate-400">
                          {b.isActive ? 'active' : 'inactive'}
                          {b.description ? ` — ${b.description}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'reminders' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Create service reminder">
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (!accessToken || !reminderTitle.trim() || !reminderBody.trim() || !reminderAt)
                        return;
                      void withFeedback(
                        () =>
                          createHsReminder(accessToken, {
                            title: reminderTitle.trim(),
                            body: reminderBody.trim(),
                            remindAt: new Date(reminderAt).toISOString(),
                            customerId: reminderCustomerId.trim() || null,
                          }),
                        'Reminder created',
                      ).then(() => {
                        setReminderTitle('');
                        setReminderBody('');
                        setReminderAt('');
                        setReminderCustomerId('');
                      });
                    }}
                  >
                    <Input
                      placeholder="Title"
                      value={reminderTitle}
                      onChange={(e) => setReminderTitle(e.target.value)}
                    />
                    <Input
                      placeholder="Body"
                      value={reminderBody}
                      onChange={(e) => setReminderBody(e.target.value)}
                    />
                    <Input
                      type="datetime-local"
                      value={reminderAt}
                      onChange={(e) => setReminderAt(e.target.value)}
                    />
                    <Input
                      placeholder="Customer UUID (optional)"
                      value={reminderCustomerId}
                      onChange={(e) => setReminderCustomerId(e.target.value)}
                    />
                    <Button type="submit">Create reminder</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Service reminders">
                {dashboard.reminders.length === 0 ? (
                  <EmptyState
                    title="No reminders"
                    description="Service reminders for members appear here when scheduled."
                  />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {dashboard.reminders.map((r) => (
                      <li key={r.id}>
                        <strong>{r.title}</strong>
                        <span className="ml-2 text-slate-400">
                          {r.status} · {r.remindAt.slice(0, 16)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'history' ? (
            <Panel title="Maintenance history (Recurring Maintenance)">
              {dashboard.maintenanceHistory.length === 0 ? (
                <EmptyState
                  title="No maintenance history"
                  description="Completed or recorded maintenance runs from Recurring Maintenance appear here — not invented."
                />
              ) : (
                <ul className="space-y-2 text-sm">
                  {dashboard.maintenanceHistory.map((h) => (
                    <li key={h.runId}>
                      <strong>{h.planName ?? h.planId}</strong>
                      <span className="ml-2 text-slate-400">
                        {h.status}
                        {h.completedAt ? ` · ${h.completedAt.slice(0, 10)}` : ''}
                        {h.plumbingKind ? ` · ${h.plumbingKind}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'renewals' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Refresh renewal drafts">
                  <p className="mb-3 text-sm text-slate-400">
                    Creates draft recommendations from real subscriptions nearing renewsAt. Never
                    charges or invoices.
                  </p>
                  <Button
                    onClick={() =>
                      void withFeedback(
                        () => refreshHsRenewals(accessToken!, { submitForApproval: true }),
                        'Renewal drafts refreshed (no billing)',
                      )
                    }
                  >
                    Refresh renewal opportunities
                  </Button>
                </Panel>
              ) : null}
              <Panel title="Renewal opportunities">
                {dashboard.renewalOpportunities.length === 0 ? (
                  <EmptyState
                    title="No renewal opportunities"
                    description="Drafts appear when real subscriptions approach renewal — never invented."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.renewalOpportunities.map((r) => (
                      <li key={r.id} className="rounded border border-slate-700/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{r.title}</strong>
                          <span className="text-slate-400">{r.status}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-slate-300">{r.body}</p>
                        {canOwnerApprove &&
                        (r.status === 'draft' || r.status === 'pending_approval') ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideHsRenewal(accessToken!, r.id, { decision: 'approve' }),
                                  'Renewal approved (still no auto-charge)',
                                )
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideHsRenewal(accessToken!, r.id, { decision: 'reject' }),
                                  'Renewal rejected',
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

          {tab === 'outreach' ? (
            <div className="space-y-4">
              {canManage ? (
                <Panel title="Draft outreach (never auto-sends)">
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      if (
                        !accessToken ||
                        !outreachCustomerId.trim() ||
                        !outreachSubject.trim() ||
                        !outreachBody.trim()
                      )
                        return;
                      void withFeedback(
                        () =>
                          createHsOutreach(accessToken, {
                            customerId: outreachCustomerId.trim(),
                            subject: outreachSubject.trim(),
                            body: outreachBody.trim(),
                            submitForApproval: true,
                          }),
                        'Outreach draft created (not sent)',
                      ).then(() => {
                        setOutreachCustomerId('');
                        setOutreachSubject('');
                        setOutreachBody('');
                      });
                    }}
                  >
                    <Input
                      placeholder="Customer UUID"
                      value={outreachCustomerId}
                      onChange={(e) => setOutreachCustomerId(e.target.value)}
                    />
                    <Input
                      placeholder="Subject"
                      value={outreachSubject}
                      onChange={(e) => setOutreachSubject(e.target.value)}
                    />
                    <Input
                      placeholder="Body"
                      value={outreachBody}
                      onChange={(e) => setOutreachBody(e.target.value)}
                    />
                    <Button type="submit">Create outreach draft</Button>
                  </form>
                </Panel>
              ) : null}
              <Panel title="Outreach drafts">
                {dashboard.outreachDrafts.length === 0 ? (
                  <EmptyState
                    title="No outreach drafts"
                    description="Approval-gated membership messages appear here. Nothing auto-sends."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.outreachDrafts.map((d) => (
                      <li key={d.id} className="rounded border border-slate-700/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{d.subject}</strong>
                          <span className="text-slate-400">{d.status}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-slate-300">{d.body}</p>
                        {canOwnerApprove &&
                        (d.status === 'draft' || d.status === 'pending_approval') ? (
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideHsOutreach(accessToken!, d.id, { decision: 'approve' }),
                                  'Outreach approved (still not sent)',
                                )
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideHsOutreach(accessToken!, d.id, { decision: 'reject' }),
                                  'Outreach rejected',
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


          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="Refresh AURA recommendation drafts">
                <p className="mb-3 text-sm text-slate-400">
                  Builds renewal, maintenance, customer value, and retention recommendation drafts
                  from real membership and maintenance signals. Owner approval required — never auto-bill.
                </p>
                <Button
                  type="button"
                  disabled={!canManage || !accessToken}
                  onClick={() =>
                    run('AURA insight drafts refreshed', () =>
                      refreshHsAuraInsights(accessToken!, { submitForApproval: true }),
                    )
                  }
                >
                  Refresh AURA insights
                </Button>
              </Panel>
              {!(dashboard.auraInsights?.length) ? (
                <EmptyState
                  title="No AURA insights"
                  description="Renewal, maintenance, customer value, and retention drafts appear when real membership signals exist."
                />
              ) : (
                <div className="space-y-3">
                  {dashboard.auraInsights.map((insight) => (
                    <Panel key={insight.id} title={`${insight.kind} · ${insight.status}`}>
                      <p className="text-sm font-medium text-slate-100">{insight.title}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{insight.body}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        autoBilling={String(insight.autoBilling)} · autoExecuted={String(insight.autoExecuted)}
                      </p>
                      {canOwnerApprove && (insight.status === 'pending_approval' || insight.status === 'draft') ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            onClick={() =>
                              run('AURA insight approved (no billing change)', () =>
                                decideHsAuraInsight(accessToken!, insight.id, { decision: 'approve' }),
                              )
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              run('AURA insight rejected', () =>
                                decideHsAuraInsight(accessToken!, insight.id, { decision: 'reject' }),
                              )
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </Panel>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'settings' ? (
            <Panel title="Settings">
              <p className="mb-3 text-sm text-slate-400">
                Auto-billing and auto-charge are permanently off. Only Company Owner may change
                sensitive toggles.
              </p>
              <ul className="mb-4 space-y-1 text-sm text-slate-300">
                <li>Auto-billing: off</li>
                <li>Auto-charge: off</li>
                <li>
                  Renewal drafts:{' '}
                  {dashboard.settings.renewalDraftsEnabled ? 'enabled' : 'disabled'}
                </li>
                <li>
                  Outreach drafts:{' '}
                  {dashboard.settings.outreachDraftsEnabled ? 'enabled' : 'disabled'}
                </li>
              </ul>
              {canOwnerApprove ? (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (!accessToken) return;
                    void withFeedback(
                      () =>
                        updateHsSettings(accessToken, {
                          notes: settingsNotes.trim() || null,
                        }),
                      'Settings updated',
                    );
                  }}
                >
                  <Input
                    placeholder="Owner notes"
                    value={settingsNotes}
                    onChange={(e) => setSettingsNotes(e.target.value)}
                  />
                  <Button type="submit">Save notes</Button>
                </form>
              ) : (
                <p className="text-sm text-slate-400">Owner access required to edit settings.</p>
              )}
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
