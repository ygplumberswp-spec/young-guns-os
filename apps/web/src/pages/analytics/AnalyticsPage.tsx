import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type {
  AnalyticsDashboard,
  AnalyticsPeriod,
  BusinessInsightSummary,
  BusinessKpiSummary,
  CustomerAnalytics,
  EnterpriseAnalyticsExecutiveDashboard,
  FinanceAnalytics,
  JobProfitabilityAnalytics,
  PredictiveForecastSummary,
  ReportDefinitionSummary,
  ReportRunSummary,
  TechnicianPerformanceAnalytics,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchAnalyticsDashboard,
  fetchCustomerAnalytics,
  fetchFinanceAnalytics,
  fetchJobProfitability,
  fetchReportCatalog,
  fetchTechnicianPerformance,
  generateAnalyticsReport,
} from '../../lib/analytics-api';
import {
  fetchBusinessInsights,
  fetchBusinessKpis,
  fetchEnterpriseAnalyticsDashboard,
  fetchPredictiveForecasts,
  generateBusinessInsights,
  runAnalyticsAggregation,
} from '../../lib/enterprise-analytics-api-client';
import { useAuth } from '../../lib/auth-context';
import {
  canAccessAnalytics,
  canManageAnalytics,
  formatChangePercent,
} from '../../features/analytics/utils';
import { ANALYTICS_PERIOD_OPTIONS, formatMoney, REPORT_TYPE_OPTIONS } from '@titan/shared';

type AnalyticsTab =
  | 'dashboard'
  | 'intelligence'
  | 'kpis'
  | 'insights'
  | 'forecasts'
  | 'warehouse'
  | 'reports'
  | 'profitability'
  | 'technicians'
  | 'customers'
  | 'finance';

