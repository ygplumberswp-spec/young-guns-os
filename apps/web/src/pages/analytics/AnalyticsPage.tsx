import { useMemo, useState } from 'react';
import { Button, PageHeader, Panel } from '@titan/ui';
import type { AnalyticsPeriod, ReportDefinitionSummary } from '@titan/shared';
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
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import {
  canAccessAnalytics,
  canManageAnalytics,
  formatChangePercent,
} from '../../features/analytics/utils';
import { AnalyticsTabPanel } from '../../features/analytics/AnalyticsTabPanel';
import { ANALYTICS_PERIOD_OPTIONS, formatMoney, REPORT_TYPE_OPTIONS } from '@titan/shared';
import { CompactTabs, EmptyState, SummaryCardGrid } from '../../components/ux';

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAggregating, setIsAggregating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessAnalytics(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageAnalytics(user.permissions) : false), [user]);

  const periodKey = `analytics/${period}`;

  const dashboardQuery = useStaffCachedQuery({
    queryKey: `${periodKey}/dashboard`,
    enabled: canView && activeTab === 'dashboard',
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchAnalyticsDashboard(accessToken!, { period }, { signal }),
  });

  const profitabilityQuery = useStaffCachedQuery({
    queryKey: `${periodKey}/profitability`,
    enabled: canView && activeTab === 'profitability',
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchJobProfitability(accessToken!, { period }, { signal }),
  });

  const techniciansQuery = useStaffCachedQuery({
    queryKey: `${periodKey}/technicians`,
    enabled: canView && activeTab === 'technicians',
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchTechnicianPerformance(accessToken!, { period }, { signal }),
  });

  const customersQuery = useStaffCachedQuery({
    queryKey: `${periodKey}/customers`,
    enabled: canView && activeTab === 'customers',
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchCustomerAnalytics(accessToken!, { period }, { signal }),
  });

  const financeQuery = useStaffCachedQuery({
    queryKey: `${periodKey}/finance`,
    enabled: canView && activeTab === 'finance',
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchFinanceAnalytics(accessToken!, { period }, { signal }),
  });

  const reportsQuery = useStaffCachedQuery({
    queryKey: 'analytics/reports',
    enabled: canView && activeTab === 'reports',
    staleTimeMs: 120_000,
    fetcher: (signal) => fetchReportCatalog(accessToken!, { signal }),
  });

  const enterpriseQuery = useStaffCachedQuery({
    queryKey: 'analytics/enterprise-dashboard',
    enabled: canView && (activeTab === 'intelligence' || activeTab === 'warehouse'),
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchEnterpriseAnalyticsDashboard(accessToken!, { signal }),
  });

  const kpisQuery = useStaffCachedQuery({
    queryKey: 'analytics/kpis',
    enabled: canView && activeTab === 'kpis',
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchBusinessKpis(accessToken!, { signal }),
  });

  const insightsQuery = useStaffCachedQuery({
    queryKey: 'analytics/insights',
    enabled: canView && activeTab === 'insights',
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchBusinessInsights(accessToken!, { signal }),
  });

  const forecastsQuery = useStaffCachedQuery({
    queryKey: 'analytics/forecasts',
    enabled: canView && activeTab === 'forecasts',
    staleTimeMs: 60_000,
    fetcher: (signal) => fetchPredictiveForecasts(accessToken!, { signal }),
  });

  async function handleGenerateReport(reportType: ReportDefinitionSummary['reportType']) {
    if (!accessToken || !canWrite) return;

    setIsGenerating(true);
    setActionError(null);
    setSuccess(null);

    try {
      const run = await generateAnalyticsReport(accessToken, { reportType, period });
      await reportsQuery.refetch();
      setSuccess(run.summary ?? 'Report generated successfully.');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to generate report');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRunAggregation() {
    if (!accessToken || !canWrite) return;
    setIsAggregating(true);
    setActionError(null);
    try {
      await runAnalyticsAggregation(accessToken);
      await enterpriseQuery.refetch();
      setSuccess('Data warehouse aggregation completed from live tenant records.');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to run aggregation');
    } finally {
      setIsAggregating(false);
    }
  }

  async function handleGenerateInsights() {
    if (!accessToken || !canWrite) return;
    setIsGenerating(true);
    setActionError(null);
    try {
      await generateBusinessInsights(accessToken);
      await insightsQuery.refetch();
      setSuccess('Business insights generated from real operational data.');
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Unable to generate insights');
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
        <nav className="analytics-page__period" aria-label="Analytics period">
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
        </nav>
        <CompactTabs<AnalyticsTab>
          tabs={tabs}
          activeId={activeTab}
          onChange={setActiveTab}
          maxVisible={5}
          moreLabel="More analytics"
        />
      </div>

      {actionError ? <p className="form-error">{actionError}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {activeTab === 'dashboard' ? (
        <AnalyticsTabPanel
          isLoading={dashboardQuery.isLoading}
          error={dashboardQuery.error}
          hasData={dashboardQuery.data !== undefined}
          loadingLabel="Loading dashboard…"
          onRetry={() => void dashboardQuery.refetch()}
        >
          {dashboardQuery.data ? (
            <>
              <SummaryCardGrid
                aria-label="Executive KPIs"
                items={[
                  {
                    label: 'Revenue',
                    value: formatMoney(
                      dashboardQuery.data.revenue.totalCents,
                      dashboardQuery.data.currency,
                    ),
                    hint: `${formatChangePercent(dashboardQuery.data.revenue.changePercent)} vs previous period`,
                  },
                  {
                    label: 'Jobs',
                    value: String(dashboardQuery.data.jobVolume.total),
                    hint: `${dashboardQuery.data.jobVolume.completed} completed · ${dashboardQuery.data.jobVolume.active} active`,
                  },
                  {
                    label: 'New customers',
                    value: String(dashboardQuery.data.customerGrowth.newInPeriod),
                    hint: `${dashboardQuery.data.customerGrowth.totalCustomers} total customers`,
                  },
                  {
                    label: 'Outstanding',
                    value: formatMoney(
                      dashboardQuery.data.outstandingBalances.totalCents,
                      dashboardQuery.data.currency,
                    ),
                    hint: `${dashboardQuery.data.outstandingBalances.count} open invoice(s)`,
                  },
                ]}
              />

              <div className="analytics-page__grid">
                <Panel title="Invoice & payment performance">
                  <dl className="analytics-page__metrics">
                    <div>
                      <dt>Invoices created</dt>
                      <dd>{dashboardQuery.data.invoicePerformance.created}</dd>
                    </div>
                    <div>
                      <dt>Invoices sent</dt>
                      <dd>{dashboardQuery.data.invoicePerformance.sent}</dd>
                    </div>
                    <div>
                      <dt>Invoices paid</dt>
                      <dd>{dashboardQuery.data.invoicePerformance.paid}</dd>
                    </div>
                    <div>
                      <dt>Overdue</dt>
                      <dd>{dashboardQuery.data.invoicePerformance.overdue}</dd>
                    </div>
                    <div>
                      <dt>Payments received</dt>
                      <dd>
                        {formatMoney(
                          dashboardQuery.data.paymentPerformance.totalCents,
                          dashboardQuery.data.currency,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Average payment</dt>
                      <dd>
                        {formatMoney(
                          dashboardQuery.data.paymentPerformance.averageCents,
                          dashboardQuery.data.currency,
                        )}
                      </dd>
                    </div>
                  </dl>
                </Panel>

                <Panel title="Operational KPIs">
                  <dl className="analytics-page__metrics">
                    <div>
                      <dt>Scheduled jobs</dt>
                      <dd>{dashboardQuery.data.operationalKpis.scheduledJobs}</dd>
                    </div>
                    <div>
                      <dt>Completion rate</dt>
                      <dd>
                        {dashboardQuery.data.operationalKpis.completionRatePercent !== null
                          ? `${dashboardQuery.data.operationalKpis.completionRatePercent}%`
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Low stock items</dt>
                      <dd>{dashboardQuery.data.operationalKpis.lowStockItems}</dd>
                    </div>
                    <div>
                      <dt>Fleet in use</dt>
                      <dd>{dashboardQuery.data.operationalKpis.fleetInUse}</dd>
                    </div>
                    <div>
                      <dt>Fleet in maintenance</dt>
                      <dd>{dashboardQuery.data.operationalKpis.fleetMaintenance}</dd>
                    </div>
                  </dl>
                </Panel>
              </div>
            </>
          ) : null}
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'reports' ? (
        <AnalyticsTabPanel
          isLoading={reportsQuery.isLoading}
          error={reportsQuery.error}
          hasData={reportsQuery.data !== undefined}
          loadingLabel="Loading reports…"
          onRetry={() => void reportsQuery.refetch()}
        >
          {reportsQuery.data ? (
            <div className="analytics-page__grid">
              <Panel title="Available reports">
                <ul className="analytics-page__report-list">
                  {reportsQuery.data.definitions.map((definition) => (
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
                {reportsQuery.data.runs.length === 0 ? (
                  <EmptyState
                    title="No reports generated yet"
                    description="Generate a report to create an export-ready snapshot from your live data."
                  />
                ) : (
                  <ul className="analytics-page__run-list">
                    {reportsQuery.data.runs.map((run) => (
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
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'profitability' ? (
        <AnalyticsTabPanel
          isLoading={profitabilityQuery.isLoading}
          error={profitabilityQuery.error}
          hasData={profitabilityQuery.data !== undefined}
          loadingLabel="Loading profitability…"
          onRetry={() => void profitabilityQuery.refetch()}
        >
          {profitabilityQuery.data ? (
            <Panel title="Job profitability">
              <p className="page-muted">
                Revenue is derived from linked invoices. Material and labour costs are not tracked
                in TITAN yet, so estimated profit reflects revenue only.
              </p>
              <dl className="analytics-page__metrics analytics-page__metrics--inline">
                <div>
                  <dt>Total revenue</dt>
                  <dd>
                    {formatMoney(
                      profitabilityQuery.data.totals.revenueCents,
                      profitabilityQuery.data.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Average margin</dt>
                  <dd>
                    {profitabilityQuery.data.totals.averageMarginPercent !== null
                      ? `${profitabilityQuery.data.totals.averageMarginPercent}%`
                      : '—'}
                  </dd>
                </div>
              </dl>
              {profitabilityQuery.data.jobs.length === 0 ? (
                <EmptyState
                  title="No analytics data yet"
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
                      {profitabilityQuery.data.jobs.map((job) => (
                        <tr key={job.jobId}>
                          <td>{job.jobTitle}</td>
                          <td>{job.customerName}</td>
                          <td>{job.status}</td>
                          <td>
                            {formatMoney(job.revenueCents, profitabilityQuery.data!.currency)}
                          </td>
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
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'technicians' ? (
        <AnalyticsTabPanel
          isLoading={techniciansQuery.isLoading}
          error={techniciansQuery.error}
          hasData={techniciansQuery.data !== undefined}
          loadingLabel="Loading technician analytics…"
          onRetry={() => void techniciansQuery.refetch()}
        >
          {techniciansQuery.data ? (
            <Panel title="Technician performance">
              <p className="page-muted">
                Workload is based on assigned jobs in the selected period. Customer ratings are not
                available yet.
              </p>
              {techniciansQuery.data.technicians.length === 0 ? (
                <EmptyState
                  title="No analytics data yet"
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
                      {techniciansQuery.data.technicians.map((technician) => (
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
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'customers' ? (
        <AnalyticsTabPanel
          isLoading={customersQuery.isLoading}
          error={customersQuery.error}
          hasData={customersQuery.data !== undefined}
          loadingLabel="Loading customer analytics…"
          onRetry={() => void customersQuery.refetch()}
        >
          {customersQuery.data ? (
            <div className="analytics-page__grid">
              <Panel title="Customer insights">
                <dl className="analytics-page__metrics">
                  <div>
                    <dt>New customers</dt>
                    <dd>{customersQuery.data.newCustomers}</dd>
                  </div>
                  <div>
                    <dt>Repeat customers</dt>
                    <dd>{customersQuery.data.repeatCustomers}</dd>
                  </div>
                  <div>
                    <dt>Total customers</dt>
                    <dd>{customersQuery.data.totalCustomers}</dd>
                  </div>
                  <div>
                    <dt>Activity events</dt>
                    <dd>{customersQuery.data.activityCount}</dd>
                  </div>
                  <div>
                    <dt>Quote conversion</dt>
                    <dd>
                      {customersQuery.data.quoteConversionRatePercent !== null
                        ? `${customersQuery.data.quoteConversionRatePercent}%`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Customers with outstanding invoices</dt>
                    <dd>{customersQuery.data.customersWithOutstandingInvoices}</dd>
                  </div>
                </dl>
              </Panel>

              <Panel title="Top customers by revenue">
                {customersQuery.data.topCustomersByRevenue.length === 0 ? (
                  <EmptyState
                    title="No analytics data yet"
                    description="Record payments to rank customer value."
                  />
                ) : (
                  <ul className="analytics-page__run-list">
                    {customersQuery.data.topCustomersByRevenue.map((customer) => (
                      <li key={customer.customerId}>
                        <strong>{customer.customerName}</strong>
                        <p className="page-muted">
                          {formatMoney(
                            customer.revenueCents,
                            dashboardQuery.data?.currency ?? 'ZAR',
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : null}
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'finance' ? (
        <AnalyticsTabPanel
          isLoading={financeQuery.isLoading}
          error={financeQuery.error}
          hasData={financeQuery.data !== undefined}
          loadingLabel="Loading finance analytics…"
          onRetry={() => void financeQuery.refetch()}
        >
          {financeQuery.data ? (
            <div className="analytics-page__grid">
              <Panel title="Cash flow">
                <dl className="analytics-page__metrics">
                  <div>
                    <dt>Payment inflow</dt>
                    <dd>
                      {formatMoney(
                        financeQuery.data.cashFlow.inflowCents,
                        financeQuery.data.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Invoiced</dt>
                    <dd>
                      {formatMoney(
                        financeQuery.data.cashFlow.invoicedCents,
                        financeQuery.data.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>
                      {formatMoney(
                        financeQuery.data.cashFlow.outstandingCents,
                        financeQuery.data.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Monthly comparison</dt>
                    <dd>
                      {formatChangePercent(financeQuery.data.monthlyComparison.changePercent)}
                    </dd>
                  </div>
                </dl>
              </Panel>

              <Panel title="Outstanding invoices">
                {financeQuery.data.outstandingInvoices.length === 0 ? (
                  <EmptyState
                    title="No analytics data yet"
                    description="All synced invoices are paid or settled."
                  />
                ) : (
                  <ul className="analytics-page__run-list">
                    {financeQuery.data.outstandingInvoices.slice(0, 10).map((invoice) => (
                      <li key={invoice.id}>
                        <strong>
                          {invoice.invoiceNumber} · {invoice.customerName}
                        </strong>
                        <p className="page-muted">
                          {formatMoney(invoice.outstandingCents, financeQuery.data!.currency)}
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
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'intelligence' ? (
        <AnalyticsTabPanel
          isLoading={enterpriseQuery.isLoading}
          error={enterpriseQuery.error}
          hasData={enterpriseQuery.data !== undefined}
          loadingLabel="Loading executive BI…"
          onRetry={() => void enterpriseQuery.refetch()}
        >
          {enterpriseQuery.data ? (
            <>
              <section className="stat-grid">
                <SummaryCardGrid
                  aria-label="Executive BI metrics"
                  items={[
                    {
                      label: 'Active KPIs',
                      value:
                        enterpriseQuery.data.stats.activeKpiCount > 0
                          ? String(enterpriseQuery.data.stats.activeKpiCount)
                          : '—',
                    },
                    {
                      label: 'Dashboards',
                      value:
                        enterpriseQuery.data.stats.dashboardCount > 0
                          ? String(enterpriseQuery.data.stats.dashboardCount)
                          : '—',
                    },
                    {
                      label: 'Pending insights',
                      value:
                        enterpriseQuery.data.stats.pendingInsightCount > 0
                          ? String(enterpriseQuery.data.stats.pendingInsightCount)
                          : '—',
                    },
                    {
                      label: 'Scheduled reports',
                      value:
                        enterpriseQuery.data.stats.scheduledReportCount > 0
                          ? String(enterpriseQuery.data.stats.scheduledReportCount)
                          : '—',
                    },
                  ]}
                />
              </section>
              <p className="page-muted">{enterpriseQuery.data.summary}</p>
              <Panel title="Data lake modules">
                {enterpriseQuery.data.warehouse.modules.length === 0 ? (
                  <EmptyState
                    title="No analytics data yet"
                    description="Module activity will appear after operational records are created."
                  />
                ) : (
                  <ul className="analytics-page__run-list">
                    {enterpriseQuery.data.warehouse.modules.map((module) => (
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
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'kpis' ? (
        <AnalyticsTabPanel
          isLoading={kpisQuery.isLoading}
          error={kpisQuery.error}
          hasData={kpisQuery.data !== undefined}
          isEmpty={(kpisQuery.data?.length ?? 0) === 0}
          emptyTitle="No analytics data yet"
          emptyDescription="Configure KPIs via the Business Intelligence API to track revenue, utilization, and conversion metrics."
          loadingLabel="Loading KPIs…"
          onRetry={() => void kpisQuery.refetch()}
        >
          {(kpisQuery.data?.length ?? 0) > 0 ? (
            <Panel title="Business KPIs">
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
                    {kpisQuery.data!.map((kpi) => (
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
            </Panel>
          ) : null}
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'insights' ? (
        <AnalyticsTabPanel
          isLoading={insightsQuery.isLoading}
          error={insightsQuery.error}
          hasData={insightsQuery.data !== undefined}
          loadingLabel="Loading insights…"
          onRetry={() => void insightsQuery.refetch()}
        >
          <>
            {canWrite ? (
              <div className="analytics-page__section-header">
                <span className="page-muted">
                  Insights generated from real operational signals.
                </span>
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
            {(insightsQuery.data?.length ?? 0) > 0 ? (
              <Panel title="AI business insights">
                <ul className="analytics-page__run-list">
                  {insightsQuery.data!.map((insight) => (
                    <li key={insight.id}>
                      <strong>
                        [{insight.priority}] {insight.title}
                      </strong>
                      <p className="page-muted">{insight.description}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : (
              <Panel title="AI business insights">
                <EmptyState
                  title="No analytics data yet"
                  description="Generate insights from real operational data when patterns or anomalies are detected."
                />
              </Panel>
            )}
          </>
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'forecasts' ? (
        <AnalyticsTabPanel
          isLoading={forecastsQuery.isLoading}
          error={forecastsQuery.error}
          hasData={forecastsQuery.data !== undefined}
          isEmpty={(forecastsQuery.data?.length ?? 0) === 0}
          emptyTitle="No analytics data yet"
          emptyDescription="Forecasts are created from historical tenant data via the Business Intelligence engine."
          loadingLabel="Loading forecasts…"
          onRetry={() => void forecastsQuery.refetch()}
        >
          {(forecastsQuery.data?.length ?? 0) > 0 ? (
            <Panel title="Predictive forecasts">
              <ul className="analytics-page__run-list">
                {forecastsQuery.data!.map((forecast) => (
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
            </Panel>
          ) : null}
        </AnalyticsTabPanel>
      ) : null}

      {activeTab === 'warehouse' ? (
        <AnalyticsTabPanel
          isLoading={enterpriseQuery.isLoading}
          error={enterpriseQuery.error}
          hasData={enterpriseQuery.data !== undefined}
          loadingLabel="Loading data warehouse…"
          onRetry={() => void enterpriseQuery.refetch()}
        >
          {enterpriseQuery.data ? (
            <>
              <div className="analytics-page__section-header">
                <p className="page-muted">
                  Last aggregated:{' '}
                  {enterpriseQuery.data.warehouse.lastAggregatedAt
                    ? new Date(enterpriseQuery.data.warehouse.lastAggregatedAt).toLocaleString()
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
                  {enterpriseQuery.data.warehouse.snapshots.length === 0 ? (
                    <EmptyState
                      title="No analytics data yet"
                      description="Run aggregation to capture cross-module metrics."
                    />
                  ) : (
                    <ul className="analytics-page__run-list">
                      {enterpriseQuery.data.warehouse.snapshots.map((snapshot) => (
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
                  {enterpriseQuery.data.warehouse.lineage.length === 0 ? (
                    <EmptyState
                      title="No analytics data yet"
                      description="Lineage records appear when aggregation runs."
                    />
                  ) : (
                    <ul className="analytics-page__run-list">
                      {enterpriseQuery.data.warehouse.lineage.map((entry) => (
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
        </AnalyticsTabPanel>
      ) : null}
    </div>
  );
}
