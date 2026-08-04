import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { EcDashboard, EcMoney, EcPanelKey } from '@titan/shared';
import { canAccessExecutiveCommandCentre, EC_PANEL_LABELS } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeEcInsight,
  createEcActionDraft,
  createEcInsight,
  decideEcActionDraft,
  ExecutiveCommandCentreApiClientError,
  fetchEcDashboard,
  refreshEcActionDrafts,
  updateEcSettings,
} from '../../lib/executive-command-centre-api-client';

type Tab = 'overview' | 'risks' | 'approvals' | 'aura' | 'settings';

/** Formats a real money figure, or the reason it is unavailable — never a guess. */
function formatMoney(money: EcMoney): string {
  if (money.availability !== 'available' || money.amountCents === null) return 'Unavailable';
  const amount = money.amountCents / 100;
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: money.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${money.currency} ${amount.toFixed(0)}`;
  }
}

function moneyHint(money: EcMoney): string | undefined {
  return money.availability === 'available' ? undefined : money.rationale;
}

export function ExecutiveCommandCentrePage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<EcDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [actionTitle, setActionTitle] = useState('');
  const [actionBody, setActionBody] = useState('');
  const [actionPanel, setActionPanel] = useState<EcPanelKey | ''>('');
  const [insightTitle, setInsightTitle] = useState('');
  const [insightBody, setInsightBody] = useState('');
  const [settingsNotes, setSettingsNotes] = useState('');

  // Owner only — this surface exposes finance, payroll, margin and strategy data.
  const canView = useMemo(
    () =>
      user
        ? canAccessExecutiveCommandCentre({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  async function loadPage() {
    if (!accessToken) return;
    const data = await fetchEcDashboard(accessToken);
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
            err instanceof ExecutiveCommandCentreApiClientError
              ? err.message
              : 'Unable to load Executive Command Centre',
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
        err instanceof ExecutiveCommandCentreApiClientError ? err.message : 'Action failed',
      );
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Executive Command Centre"
          description="Owner-only unified business view"
        />
        <EmptyState
          title="Access restricted"
          description="Executive Command Centre is Owner only because it exposes revenue, profit, cash, payroll and strategy data. Technicians, clients, managers, dispatchers, accountants and staff cannot access it."
        />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'risks', label: 'Risks & opportunities' },
    { id: 'approvals', label: 'Approvals' },
    { id: 'aura', label: 'AURA insights' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="space-y-6 text-slate-100">
      <PageHeader
        title="Executive Command Centre"
        description="Owner-only unified view of revenue, profit, cash, outstanding invoices, jobs, staff, fleet, marketing, sales, risks and opportunities"
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/aura/command-centre" className="text-cyan-300 hover:underline">
          AURA Command Centre
        </Link>
        <Link href="/finance-cashflow-profit" className="text-cyan-300 hover:underline">
          Cashflow &amp; Profit
        </Link>
        <Link href="/jobs" className="text-cyan-300 hover:underline">
          Jobs
        </Link>
        <Link href="/team" className="text-cyan-300 hover:underline">
          Team
        </Link>
        <Link href="/fleet" className="text-cyan-300 hover:underline">
          Fleet
        </Link>
        <Link href="/marketing" className="text-cyan-300 hover:underline">
          Marketing
        </Link>
        <Link href="/leads" className="text-cyan-300 hover:underline">
          Sales
        </Link>
      </div>

      <Panel title="Policy" className="border-cyan-500/40 bg-cyan-950/20 text-cyan-100">
        <p className="text-sm">
          Owner only. Real connected data only — a figure that is not available is shown as
          unavailable with the reason, and is never invented or estimated. AURA may summarise and
          recommend; every executive action is a draft requiring Owner approval and never
          auto-executes.
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
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? 'primary' : 'secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {isLoading || !dashboard ? (
        <EmptyState title="Loading" description="Loading Executive Command Centre…" />
      ) : (
        <>
          {tab === 'overview' ? (
            <div className="space-y-4">
              <Panel title="Summary">
                <p className="text-sm text-slate-300">{dashboard.summary}</p>
              </Panel>

              <Panel title="Finance">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Revenue invoiced"
                    value={formatMoney(dashboard.revenue.invoicedCents)}
                    hint={moneyHint(dashboard.revenue.invoicedCents)}
                  />
                  <StatCard
                    label="Revenue collected"
                    value={formatMoney(dashboard.revenue.collectedCents)}
                    hint={moneyHint(dashboard.revenue.collectedCents)}
                  />
                  <StatCard
                    label="Profit margin"
                    value={formatMoney(dashboard.profit.marginCents)}
                    hint={
                      moneyHint(dashboard.profit.marginCents) ??
                      dashboard.profit.labourCostRationale
                    }
                  />
                  <StatCard
                    label="Cash position"
                    value={formatMoney(dashboard.cash.cashPositionCents)}
                    hint={moneyHint(dashboard.cash.cashPositionCents)}
                  />
                  <StatCard
                    label="Outstanding invoices"
                    value={formatMoney(dashboard.outstandingInvoices.outstandingReceivableCents)}
                    hint={moneyHint(
                      dashboard.outstandingInvoices.outstandingReceivableCents,
                    )}
                  />
                  <StatCard
                    label="Overdue amount"
                    value={formatMoney(dashboard.outstandingInvoices.overdueAmountCents)}
                    hint={moneyHint(dashboard.outstandingInvoices.overdueAmountCents)}
                  />
                  <StatCard
                    label="Overdue invoices"
                    value={String(dashboard.outstandingInvoices.overdueInvoiceCount)}
                  />
                  <StatCard
                    label="Jobs with cost data"
                    value={`${dashboard.profit.jobsWithCostData} / ${dashboard.profit.jobCount}`}
                    hint="Margin is only calculated from real captured costs."
                  />
                </div>
              </Panel>

              <Panel title="Operations">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Open jobs"
                    value={String(dashboard.jobs.openCount)}
                    hint={
                      dashboard.jobs.availability === 'available'
                        ? `${dashboard.jobs.total} total`
                        : dashboard.jobs.rationale
                    }
                  />
                  <StatCard
                    label="Completed jobs"
                    value={String(dashboard.jobs.completedCount)}
                  />
                  <StatCard
                    label="Active staff"
                    value={String(dashboard.staff.activeCount)}
                    hint={
                      dashboard.staff.availability === 'available'
                        ? `${dashboard.staff.total} accounts`
                        : dashboard.staff.rationale
                    }
                  />
                  <StatCard
                    label="Fleet available"
                    value={String(dashboard.fleet.availableCount)}
                    hint={
                      dashboard.fleet.availability === 'available'
                        ? `${dashboard.fleet.total} vehicles`
                        : dashboard.fleet.rationale
                    }
                  />
                  <StatCard
                    label="Fleet unavailable"
                    value={String(
                      dashboard.fleet.maintenanceCount + dashboard.fleet.outOfServiceCount,
                    )}
                    hint="Maintenance or out of service"
                  />
                  <StatCard
                    label="Active campaigns"
                    value={String(dashboard.marketing.activeCount)}
                    hint={
                      dashboard.marketing.availability === 'available'
                        ? `${dashboard.marketing.total} campaigns`
                        : dashboard.marketing.rationale
                    }
                  />
                  <StatCard
                    label="Open opportunities"
                    value={String(dashboard.sales.openOpportunityCount)}
                    hint={
                      dashboard.sales.availability === 'available'
                        ? `${dashboard.sales.openLeadCount} open lead(s)`
                        : dashboard.sales.rationale
                    }
                  />
                  <StatCard
                    label="Open pipeline value"
                    value={formatMoney(dashboard.sales.openPipelineCents)}
                    hint={moneyHint(dashboard.sales.openPipelineCents)}
                  />
                </div>
              </Panel>

              {dashboard.unavailablePanels.length > 0 ? (
                <Panel
                  title="Unavailable data"
                  className="border-amber-500/40 bg-amber-950/20 text-amber-100"
                >
                  <ul className="space-y-2 text-sm">
                    {dashboard.unavailablePanels.map((item) => (
                      <li key={item.panel}>
                        <span className="font-semibold">{EC_PANEL_LABELS[item.panel]}</span> —{' '}
                        {item.reason}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              <Panel title="Connected sources">
                <ul className="space-y-2 text-sm text-slate-300">
                  {dashboard.connections.map((connection) => (
                    <li key={connection.module}>
                      <Link href={connection.href} className="text-cyan-300 hover:underline">
                        {connection.label}
                      </Link>{' '}
                      — {connection.note}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-slate-400">
                  {dashboard.productClarification.thisLayer}
                </p>
              </Panel>
            </div>
          ) : null}

          {tab === 'risks' ? (
            <div className="space-y-4">
              <Panel title="Risks">
                {dashboard.risks.length === 0 ? (
                  <EmptyState
                    title="No risks detected"
                    description="Risks are only raised from real connected signals. Nothing is inferred."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.risks.map((risk) => (
                      <li
                        key={`${risk.kind}-${risk.title}`}
                        className="rounded border border-slate-700 bg-slate-900/40 p-3"
                      >
                        <p className="font-semibold text-slate-100">
                          {risk.title}{' '}
                          <span className="text-xs uppercase text-amber-300">
                            {risk.severity}
                          </span>
                        </p>
                        <p className="mt-1 text-slate-300">{risk.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Opportunities">
                {dashboard.opportunities.length === 0 ? (
                  <EmptyState
                    title="No opportunities detected"
                    description="Opportunities are only raised from real connected signals."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.opportunities.map((opportunity) => (
                      <li
                        key={`${opportunity.kind}-${opportunity.title}`}
                        className="rounded border border-slate-700 bg-slate-900/40 p-3"
                      >
                        <p className="font-semibold text-slate-100">{opportunity.title}</p>
                        <p className="mt-1 text-slate-300">{opportunity.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}

          {tab === 'approvals' ? (
            <div className="space-y-4">
              <Panel title="Executive action drafts">
                <p className="mb-3 text-sm text-slate-400">
                  {dashboard.pendingApprovals} draft(s) awaiting your decision. Approving records
                  your decision — it never executes a finance, payroll, dispatch or marketing
                  change.
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void withFeedback(
                      () => refreshEcActionDrafts(accessToken ?? '', {}),
                      'Drafts refreshed from current real risk signals.',
                    )
                  }
                >
                  Refresh drafts from risks
                </Button>

                {dashboard.actionDrafts.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState
                      title="No drafts"
                      description="Drafts are generated from real risk signals or added by you."
                    />
                  </div>
                ) : (
                  <ul className="mt-4 space-y-3 text-sm">
                    {dashboard.actionDrafts.map((draft) => (
                      <li
                        key={draft.id}
                        className="rounded border border-slate-700 bg-slate-900/40 p-3"
                      >
                        <p className="font-semibold text-slate-100">{draft.title}</p>
                        <p className="mt-1 whitespace-pre-line text-slate-300">{draft.body}</p>
                        <p className="mt-2 text-xs uppercase text-slate-400">
                          {draft.status}
                          {draft.panel ? ` · ${EC_PANEL_LABELS[draft.panel]}` : ''}
                        </p>
                        {draft.status === 'draft' || draft.status === 'pending_approval' ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    decideEcActionDraft(accessToken ?? '', draft.id, {
                                      decision: 'approve',
                                    }),
                                  'Decision recorded. No downstream change was executed.',
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
                                    decideEcActionDraft(accessToken ?? '', draft.id, {
                                      decision: 'reject',
                                    }),
                                  'Draft rejected.',
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

              <Panel title="Add an executive action draft">
                <form
                  className="space-y-3"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void withFeedback(async () => {
                      await createEcActionDraft(accessToken ?? '', {
                        title: actionTitle,
                        body: actionBody,
                        panel: actionPanel === '' ? null : actionPanel,
                      });
                      setActionTitle('');
                      setActionBody('');
                      setActionPanel('');
                    }, 'Draft created and queued for approval.');
                  }}
                >
                  <Input
                    label="Title"
                    value={actionTitle}
                    onChange={(event) => setActionTitle(event.target.value)}
                    required
                  />
                  <Input
                    label="Detail"
                    value={actionBody}
                    onChange={(event) => setActionBody(event.target.value)}
                    required
                  />
                  <label className="block text-sm text-slate-300">
                    Panel
                    <select
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"
                      value={actionPanel}
                      onChange={(event) => setActionPanel(event.target.value as EcPanelKey | '')}
                    >
                      <option value="">No specific panel</option>
                      {(Object.keys(EC_PANEL_LABELS) as EcPanelKey[]).map((key) => (
                        <option key={key} value={key}>
                          {EC_PANEL_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="submit">Create draft</Button>
                </form>
              </Panel>
            </div>
          ) : null}

          {tab === 'aura' ? (
            <div className="space-y-4">
              <Panel title="AURA summaries">
                <p className="mb-3 text-sm text-slate-400">
                  {dashboard.productClarification.auraCommandCentre}
                </p>
                {dashboard.insights.length === 0 ? (
                  <EmptyState
                    title="No insights"
                    description="AURA summaries are recorded by the Owner and never generated as fact."
                  />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {dashboard.insights.map((insight) => (
                      <li
                        key={insight.id}
                        className="rounded border border-slate-700 bg-slate-900/40 p-3"
                      >
                        <p className="font-semibold text-slate-100">{insight.title}</p>
                        <p className="mt-1 text-slate-300">{insight.insight}</p>
                        <p className="mt-2 text-xs uppercase text-slate-400">{insight.status}</p>
                        {insight.status === 'open' ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    acknowledgeEcInsight(accessToken ?? '', insight.id, {
                                      status: 'acknowledged',
                                    }),
                                  'Insight acknowledged.',
                                )
                              }
                            >
                              Acknowledge
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                void withFeedback(
                                  () =>
                                    acknowledgeEcInsight(accessToken ?? '', insight.id, {
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

              <Panel title="Record an AURA summary">
                <form
                  className="space-y-3"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void withFeedback(async () => {
                      await createEcInsight(accessToken ?? '', {
                        title: insightTitle,
                        insight: insightBody,
                      });
                      setInsightTitle('');
                      setInsightBody('');
                    }, 'Summary recorded.');
                  }}
                >
                  <Input
                    label="Title"
                    value={insightTitle}
                    onChange={(event) => setInsightTitle(event.target.value)}
                    required
                  />
                  <Input
                    label="Summary"
                    value={insightBody}
                    onChange={(event) => setInsightBody(event.target.value)}
                    required
                  />
                  <Button type="submit">Record summary</Button>
                </form>
              </Panel>
            </div>
          ) : null}

          {tab === 'settings' ? (
            <Panel title="Owner settings">
              <div className="space-y-3 text-sm">
                <p className="text-slate-400">
                  Auto-execution and invented financial figures are permanently disabled and cannot
                  be switched on.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void withFeedback(
                        () =>
                          updateEcSettings(accessToken ?? '', {
                            financePanelsEnabled: !dashboard.settings.financePanelsEnabled,
                          }),
                        'Finance panels updated.',
                      )
                    }
                  >
                    Finance panels: {dashboard.settings.financePanelsEnabled ? 'on' : 'off'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void withFeedback(
                        () =>
                          updateEcSettings(accessToken ?? '', {
                            operationsPanelsEnabled:
                              !dashboard.settings.operationsPanelsEnabled,
                          }),
                        'Operations panels updated.',
                      )
                    }
                  >
                    Operations panels:{' '}
                    {dashboard.settings.operationsPanelsEnabled ? 'on' : 'off'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void withFeedback(
                        () =>
                          updateEcSettings(accessToken ?? '', {
                            riskDetectionEnabled: !dashboard.settings.riskDetectionEnabled,
                          }),
                        'Risk detection updated.',
                      )
                    }
                  >
                    Risk detection: {dashboard.settings.riskDetectionEnabled ? 'on' : 'off'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void withFeedback(
                        () =>
                          updateEcSettings(accessToken ?? '', {
                            opportunityDetectionEnabled:
                              !dashboard.settings.opportunityDetectionEnabled,
                          }),
                        'Opportunity detection updated.',
                      )
                    }
                  >
                    Opportunity detection:{' '}
                    {dashboard.settings.opportunityDetectionEnabled ? 'on' : 'off'}
                  </Button>
                </div>

                <form
                  className="space-y-3"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    void withFeedback(
                      () => updateEcSettings(accessToken ?? '', { notes: settingsNotes || null }),
                      'Notes saved.',
                    );
                  }}
                >
                  <Input
                    label="Notes"
                    value={settingsNotes}
                    onChange={(event) => setSettingsNotes(event.target.value)}
                  />
                  <Button type="submit">Save notes</Button>
                </form>
              </div>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}

export default ExecutiveCommandCentrePage;
