import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, Input, Panel, StatCard } from '@titan/ui';
import type { FrfDashboard, FrfForecastResult, FrfReportResult } from '@titan/shared';
import { PageHeader } from '../../components/ux';
import { useAuth } from '../../lib/auth-context';
import {
  acknowledgeFrfInsight,
  createFrfBudgetPlan,
  decideFrfAction,
  fetchFrfDashboard,
  FinanceReportingForecastApiClientError,
  generateFrfActions,
  generateFrfForecast,
  generateFrfReport,
  refreshFrfInsights,
} from '../../lib/finance-reporting-forecast-api-client';

type Tab = 'reports' | 'forecasts' | 'budgets' | 'insights' | 'actions' | 'connect';

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

function cents(value: number | null | undefined, currency: string) {
  if (value == null) return 'unavailable';
  return `${currency} ${(value / 100).toFixed(2)}`;
}

function ReportCard({ report }: { report: FrfReportResult }) {
  return (
    <Panel className="frf-card">
      <h3 style={{ marginTop: 0, textTransform: 'capitalize' }}>{report.kind.replace('_', ' ')}</h3>
      <p className="ux-muted">{report.summary}</p>
      <p>
        <strong>Availability:</strong> {report.availability}
      </p>
      <p>
        <strong>Total:</strong> {cents(report.totalCents, report.currency)}
      </p>
      {report.gaps.length > 0 ? (
        <ul>
          {report.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function ForecastCard({ forecast }: { forecast: FrfForecastResult }) {
  return (
    <Panel className="frf-card">
      <h3 style={{ marginTop: 0, textTransform: 'capitalize' }}>
        {forecast.kind.replace('_', ' ')} forecast
      </h3>
      <p className="ux-muted">{forecast.summary}</p>
      <p>
        <strong>Availability:</strong> {forecast.availability}
      </p>
      <p>
        <strong>Confidence:</strong> {forecast.confidence}
      </p>
      <p className="ux-muted">{forecast.confidenceRationale}</p>
      <p>
        <strong>Projected total:</strong>{' '}
        {cents(forecast.projectedTotalCents, forecast.currency)}
      </p>
      <details>
        <summary>Methodology &amp; assumptions</summary>
        <p>{forecast.methodology}</p>
        <ul>
          {forecast.assumptions.map((a) => (
            <li key={a.key}>
              <strong>{a.label}:</strong> {a.value}
            </li>
          ))}
        </ul>
      </details>
      {forecast.gaps.length > 0 ? (
        <ul>
          {forecast.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

export function FinanceReportingForecastPage() {
  const { accessToken, user } = useAuth();
  const [tab, setTab] = useState<Tab>('reports');
  const [dashboard, setDashboard] = useState<FrfDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [budgetName, setBudgetName] = useState('Operating budget');
  const [budgetRevenue, setBudgetRevenue] = useState('');
  const [budgetExpense, setBudgetExpense] = useState('');

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
    const data = await fetchFrfDashboard(accessToken);
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
            err instanceof FinanceReportingForecastApiClientError
              ? err.message
              : 'Unable to load Financial Reporting & Forecasting',
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

  async function run(action: () => Promise<void>, ok: string) {
    if (!accessToken || !canManage) return;
    setError(null);
    setSuccess(null);
    try {
      await action();
      setSuccess(ok);
      await loadPage();
    } catch (err) {
      setError(
        err instanceof FinanceReportingForecastApiClientError
          ? err.message
          : 'Action failed',
      );
    }
  }

  async function handleBudget(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !canManage) return;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    await run(
      async () => {
        await createFrfBudgetPlan(accessToken, {
          name: budgetName,
          periodStart: start.toISOString(),
          periodEnd: end.toISOString(),
          budgetedRevenueCents: budgetRevenue
            ? Math.round(Number(budgetRevenue) * 100)
            : null,
          budgetedExpenseCents: budgetExpense
            ? Math.round(Number(budgetExpense) * 100)
            : null,
        });
      },
      'Budget plan saved with actuals from real TITAN reports (variances null when actuals unavailable).',
    );
  }

  if (!canView) {
    return (
      <EmptyState
        title="Access restricted"
        description="Financial Reporting & Forecasting is Owner / finance-access only. Technician and Client are denied."
      />
    );
  }

  if (isLoading) {
    return <EmptyState title="Loading" description="Loading reporting & forecasting…" />;
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'reports', label: 'Reports' },
    { id: 'forecasts', label: 'Forecasts' },
    { id: 'budgets', label: 'Budgets' },
    { id: 'insights', label: 'Insights' },
    { id: 'actions', label: 'Actions' },
    { id: 'connect', label: 'Connect' },
  ];

  return (
    <div className="ux-page finance-reporting-forecast-page">
      <PageHeader
        title="Financial Reporting & Forecasting"
        subtitle="Real TITAN reports with transparent forecasts — assumptions and confidence disclosed; never invented projections."
      />

      {error ? <Panel className="ux-alert ux-alert--error">{error}</Panel> : null}
      {success ? <Panel className="ux-alert ux-alert--success">{success}</Panel> : null}

      {dashboard ? (
        <>
          <div className="ux-stat-grid">
            <StatCard
              label="Revenue"
              value={cents(
                dashboard.liveReports.revenue.totalCents,
                dashboard.liveReports.revenue.currency,
              )}
            />
            <StatCard
              label="Payments"
              value={cents(
                dashboard.liveReports.payment.totalCents,
                dashboard.liveReports.payment.currency,
              )}
            />
            <StatCard
              label="Forecast confidence"
              value={dashboard.liveForecasts.revenue.confidence}
            />
            <StatCard label="Pending approvals" value={String(dashboard.pendingApprovals)} />
          </div>

          <p className="ux-muted">{dashboard.summary}</p>
          <p className="ux-muted">{dashboard.productClarification.thisLayer}</p>

          <nav className="ux-compact-tabs" aria-label="Reporting sections">
            <div className="ux-compact-tabs__row">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={tab === t.id ? 'is-active' : undefined}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </nav>

          {tab === 'reports' ? (
            <section className="frf-grid">
              <div className="ux-actions">
                {canManage ? (
                  <>
                    <Button
                      onClick={() =>
                        void run(
                          async () => {
                            await generateFrfReport(accessToken!, { kind: 'revenue' });
                            await generateFrfReport(accessToken!, { kind: 'invoice' });
                            await generateFrfReport(accessToken!, { kind: 'payment' });
                            await generateFrfReport(accessToken!, {
                              kind: 'job_profitability',
                            });
                          },
                          'Report snapshots saved from real TITAN data.',
                        )
                      }
                    >
                      Persist key reports
                    </Button>
                  </>
                ) : null}
              </div>
              <ReportCard report={dashboard.liveReports.revenue} />
              <ReportCard report={dashboard.liveReports.expense} />
              <ReportCard report={dashboard.liveReports.profit} />
              <ReportCard report={dashboard.liveReports.invoice} />
              <ReportCard report={dashboard.liveReports.payment} />
              <ReportCard report={dashboard.liveReports.job} />
              <ReportCard report={dashboard.liveReports.jobProfitability} />
            </section>
          ) : null}

          {tab === 'forecasts' ? (
            <section className="frf-grid">
              <div className="ux-actions">
                {canManage ? (
                  <Button
                    onClick={() =>
                      void run(
                        async () => {
                          await generateFrfForecast(accessToken!, { kind: 'revenue' });
                          await generateFrfForecast(accessToken!, { kind: 'cashflow' });
                          await generateFrfForecast(accessToken!, { kind: 'trend' });
                          await generateFrfForecast(accessToken!, {
                            kind: 'budget_planning',
                          });
                        },
                        'Forecast snapshots saved with disclosed assumptions (projections withheld when history is thin).',
                      )
                    }
                  >
                    Persist forecasts
                  </Button>
                ) : null}
              </div>
              <ForecastCard forecast={dashboard.liveForecasts.revenue} />
              <ForecastCard forecast={dashboard.liveForecasts.cashflow} />
              <ForecastCard forecast={dashboard.liveForecasts.budgetPlanning} />
              <ForecastCard forecast={dashboard.liveForecasts.trend} />
            </section>
          ) : null}

          {tab === 'budgets' ? (
            <section>
              {canManage ? (
                <Panel>
                  <h3 style={{ marginTop: 0 }}>Owner budget plan</h3>
                  <form onSubmit={(e) => void handleBudget(e)} className="ux-form-stack">
                    <Input
                      label="Name"
                      value={budgetName}
                      onChange={(e) => setBudgetName(e.target.value)}
                      required
                    />
                    <Input
                      label="Budgeted revenue (major units)"
                      value={budgetRevenue}
                      onChange={(e) => setBudgetRevenue(e.target.value)}
                    />
                    <Input
                      label="Budgeted expense (major units)"
                      value={budgetExpense}
                      onChange={(e) => setBudgetExpense(e.target.value)}
                    />
                    <Button type="submit">Save budget vs actuals</Button>
                  </form>
                </Panel>
              ) : null}
              {dashboard.budgetPlans.length === 0 ? (
                <EmptyState
                  title="No budget plans"
                  description="Owner-entered plans compare targets to real TITAN actuals when available."
                />
              ) : (
                dashboard.budgetPlans.map((b) => (
                  <Panel key={b.id}>
                    <h3 style={{ marginTop: 0 }}>{b.name}</h3>
                    <p>
                      Revenue variance:{' '}
                      {cents(b.revenueVarianceCents, b.currency)} · Expense variance:{' '}
                      {cents(b.expenseVarianceCents, b.currency)}
                    </p>
                  </Panel>
                ))
              )}
            </section>
          ) : null}

          {tab === 'insights' ? (
            <section>
              {canManage ? (
                <Button
                  onClick={() =>
                    void run(
                      async () => {
                        await refreshFrfInsights(accessToken!);
                      },
                      'Real insights queued for Command Centre / Executive Dashboard / Finance AURA handoff.',
                    )
                  }
                >
                  Refresh insight handoffs
                </Button>
              ) : null}
              {dashboard.insights.length === 0 ? (
                <EmptyState
                  title="No insights yet"
                  description="Insights are created from real reports/forecasts only — never invented."
                />
              ) : (
                dashboard.insights.map((insight) => (
                  <Panel key={insight.id}>
                    <h3 style={{ marginTop: 0 }}>{insight.title}</h3>
                    <p className="ux-muted">
                      Target: {insight.target} · {insight.status}
                    </p>
                    <p>{insight.insight}</p>
                    {insight.href ? <Link href={insight.href}>{insight.href}</Link> : null}
                    {canManage && insight.status === 'open' ? (
                      <div className="ux-actions">
                        <Button
                          onClick={() =>
                            void run(
                              async () => {
                                await acknowledgeFrfInsight(accessToken!, insight.id, {
                                  status: 'acknowledged',
                                });
                              },
                              'Insight acknowledged.',
                            )
                          }
                        >
                          Acknowledge
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                ))
              )}
            </section>
          ) : null}

          {tab === 'actions' ? (
            <section>
              {canManage ? (
                <Button
                  onClick={() =>
                    void run(
                      async () => {
                        await generateFrfActions(accessToken!);
                      },
                      'Draft actions queued for Owner approval — nothing auto-executed.',
                    )
                  }
                >
                  Generate draft actions
                </Button>
              ) : null}
              {dashboard.actions.length === 0 ? (
                <EmptyState
                  title="No actions"
                  description="Recommended actions require Owner approval and never auto-execute."
                />
              ) : (
                dashboard.actions.map((action) => (
                  <Panel key={action.id}>
                    <h3 style={{ marginTop: 0 }}>{action.title}</h3>
                    <p className="ux-muted">
                      {action.kind} · {action.status}
                    </p>
                    <p>{action.recommendation}</p>
                    {canOwnerApprove &&
                    (action.status === 'pending_approval' || action.status === 'draft') ? (
                      <div className="ux-actions">
                        <Button
                          onClick={() =>
                            void run(
                              async () => {
                                await decideFrfAction(accessToken!, action.id, {
                                  decision: 'approve',
                                });
                              },
                              'Action approved (still no auto-execute).',
                            )
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            void run(
                              async () => {
                                await decideFrfAction(accessToken!, action.id, {
                                  decision: 'reject',
                                });
                              },
                              'Action rejected.',
                            )
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                ))
              )}
            </section>
          ) : null}

          {tab === 'connect' ? (
            <section className="frf-grid">
              {dashboard.auraConnections.map((c) => (
                <Panel key={c.target}>
                  <h3 style={{ marginTop: 0 }}>{c.label}</h3>
                  <p className="ux-muted">{c.note}</p>
                  <Link href={c.href}>{c.href}</Link>
                </Panel>
              ))}
              <Panel>
                <h3 style={{ marginTop: 0 }}>Policy</h3>
                <ul>
                  <li>Owner approval required: {String(dashboard.policy.requiresOwnerApproval)}</li>
                  <li>Auto-execute: {String(dashboard.policy.autoExecuteEnabled)}</li>
                  <li>
                    Forecasts explain assumptions:{' '}
                    {String(dashboard.policy.forecastsExplainAssumptions)}
                  </li>
                  <li>Fake data invented: {String(dashboard.policy.fakeDataInvented)}</li>
                </ul>
              </Panel>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="No dashboard"
          description="Unable to load reporting data for this tenant."
        />
      )}

      <style>{`
        .finance-reporting-forecast-page .frf-grid {
          display: grid;
          gap: 0.875rem;
          grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
          margin-top: 0.75rem;
        }
        .finance-reporting-forecast-page .frf-card h3 {
          color: var(--titan-accent, #22d3ee);
        }
        .finance-reporting-forecast-page .ux-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin: 0.75rem 0;
          grid-column: 1 / -1;
        }
      `}</style>
    </div>
  );
}
