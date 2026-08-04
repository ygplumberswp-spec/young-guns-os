import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { FcpDashboard } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeFcpInsight,
  createFcpAction,
  decideFcpAction,
  fetchFcpDashboard,
  FinanceCashflowProfitApiClientError,
  generateFcpActions,
  refreshFcpInsights,
} from '../../lib/finance-cashflow-profit-api-client';

type Tab = 'dashboard' | 'cashflow' | 'profit' | 'insights' | 'actions' | 'aura';

function canAccess(permissions: string[], roleName: string | undefined) {
  if (roleName === 'Technician' || roleName === 'Client') return false;
  if (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  ) {
    return true;
  }
  return (
    permissions.includes('*') ||
    permissions.includes('finance:read') ||
    permissions.includes('finance:write')
  );
}

function canWrite(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  if (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  ) {
    return true;
  }
  return permissions.includes('*') || permissions.includes('finance:write');
}

function canApprove(permissions: string[], roleName: string | undefined) {
  if (!canAccess(permissions, roleName)) return false;
  if (permissions.includes('*')) return true;
  return (
    roleName === 'Company Owner' ||
    roleName === 'Owner' ||
    roleName === 'Platform Owner'
  );
}

function money(cents: number | null | undefined, currency: string) {
  if (cents == null) return 'Unavailable';
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export function FinanceCashflowProfitPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<FcpDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionTitle, setActionTitle] = useState('');
  const [actionBody, setActionBody] = useState('');

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
    const data = await fetchFcpDashboard(accessToken);
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
        await loadPage();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof FinanceCashflowProfitApiClientError
              ? err.message
              : 'Unable to load cashflow & profit intelligence',
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

  async function onRefreshInsights() {
    if (!accessToken) return;
    try {
      setError(null);
      const created = await refreshFcpInsights(accessToken);
      setSuccess(`Generated ${created.length} insight(s) from real TITAN signals.`);
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceCashflowProfitApiClientError
          ? err.message
          : 'Unable to refresh insights',
      );
    }
  }

  async function onGenerateActions() {
    if (!accessToken) return;
    try {
      setError(null);
      const created = await generateFcpActions(accessToken);
      setSuccess(`Generated ${created.length} action draft(s) pending Owner approval.`);
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceCashflowProfitApiClientError
          ? err.message
          : 'Unable to generate actions',
      );
    }
  }

  async function onCreateAction(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !actionTitle.trim() || !actionBody.trim()) return;
    try {
      setError(null);
      await createFcpAction(accessToken, {
        kind: 'aura_handoff',
        title: actionTitle.trim(),
        recommendation: actionBody.trim(),
        submitForApproval: true,
      });
      setActionTitle('');
      setActionBody('');
      setSuccess('Action submitted for Owner approval. No financial mutation executed.');
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceCashflowProfitApiClientError
          ? err.message
          : 'Unable to create action',
      );
    }
  }

  async function onDecide(id: string, decision: 'approve' | 'reject') {
    if (!accessToken) return;
    try {
      setError(null);
      await decideFcpAction(accessToken, id, { decision });
      setSuccess(
        decision === 'approve'
          ? 'Action approved (intent recorded — no auto-execute).'
          : 'Action rejected.',
      );
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceCashflowProfitApiClientError
          ? err.message
          : 'Unable to decide action',
      );
    }
  }

  async function onAckInsight(id: string, status: 'acknowledged' | 'dismissed') {
    if (!accessToken) return;
    try {
      setError(null);
      await acknowledgeFcpInsight(accessToken, id, { status });
      setSuccess(`Insight ${status}.`);
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceCashflowProfitApiClientError
          ? err.message
          : 'Unable to update insight',
      );
    }
  }

  if (!canView) {
    return (
      <div className="page-stack">
        <PageHeader
          title="Cashflow & Profit Intelligence"
          description="Owner / finance access only"
        />
        <EmptyState
          title="Access denied"
          description="Technician and Client roles cannot view finance intelligence."
        />
      </div>
    );
  }

  const cashflow = dashboard?.cashflow;
  const profit = dashboard?.profit;

  return (
    <div className="page-stack" style={{ gap: '1.25rem' }}>
      <PageHeader
        title="Cashflow & Profit Intelligence"
        description="Real TITAN invoices, payments, jobs, and costs — never invented"
      />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        {(
          [
            ['dashboard', 'Dashboard'],
            ['cashflow', 'Cashflow'],
            ['profit', 'Profit'],
            ['insights', 'AURA Insights'],
            ['actions', 'Actions'],
            ['aura', 'Connections'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            variant={tab === id ? 'primary' : 'secondary'}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
        <Link href="/finance-aura-agent" style={{ marginLeft: 'auto', color: 'var(--titan-accent, #1f7aec)' }}>
          Finance AURA Agent →
        </Link>
      </div>

      {error ? (
        <Panel title="Status">
          <p style={{ color: 'var(--titan-danger, #f87171)', margin: 0 }}>{error}</p>
        </Panel>
      ) : null}
      {success ? (
        <Panel title="Status">
          <p style={{ color: 'var(--titan-accent, #1f7aec)', margin: 0 }}>{success}</p>
        </Panel>
      ) : null}

      {isLoading || !dashboard ? (
        <Panel title="Status">
          <p style={{ margin: 0, color: 'var(--titan-muted, #94a3b8)' }}>Loading real finance signals…</p>
        </Panel>
      ) : (
        <>
          {tab === 'dashboard' ? (
            <>
              <Panel title="Status">
                <p style={{ margin: '0 0 0.75rem', color: 'var(--titan-muted, #94a3b8)' }}>
                  {dashboard.summary}
                </p>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                  {dashboard.productClarification.thisLayer}
                </p>
              </Panel>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                <StatCard
                  label="Income"
                  value={money(cashflow?.incomeCents, cashflow?.currency ?? 'ZAR')}
                />
                <StatCard
                  label="Incoming (30d)"
                  value={money(cashflow?.incomingPaymentsCents, cashflow?.currency ?? 'ZAR')}
                />
                <StatCard
                  label="Expense"
                  value={money(cashflow?.expenseCents, cashflow?.currency ?? 'ZAR')}
                />
                <StatCard
                  label="Cash position"
                  value={money(cashflow?.cashPositionCents, cashflow?.currency ?? 'ZAR')}
                />
                <StatCard
                  label="Revenue (jobs)"
                  value={money(profit?.revenueCents, profit?.currency ?? 'ZAR')}
                />
                <StatCard
                  label="Margin"
                  value={
                    profit?.marginBps == null
                      ? 'Unavailable'
                      : `${(profit.marginBps / 100).toFixed(1)}%`
                  }
                />
                <StatCard label="Pending approvals" value={String(dashboard.pendingApprovals)} />
              </div>
              {cashflow?.warnings?.length ? (
                <Panel title="Status">
                  <h3 style={{ marginTop: 0 }}>Financial warnings</h3>
                  <ul>
                    {cashflow.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
              {(cashflow?.gaps?.length || profit?.gaps?.length) ? (
                <Panel title="Status">
                  <h3 style={{ marginTop: 0 }}>Honest data gaps</h3>
                  <ul>
                    {[...(cashflow?.gaps ?? []), ...(profit?.gaps ?? [])].map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </>
          ) : null}

          {tab === 'cashflow' && cashflow ? (
            <Panel title="Status">
              <h3 style={{ marginTop: 0 }}>Cashflow intelligence</h3>
              <p style={{ color: 'var(--titan-muted, #94a3b8)' }}>{cashflow.summary}</p>
              <p>
                Availability: <strong>{cashflow.availability}</strong> · Invoices:{' '}
                {cashflow.invoiceCount} · Payments: {cashflow.paymentCount} · POs:{' '}
                {cashflow.purchaseOrderCount}
              </p>
              <p>
                Xero: {cashflow.xero.availability} — {cashflow.xero.rationale}
              </p>
              <p>
                Incoming (30d): {money(cashflow.incomingPaymentsCents, cashflow.currency)} (
                {cashflow.incomingPaymentCount} payment
                {cashflow.incomingPaymentCount === 1 ? '' : 's'}) · Outstanding:{' '}
                {money(cashflow.outstandingReceivableCents, cashflow.currency)} · Overdue:{' '}
                {money(cashflow.overdueAmountCents, cashflow.currency)} ({cashflow.overdueInvoiceCount})
              </p>
              {cashflow.risks.length > 0 ? (
                <>
                  <h4>Cashflow risks</h4>
                  <ul>
                    {cashflow.risks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <h4>Trends (last 6 months)</h4>
              {cashflow.trends.length === 0 ? (
                <EmptyState title="No trend points" description="Need payments or PO history." />
              ) : (
                <ul>
                  {cashflow.trends.map((t) => (
                    <li key={t.periodKey}>
                      {t.label}: income {money(t.incomeCents, cashflow.currency)}
                      {t.expenseCents == null
                        ? ' · expense unavailable'
                        : ` · expense ${money(t.expenseCents, cashflow.currency)}`}
                      {t.netCents == null ? '' : ` · net ${money(t.netCents, cashflow.currency)}`}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'profit' && profit ? (
            <Panel title="Status">
              <h3 style={{ marginTop: 0 }}>Profit intelligence</h3>
              <p style={{ color: 'var(--titan-muted, #94a3b8)' }}>{profit.summary}</p>
              <p>
                Inventory costs: {profit.inventoryCostAvailability} — {profit.inventoryCostRationale}
              </p>
              <p>
                Labour: {profit.labourMinutesTotal == null ? 'minutes unavailable' : `${profit.labourMinutesTotal} min`}
                {' · '}
                labour $ {profit.labourCostCents == null ? 'unavailable' : money(profit.labourCostCents, profit.currency)}
                {' — '}
                {profit.labourCostRationale}
              </p>
              <h4>By job</h4>
              {profit.byJob.length === 0 ? (
                <EmptyState
                  title="No job profitability rows"
                  description="Need job-linked invoices and/or material costs."
                />
              ) : (
                <ul>
                  {profit.byJob.slice(0, 20).map((j) => (
                    <li key={j.jobId}>
                      {j.jobNumber ? `${j.jobNumber} · ` : ''}
                      {j.title}: revenue {money(j.revenueCents, profit.currency)}
                      {j.costAvailability === 'unavailable'
                        ? ' · cost/margin unavailable'
                        : ` · material ${money(j.materialCostCents ?? j.costCents, profit.currency)} · margin ${
                            j.marginBps == null ? 'n/a' : `${(j.marginBps / 100).toFixed(1)}%`
                          }`}
                      {j.labourMinutes == null ? '' : ` · labour ${j.labourMinutes} min`}
                    </li>
                  ))}
                </ul>
              )}
              <h4>By service</h4>
              {profit.byService.length === 0 ? (
                <p style={{ color: 'var(--titan-muted, #94a3b8)' }}>No service aggregation yet.</p>
              ) : (
                <ul>
                  {profit.byService.slice(0, 15).map((s) => (
                    <li key={s.serviceKey}>
                      {s.serviceKey} ({s.jobCount} jobs): revenue{' '}
                      {money(s.revenueCents, profit.currency)}
                      {s.costAvailability === 'unavailable'
                        ? ' · margin unavailable'
                        : ` · margin ${
                            s.marginBps == null ? 'n/a' : `${(s.marginBps / 100).toFixed(1)}%`
                          }`}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'insights' ? (
            <Panel title="Status">
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, flex: 1 }}>AURA insights</h3>
                {canManage ? (
                  <Button type="button" variant="primary" onClick={() => void onRefreshInsights()}>
                    Generate from signals
                  </Button>
                ) : null}
              </div>
              {dashboard.insights.length === 0 ? (
                <EmptyState
                  title="No insights stored"
                  description="Generate insights from real cashflow/profit signals. Nothing is invented."
                />
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {dashboard.insights.map((insight) => (
                    <li
                      key={insight.id}
                      style={{
                        borderTop: '1px solid rgba(148,163,184,0.2)',
                        padding: '0.75rem 0',
                      }}
                    >
                      <strong>{insight.title}</strong>
                      <div style={{ color: 'var(--titan-muted, #94a3b8)', fontSize: '0.85rem' }}>
                        {insight.kind} · {insight.status}
                      </div>
                      <p style={{ margin: '0.35rem 0' }}>{insight.body}</p>
                      {canManage && insight.status === 'open' ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void onAckInsight(insight.id, 'acknowledged')}
                          >
                            Acknowledge
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void onAckInsight(insight.id, 'dismissed')}
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
          ) : null}

          {tab === 'actions' ? (
            <Panel title="Status">
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, flex: 1 }}>Recommended actions</h3>
                {canManage ? (
                  <Button type="button" variant="primary" onClick={() => void onGenerateActions()}>
                    Generate drafts
                  </Button>
                ) : null}
              </div>
              <p style={{ color: 'var(--titan-muted, #94a3b8)' }}>
                Owner approval required. Approving records intent only — financial mutations never
                auto-execute.
              </p>
              {canManage ? (
                <form onSubmit={onCreateAction} style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Input
                    value={actionTitle}
                    onChange={(e) => setActionTitle(e.target.value)}
                    placeholder="Action title"
                  />
                  <Input
                    value={actionBody}
                    onChange={(e) => setActionBody(e.target.value)}
                    placeholder="Recommendation detail"
                  />
                  <Button type="submit" variant="secondary">
                    Submit for Owner approval
                  </Button>
                </form>
              ) : null}
              {dashboard.actions.length === 0 ? (
                <EmptyState
                  title="No actions"
                  description="Generate drafts from real signals or create a handoff for Owner approval."
                />
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {dashboard.actions.map((action) => (
                    <li
                      key={action.id}
                      style={{
                        borderTop: '1px solid rgba(148,163,184,0.2)',
                        padding: '0.75rem 0',
                      }}
                    >
                      <strong>{action.title}</strong>
                      <div style={{ color: 'var(--titan-muted, #94a3b8)', fontSize: '0.85rem' }}>
                        {action.kind} · {action.status} · autoExecuted: false
                      </div>
                      <p style={{ margin: '0.35rem 0' }}>{action.recommendation}</p>
                      {canOwnerApprove &&
                      (action.status === 'pending_approval' || action.status === 'draft') ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => void onDecide(action.id, 'approve')}
                          >
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void onDecide(action.id, 'reject')}
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

          {tab === 'aura' ? (
            <Panel title="Status">
              <h3 style={{ marginTop: 0 }}>Connections</h3>
              <ul>
                {dashboard.auraConnections.map((c) => (
                  <li key={c.target}>
                    <Link href={c.href} style={{ color: 'var(--titan-accent, #1f7aec)' }}>
                      {c.label}
                    </Link>
                    <div style={{ color: 'var(--titan-muted, #94a3b8)', fontSize: '0.85rem' }}>
                      {c.note}
                    </div>
                  </li>
                ))}
              </ul>
              <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
                Policy: auto-execute {String(dashboard.policy.autoExecuteEnabled)} · Owner approval{' '}
                {String(dashboard.policy.requiresOwnerApproval)} · Fake data invented{' '}
                {String(dashboard.policy.fakeDataInvented)}
              </p>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