export function AnalyticsPage() {
  const { accessToken, user } = useAuth();
  const [period, setPeriod] = useState<AnalyticsPeriod>('monthly');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('dashboard');
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [profitability, setProfitability] = useState<JobProfitabilityAnalytics | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianPerformanceAnalytics | null>(null);
  const [customers, setCustomers] = useState<CustomerAnalytics | null>(null);
  const [finance, setFinance] = useState<FinanceAnalytics | null>(null);
  const [definitions, setDefinitions] = useState<ReportDefinitionSummary[]>([]);
  const [runs, setRuns] = useState<ReportRunSummary[]>([]);
  const [enterpriseDashboard, setEnterpriseDashboard] =
    useState<EnterpriseAnalyticsExecutiveDashboard | null>(null);
  const [kpis, setKpis] = useState<BusinessKpiSummary[]>([]);
  const [insights, setInsights] = useState<BusinessInsightSummary[]>([]);
  const [forecasts, setForecasts] = useState<PredictiveForecastSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAggregating, setIsAggregating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessAnalytics(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageAnalytics(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const query = { period };

      try {
        const [
          dashboardData,
          profitabilityData,
          technicianData,
          customerData,
          financeData,
          reportCatalog,
          enterpriseData,
          kpiData,
          insightData,
          forecastData,
        ] = await Promise.all([
          fetchAnalyticsDashboard(accessToken, query),
          fetchJobProfitability(accessToken, query),
          fetchTechnicianPerformance(accessToken, query),
          fetchCustomerAnalytics(accessToken, query),
          fetchFinanceAnalytics(accessToken, query),
          fetchReportCatalog(accessToken),
          fetchEnterpriseAnalyticsDashboard(accessToken).catch(() => null),
          fetchBusinessKpis(accessToken).catch(() => []),
          fetchBusinessInsights(accessToken).catch(() => []),
          fetchPredictiveForecasts(accessToken).catch(() => []),
        ]);

        if (!cancelled) {
          setDashboard(dashboardData);
          setProfitability(profitabilityData);
          setTechnicians(technicianData);
          setCustomers(customerData);
          setFinance(financeData);
          setDefinitions(reportCatalog.definitions);
          setRuns(reportCatalog.runs);
          setEnterpriseDashboard(enterpriseData);
          setKpis(kpiData);
          setInsights(insightData);
          setForecasts(forecastData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load analytics');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, period]);

  async function handleGenerateReport(reportType: ReportDefinitionSummary['reportType']) {
    if (!accessToken || !canWrite) return;

    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const run = await generateAnalyticsReport(accessToken, { reportType, period });
      setRuns((current) => [run, ...current]);
      setSuccess(run.summary ?? 'Report generated successfully.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to generate report');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRunAggregation() {
    if (!accessToken || !canWrite) return;
    setIsAggregating(true);
    setError(null);
    try {
      await runAnalyticsAggregation(accessToken);
      const enterpriseData = await fetchEnterpriseAnalyticsDashboard(accessToken);
      setEnterpriseDashboard(enterpriseData);
      setSuccess('Data warehouse aggregation completed from live tenant records.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to run aggregation');
    } finally {
      setIsAggregating(false);
    }
  }

  async function handleGenerateInsights() {
    if (!accessToken || !canWrite) return;
    setIsGenerating(true);
    setError(null);
    try {
      const generated = await generateBusinessInsights(accessToken);
      setInsights(generated);
      setSuccess('Business insights generated from real operational data.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to generate insights');
    } finally {
      setIsGenerating(false);
    }
  }

  if (!canView) {
    return (
      <div className="analytics-page">
        <PageHeader title="Analytics" description="You do not have permission to view analytics." />
      </div>
    );
  }

  const tabs: Array<{ id: AnalyticsTab; label: string }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'intelligence', label: 'Executive BI' },
    { id: 'kpis', label: 'KPIs' },
    { id: 'insights', label: 'AI Insights' },
    { id: 'forecasts', label: 'Forecasts' },
    { id: 'warehouse', label: 'Data Warehouse' },
    { id: 'reports', label: 'Reports' },
    { id: 'profitability', label: 'Profitability' },
    { id: 'technicians', label: 'Technicians' },
    { id: 'customers', label: 'Customers' },
    { id: 'finance', label: 'Finance' },
  ];

  return (
    <div className="analytics-page">
      <PageHeader
        title="Analytics"
        description="Enterprise intelligence — KPIs, forecasts, data warehouse, and business reports from live tenant data."
      />

      <div className="analytics-page__controls">
        <div className="analytics-page__period">
          {ANALYTICS_PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={period === option.value ? 'primary' : 'secondary'}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <nav className="analytics-page__tabs" aria-label="Analytics sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={
                activeTab === tab.id
                  ? 'analytics-page__tab analytics-page__tab--active'
                  : 'analytics-page__tab'
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {isLoading ? <p className="page-muted">Loading analytics…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {!isLoading && dashboard && activeTab === 'dashboard' ? (
        <>
          <section className="analytics-page__stats" aria-label="Executive KPIs">
            <StatCard
              label="Revenue"
              value={formatMoney(dashboard.revenue.totalCents, dashboard.currency)}
              hint={`${formatChangePercent(dashboard.revenue.changePercent)} vs previous period`}
            />
            <StatCard
              label="Jobs"
              value={String(dashboard.jobVolume.total)}
              hint={`${dashboard.jobVolume.completed} completed · ${dashboard.jobVolume.active} active`}
            />
            <StatCard
              label="New customers"
              value={String(dashboard.customerGrowth.newInPeriod)}
              hint={`${dashboard.customerGrowth.totalCustomers} total customers`}
            />
            <StatCard
              label="Outstanding"
              value={formatMoney(dashboard.outstandingBalances.totalCents, dashboard.currency)}
              hint={`${dashboard.outstandingBalances.count} open invoice(s)`}
            />
          </section>

          <div className="analytics-page__grid">
            <Panel title="Invoice & payment performance">
              <dl className="analytics-page__metrics">
                <div>
                  <dt>Invoices created</dt>
                  <dd>{dashboard.invoicePerformance.created}</dd>
                </div>
                <div>
                  <dt>Invoices sent</dt>
                  <dd>{dashboard.invoicePerformance.sent}</dd>
                </div>
                <div>
                  <dt>Invoices paid</dt>
                  <dd>{dashboard.invoicePerformance.paid}</dd>
                </div>
                <div>
                  <dt>Overdue</dt>
                  <dd>{dashboard.invoicePerformance.overdue}</dd>
                </div>
                <div>
                  <dt>Payments received</dt>
                  <dd>
                    {formatMoney(dashboard.paymentPerformance.totalCents, dashboard.currency)}
                  </dd>
                </div>
                <div>
                  <dt>Average payment</dt>
                  <dd>
                    {formatMoney(dashboard.paymentPerformance.averageCents, dashboard.currency)}
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel title="Operational KPIs">
              <dl className="analytics-page__metrics">
                <div>
                  <dt>Scheduled jobs</dt>
                  <dd>{dashboard.operationalKpis.scheduledJobs}</dd>
                </div>
                <div>
                  <dt>Completion rate</dt>
                  <dd>
                    {dashboard.operationalKpis.completionRatePercent !== null
                      ? `${dashboard.operationalKpis.completionRatePercent}%`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Low stock items</dt>
                  <dd>{dashboard.operationalKpis.lowStockItems}</dd>
                </div>
                <div>
                  <dt>Fleet in use</dt>
                  <dd>{dashboard.operationalKpis.fleetInUse}</dd>
                </div>
                <div>
                  <dt>Fleet in maintenance</dt>
                  <dd>{dashboard.operationalKpis.fleetMaintenance}</dd>
                </div>
              </dl>
            </Panel>
          </div>
        </>
      ) : null}

      {!isLoading && activeTab === 'reports' ? (
        <div className="analytics-page__grid">
          <Panel title="Available reports">
            <ul className="analytics-page__report-list">
              {definitions.map((definition) => (
                <li key={`${definition.reportType}-${definition.id ?? 'builtin'}`}>
                  <div>
                    <strong>{definition.name}</strong>
                    <p className="page-muted">{definition.description}</p>
                  </div>
                  {canWrite ? (
                    <Button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => void handleGenerateReport(definition.reportType)}
                    >
                      Generate
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent report runs">
            {runs.length === 0 ? (
              <EmptyState
                title="No reports generated yet"
                description="Generate a report to create an export-ready snapshot from your live data."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {runs.map((run) => (
                  <li key={run.id}>
                    <strong>
                      {REPORT_TYPE_OPTIONS.find((option) => option.value === run.reportType)
                        ?.label ?? run.reportType}
                    </strong>
                    <span className="analytics-page__run-status">{run.status}</span>
                    <p className="page-muted">{run.summary ?? 'Report run recorded.'}</p>
                    <p className="page-muted">
                      {new Date(run.startedAt).toLocaleString()}
                      {run.completedAt
                        ? ` · completed ${new Date(run.completedAt).toLocaleString()}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && profitability && activeTab === 'profitability' ? (
        <Panel title="Job profitability">
          <p className="page-muted">
            Revenue is derived from linked invoices. Material and labour costs are not tracked in
            TITAN yet, so estimated profit reflects revenue only.
          </p>
          <dl className="analytics-page__metrics analytics-page__metrics--inline">
            <div>
              <dt>Total revenue</dt>
              <dd>{formatMoney(profitability.totals.revenueCents, profitability.currency)}</dd>
            </div>
            <div>
              <dt>Average margin</dt>
              <dd>
                {profitability.totals.averageMarginPercent !== null
                  ? `${profitability.totals.averageMarginPercent}%`
                  : '—'}
              </dd>
            </div>
          </dl>
          {profitability.jobs.length === 0 ? (
            <EmptyState
              title="No jobs in this period"
              description="Create jobs and invoices to analyze profitability."
            />
          ) : (
            <div className="analytics-page__table-wrap">
              <table className="analytics-page__table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Revenue</th>
                    <th>Labour hours</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profitability.jobs.map((job) => (
                    <tr key={job.jobId}>
                      <td>{job.jobTitle}</td>
                      <td>{job.customerName}</td>
                      <td>{job.status}</td>
                      <td>{formatMoney(job.revenueCents, profitability.currency)}</td>
                      <td>{job.labourHours ?? '—'}</td>
                      <td>{job.marginPercent !== null ? `${job.marginPercent}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {!isLoading && technicians && activeTab === 'technicians' ? (
        <Panel title="Technician performance">
          <p className="page-muted">
            Workload is based on assigned jobs in the selected period. Customer ratings are not
            available yet.
          </p>
          {technicians.technicians.length === 0 ? (
            <EmptyState
              title="No technician assignments"
              description="Assign jobs to technicians to track workload."
            />
          ) : (
            <div className="analytics-page__table-wrap">
              <table className="analytics-page__table">
                <thead>
                  <tr>
                    <th>Technician</th>
                    <th>Assigned</th>
                    <th>Completed</th>
                    <th>Avg completion hours</th>
                    <th>Workload</th>
                  </tr>
                </thead>
                <tbody>
                  {technicians.technicians.map((technician) => (
                    <tr key={technician.userId}>
                      <td>{technician.name}</td>
                      <td>{technician.jobsAssigned}</td>
                      <td>{technician.jobsCompleted}</td>
                      <td>{technician.averageCompletionHours ?? '—'}</td>
                      <td>{technician.workloadScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {!isLoading && customers && activeTab === 'customers' ? (
        <div className="analytics-page__grid">
          <Panel title="Customer insights">
            <dl className="analytics-page__metrics">
              <div>
                <dt>New customers</dt>
                <dd>{customers.newCustomers}</dd>
              </div>
              <div>
                <dt>Repeat customers</dt>
                <dd>{customers.repeatCustomers}</dd>
              </div>
              <div>
                <dt>Total customers</dt>
                <dd>{customers.totalCustomers}</dd>
              </div>
              <div>
                <dt>Activity events</dt>
                <dd>{customers.activityCount}</dd>
              </div>
              <div>
                <dt>Quote conversion</dt>
                <dd>
                  {customers.quoteConversionRatePercent !== null
                    ? `${customers.quoteConversionRatePercent}%`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Customers with outstanding invoices</dt>
                <dd>{customers.customersWithOutstandingInvoices}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Top customers by revenue">
            {customers.topCustomersByRevenue.length === 0 ? (
              <EmptyState
                title="No payment data yet"
                description="Record payments to rank customer value."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {customers.topCustomersByRevenue.map((customer) => (
                  <li key={customer.customerId}>
                    <strong>{customer.customerName}</strong>
                    <p className="page-muted">
                      {formatMoney(customer.revenueCents, dashboard?.currency ?? 'ZAR')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && finance && activeTab === 'finance' ? (
        <div className="analytics-page__grid">
          <Panel title="Cash flow">
            <dl className="analytics-page__metrics">
              <div>
                <dt>Payment inflow</dt>
                <dd>{formatMoney(finance.cashFlow.inflowCents, finance.currency)}</dd>
              </div>
              <div>
                <dt>Invoiced</dt>
                <dd>{formatMoney(finance.cashFlow.invoicedCents, finance.currency)}</dd>
              </div>
              <div>
                <dt>Outstanding</dt>
                <dd>{formatMoney(finance.cashFlow.outstandingCents, finance.currency)}</dd>
              </div>
              <div>
                <dt>Monthly comparison</dt>
                <dd>{formatChangePercent(finance.monthlyComparison.changePercent)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Outstanding invoices">
            {finance.outstandingInvoices.length === 0 ? (
              <EmptyState
                title="No outstanding invoices"
                description="All synced invoices are paid or settled."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {finance.outstandingInvoices.slice(0, 10).map((invoice) => (
                  <li key={invoice.id}>
                    <strong>
                      {invoice.invoiceNumber} · {invoice.customerName}
                    </strong>
                    <p className="page-muted">
                      {formatMoney(invoice.outstandingCents, finance.currency)}
                      {invoice.daysOverdue !== null
                        ? ` · ${invoice.daysOverdue} day(s) overdue`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {!isLoading && enterpriseDashboard && activeTab === 'intelligence' ? (
        <>
          <section className="stat-grid">
            <StatCard
              label="Active KPIs"
              value={String(enterpriseDashboard.stats.activeKpiCount)}
            />
            <StatCard label="Dashboards" value={String(enterpriseDashboard.stats.dashboardCount)} />
            <StatCard
              label="Pending insights"
              value={String(enterpriseDashboard.stats.pendingInsightCount)}
            />
            <StatCard
              label="Scheduled reports"
              value={String(enterpriseDashboard.stats.scheduledReportCount)}
            />
            <StatCard
              label="Forecasts"
              value={String(enterpriseDashboard.stats.latestForecastCount)}
            />
            <StatCard
              label="Pending actions"
              value={String(enterpriseDashboard.pendingActionCount)}
            />
          </section>
          <p className="page-muted">{enterpriseDashboard.summary}</p>
          <Panel title="Data lake modules">
            {enterpriseDashboard.warehouse.modules.length === 0 ? (
              <p className="page-muted">No module activity recorded yet.</p>
            ) : (
              <ul className="analytics-page__run-list">
                {enterpriseDashboard.warehouse.modules.map((module) => (
                  <li key={module.module}>
                    <strong>{module.module}</strong>
                    <span className="page-muted">
                      {' '}
                      · {module.recordCount} record(s)
                      {module.lastActivityAt
                        ? ` · last activity ${new Date(module.lastActivityAt).toLocaleString()}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {!isLoading && activeTab === 'kpis' ? (
        <Panel title="Business KPIs">
          {kpis.length === 0 ? (
            <EmptyState
              title="No KPIs configured"
              description="Configure KPIs via the Business Intelligence API to track revenue, utilization, and conversion metrics."
            />
          ) : (
            <div className="analytics-page__table-wrap">
              <table className="analytics-page__table">
                <thead>
                  <tr>
                    <th>KPI</th>
                    <th>Current</th>
                    <th>Target</th>
                    <th>Change</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.map((kpi) => (
                    <tr key={kpi.id}>
                      <td>{kpi.name}</td>
                      <td>{kpi.currentValue ?? '—'}</td>
                      <td>{kpi.targetValue ?? '—'}</td>
                      <td>{kpi.changePercent != null ? `${kpi.changePercent}%` : '—'}</td>
                      <td>{kpi.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {!isLoading && activeTab === 'insights' ? (
        <>
          {canWrite ? (
            <div className="analytics-page__section-header">
              <span className="page-muted">Insights generated from real operational signals.</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={isGenerating}
                onClick={() => void handleGenerateInsights()}
              >
                {isGenerating ? 'Generating…' : 'Generate insights'}
              </Button>
            </div>
          ) : null}
          <Panel title="AI business insights">
            {insights.length === 0 ? (
              <EmptyState
                title="No insights yet"
                description="Generate insights from real operational data when patterns or anomalies are detected."
              />
            ) : (
              <ul className="analytics-page__run-list">
                {insights.map((insight) => (
                  <li key={insight.id}>
                    <strong>
                      [{insight.priority}] {insight.title}
                    </strong>
                    <p className="page-muted">{insight.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {!isLoading && activeTab === 'forecasts' ? (
        <Panel title="Predictive forecasts">
          {forecasts.length === 0 ? (
            <EmptyState
              title="No forecasts generated"
              description="Forecasts are created from historical tenant data via the Business Intelligence engine."
            />
          ) : (
            <ul className="analytics-page__run-list">
              {forecasts.map((forecast) => (
                <li key={forecast.id}>
                  <strong>{forecast.forecastType.replace(/_/g, ' ')}</strong>
                  <p className="page-muted">
                    {forecast.summary}
                    {forecast.confidencePercent != null
                      ? ` · ${forecast.confidencePercent}% confidence`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {!isLoading && enterpriseDashboard && activeTab === 'warehouse' ? (
        <>
          <div className="analytics-page__section-header">
            <p className="page-muted">
              Last aggregated:{' '}
              {enterpriseDashboard.warehouse.lastAggregatedAt
                ? new Date(enterpriseDashboard.warehouse.lastAggregatedAt).toLocaleString()
                : 'Never'}
            </p>
            {canWrite ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={isAggregating}
                onClick={() => void handleRunAggregation()}
              >
                {isAggregating ? 'Aggregating…' : 'Run incremental aggregation'}
              </Button>
            ) : null}
          </div>
          <div className="analytics-page__grid">
            <Panel title="Historical snapshots">
              {enterpriseDashboard.warehouse.snapshots.length === 0 ? (
                <p className="page-muted">
                  No snapshots yet. Run aggregation to capture cross-module metrics.
                </p>
              ) : (
                <ul className="analytics-page__run-list">
                  {enterpriseDashboard.warehouse.snapshots.map((snapshot) => (
                    <li key={snapshot.id}>
                      <strong>{snapshot.module}</strong> — {snapshot.recordCount} record(s)
                      <span className="page-muted">
                        {' '}
                        · {new Date(snapshot.generatedAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Data lineage">
              {enterpriseDashboard.warehouse.lineage.length === 0 ? (
                <p className="page-muted">Lineage records appear when aggregation runs.</p>
              ) : (
                <ul className="analytics-page__run-list">
                  {enterpriseDashboard.warehouse.lineage.map((entry) => (
                    <li key={entry.id}>
                      <strong>
                        {entry.sourceModule} → {entry.targetModule}
                      </strong>
                      <p className="page-muted">{entry.transformation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
