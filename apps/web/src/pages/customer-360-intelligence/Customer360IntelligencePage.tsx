import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Panel, StatCard } from '@titan/ui';
import type { C360CustomerView, C360Dashboard } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  Customer360IntelligenceApiClientError,
  decideC360Insight,
  fetchC360Customer,
  fetchC360Dashboard,
  refreshC360Insights,
} from '../../lib/customer-360-intelligence-api-client';

type Tab = 'directory' | 'profile' | 'timeline' | 'insights' | 'connections';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  if (permissions.includes('*')) return true;
  if (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  ) {
    return true;
  }
  return (
    permissions.includes('customers:read') ||
    permissions.includes('customers:write') ||
    permissions.includes('customer_experience:read') ||
    permissions.includes('customer_experience:write') ||
    permissions.includes('communications:read') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  if (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner' ||
    roleName === 'Admin'
  ) {
    return true;
  }
  return (
    permissions.includes('customers:write') ||
    permissions.includes('customer_experience:write') ||
    permissions.includes('communications:write') ||
    permissions.includes('communications:manage')
  );
}

function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'Hidden';
  return `R ${(cents / 100).toFixed(2)}`;
}

export function Customer360IntelligencePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('directory');
  const [dashboard, setDashboard] = useState<C360Dashboard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customerView, setCustomerView] = useState<C360CustomerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const canView = useMemo(
    () => (user ? canAccess(user.permissions, user.roleName) : false),
    [user],
  );
  const canManage = useMemo(
    () => (user ? canWrite(user.permissions, user.roleName) : false),
    [user],
  );

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchC360Dashboard(accessToken);
    setDashboard(data);
  }

  async function loadCustomer(customerId: string) {
    if (!accessToken) return;
    const data = await fetchC360Customer(accessToken, customerId);
    setCustomerView(data);
    setSelectedId(customerId);
    setTab('profile');
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
        await loadDashboard();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Customer360IntelligenceApiClientError
              ? err.message
              : 'Unable to load Customer 360 Intelligence',
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
      await loadDashboard();
      if (selectedId) await loadCustomer(selectedId);
      setSuccess(ok);
    } catch (err) {
      setError(
        err instanceof Customer360IntelligenceApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Customer 360 Intelligence"
          description="Unified customer profile, timeline, and AURA insights"
        />
        <EmptyState
          title="Access restricted"
          description="Authorized staff only. Technicians and clients cannot open the staff Customer 360 module. Customers never see other customers."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'directory', label: 'Customers' },
    { id: 'profile', label: 'Profile 360' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'insights', label: 'AURA insights' },
    { id: 'connections', label: 'Connections' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Customer 360 Intelligence"
        description="Unified profile, timeline, and AURA recommendation drafts — extends CRM, never rebuilds it"
      />
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/crm" className="yg-link">
          CRM
        </Link>
        <Link href="/jobs" className="yg-link">
          Jobs
        </Link>
        <Link href="/finance/invoices" className="yg-link">
          Invoices
        </Link>
        <Link href="/communication-timeline" className="yg-link">
          Communication Timeline
        </Link>
        <Link href="/recurring-maintenance" className="yg-link">
          Recurring Maintenance
        </Link>
      </div>
      <Panel title="Privacy & policy" className="yg-panel-accent">
        <p className="text-sm">
          No fake customers. Tenant-isolated — no cross-customer visibility. Finance amounts and
          margins stay permission-gated. Internal notes require write access. AURA insights are
          drafts only — never auto-send.
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
          <p className="text-sm text-slate-300">Loading Customer 360…</p>
        </Panel>
      ) : (
        <>
          {tab === 'directory' ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Customers" value={String(dashboard.customerCount)} />
                <StatCard
                  label="Open insight drafts"
                  value={String(
                    dashboard.recentInsights.filter(
                      (i) => i.status === 'draft' || i.status === 'pending_approval',
                    ).length,
                  )}
                />
                <StatCard
                  label="Rebuilds CRM"
                  value="No"
                />
                <StatCard label="Auto-send" value="Off" />
              </div>
              <Panel title="Summary" className="border-slate-800 bg-slate-950/80">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-400">
                  <li>{dashboard.productClarification.existingCrm}</li>
                  <li>{dashboard.productClarification.thisLayer}</li>
                </ul>
              </Panel>
              <Panel title="Customer directory" className="yg-card-accent">
                {dashboard.customers.length === 0 ? (
                  <EmptyState
                    title="No customers yet"
                    description="Add real customers in CRM — Customer 360 will not invent them."
                  />
                ) : (
                  <div className="space-y-2">
                    {dashboard.customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => void loadCustomer(c.id).catch((err) => {
                          setError(
                            err instanceof Customer360IntelligenceApiClientError
                              ? err.message
                              : 'Unable to load customer',
                          );
                        })}
                        className="flex w-full items-center justify-between rounded border border-zinc-800 bg-slate-900/60 px-3 py-2 text-left hover:border-[color:var(--yg-blue-primary)]/40"
                      >
                        <div>
                          <p className="font-medium yg-text-accent-muted">{c.name}</p>
                          <p className="text-xs text-slate-400">
                            {c.status} · {c.jobCount} jobs · {c.openJobCount} open
                          </p>
                        </div>
                        <span className="text-xs yg-text-accent">Open 360 →</span>
                      </button>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'profile' ? (
            !customerView ? (
              <EmptyState
                title="Select a customer"
                description="Open a customer from the directory to view the unified 360 profile."
              />
            ) : (
              <div className="space-y-4">
                <Panel title="Profile" className="yg-card-accent">
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p>
                      <span className="text-slate-400">Name:</span> {customerView.profile.name}
                    </p>
                    <p>
                      <span className="text-slate-400">Status:</span> {customerView.profile.status}
                    </p>
                    <p>
                      <span className="text-slate-400">Email:</span>{' '}
                      {customerView.profile.email ?? '—'}
                    </p>
                    <p>
                      <span className="text-slate-400">Phone:</span>{' '}
                      {customerView.profile.phone ?? '—'}
                    </p>
                    <p>
                      <span className="text-slate-400">Properties:</span>{' '}
                      {customerView.profile.propertyCount}
                    </p>
                    <p>
                      <span className="text-slate-400">Do not contact:</span>{' '}
                      {customerView.profile.doNotContact ? 'Yes' : 'No'}
                    </p>
                    <p className="sm:col-span-2">
                      <span className="text-slate-400">Internal notes:</span>{' '}
                      {customerView.profile.notesHidden
                        ? 'Hidden for this role'
                        : customerView.profile.notes ?? '—'}
                    </p>
                  </div>
                  <div className="mt-3">
                    <Link
                      href={`/crm/${customerView.profile.id}`}
                      className="text-sm yg-link"
                    >
                      Open in CRM
                    </Link>
                  </div>
                </Panel>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Jobs" value={String(customerView.jobs.length)} />
                  <StatCard label="Quotes" value={String(customerView.quotes.length)} />
                  <StatCard label="Invoices" value={String(customerView.invoices.length)} />
                  <StatCard label="Payments" value={String(customerView.payments.length)} />
                </div>
                <Panel title="Customer value" className="border-slate-800 bg-slate-950/80">
                  <p className="text-sm text-slate-300">{customerView.value.rationale}</p>
                  {!customerView.value.financeHidden ? (
                    <p className="mt-2 text-sm yg-text-accent-soft">
                      Paid {formatCents(customerView.value.totalPaidCents)} · Outstanding{' '}
                      {formatCents(customerView.value.outstandingCents)}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">
                      Finance amounts hidden — requires finance:read or Owner/Admin.
                    </p>
                  )}
                </Panel>
                <Panel title="Jobs" className="border-slate-800 bg-slate-950/80">
                  {customerView.jobs.length === 0 ? (
                    <p className="text-sm text-slate-400">No jobs linked.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {customerView.jobs.slice(0, 12).map((j) => (
                        <li key={j.id} className="rounded border border-zinc-800 p-2">
                          <Link href={`/jobs/${j.id}`} className="yg-link">
                            {j.jobNumber ?? j.id.slice(0, 8)} — {j.title}
                          </Link>
                          <span className="ml-2 text-slate-400">{j.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
                <Panel title="Equipment & maintenance" className="border-slate-800 bg-slate-950/80">
                  {customerView.equipment.length === 0 && customerView.maintenance.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No equipment/maintenance links from Recurring Maintenance.
                    </p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {customerView.maintenance.map((m) => (
                        <div key={m.planId} className="rounded border border-zinc-800 p-2">
                          <p className="yg-text-accent-muted">{m.planName}</p>
                          <p className="text-slate-400">
                            {m.status} · asset {m.assetName ?? m.assetId.slice(0, 8)} · next{' '}
                            {m.nextDueAt ?? 'n/a'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
                <Panel title="Communications & documents" className="border-slate-800 bg-slate-950/80">
                  <p className="text-sm text-slate-300">
                    {customerView.communications.length} communication(s) ·{' '}
                    {customerView.documents.length} document(s)
                  </p>
                </Panel>
              </div>
            )
          ) : null}

          {tab === 'timeline' ? (
            !customerView ? (
              <EmptyState
                title="Select a customer"
                description="Open a customer to view the unified timeline."
              />
            ) : customerView.timeline.length === 0 ? (
              <EmptyState
                title="Timeline empty"
                description="No real interactions, jobs, documents, or maintenance events yet — nothing invented."
              />
            ) : (
              <Panel title="Unified timeline" className="yg-card-accent">
                <ul className="space-y-2">
                  {customerView.timeline.map((e) => (
                    <li key={e.id} className="rounded border border-zinc-800 bg-slate-900/60 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium yg-text-accent-muted">
                          {e.kind} · {e.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(e.occurredAt).toLocaleString()}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-slate-300">{e.summary}</p>
                      {e.href ? (
                        <Link href={e.href} className="mt-1 yg-link text-xs inline-block">
                          Open
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Panel>
            )
          ) : null}

          {tab === 'insights' ? (
            <div className="space-y-4">
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      void withFeedback(
                        () =>
                          refreshC360Insights(
                            accessToken!,
                            selectedId ? { customerId: selectedId } : {},
                          ),
                        'Insight drafts refreshed — nothing was sent.',
                      )
                    }
                  >
                    Refresh AURA insight drafts
                  </Button>
                </div>
              ) : null}
              <Panel title="Recommendation drafts" className="yg-card-accent">
                {(customerView?.insights ?? dashboard.recentInsights).length === 0 ? (
                  <EmptyState
                    title="No insight drafts"
                    description="Refresh from real jobs/maintenance/comms history — drafts never auto-send."
                  />
                ) : (
                  <ul className="space-y-3">
                    {(customerView?.insights ?? dashboard.recentInsights).map((insight) => (
                      <li key={insight.id} className="rounded border border-zinc-800 p-3">
                        <p className="text-sm font-medium yg-text-accent-muted">
                          {insight.kind} · {insight.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">{insight.body}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {insight.status} · auto-send off
                          {insight.customerName ? ` · ${insight.customerName}` : ''}
                        </p>
                        {canManage &&
                        (insight.status === 'draft' || insight.status === 'pending_approval') ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideC360Insight(accessToken!, insight.id, {
                                      decision: 'approve',
                                    }),
                                  'Insight approved — no communication was sent.',
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
                                    decideC360Insight(accessToken!, insight.id, {
                                      decision: 'reject',
                                    }),
                                  'Insight rejected.',
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

          {tab === 'connections' ? (
            <Panel title="Module connections" className="border-slate-800 bg-slate-950/80">
              <ul className="space-y-2">
                {dashboard.connections.map((c) => (
                  <li key={c.target} className="rounded border border-zinc-800 p-3 text-sm">
                    <Link href={c.href} className="yg-link">
                      {c.label}
                    </Link>
                    <p className="text-slate-400">
                      {c.status} · {c.note}
                    </p>
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
