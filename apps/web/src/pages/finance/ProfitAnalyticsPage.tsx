import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader, StatCard } from '@titan/ui';
import type {
  ProfitAnalyticsDashboard,
  ProfitAnalyticsJobRow,
  ProfitAnalyticsPeriod,
} from '@titan/shared';
import { canViewProfitAnalytics, formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchProfitAnalyticsDashboard } from '../../lib/profit-analytics-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';

const PERIODS: Array<{ id: ProfitAnalyticsPeriod; label: string }> = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
];

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="profit-analytics__metrics">{children}</div>;
}

function JobList({
  rows,
  currency,
  empty,
}: {
  rows: ProfitAnalyticsJobRow[];
  currency: string;
  empty: string;
}) {
  if (rows.length === 0) return <p className="page-muted">{empty}</p>;
  return (
    <ul className="jobs-list">
      {rows.map((job) => (
        <li key={job.jobId} className="jobs-list__item">
          <div>
            <Link href={job.href} className="jobs-link">
              {job.jobReference ?? job.title}
            </Link>
            <span className="page-muted">
              {' '}
              — {job.dataQuality}
              {job.grossMarginPct != null ? ` · ${job.grossMarginPct}% margin` : ''}
              {job.customerName ? ` · ${job.customerName}` : ''}
            </span>
          </div>
          <div>{formatMoney(job.grossProfitCents, currency)}</div>
        </li>
      ))}
    </ul>
  );
}

export function ProfitAnalyticsPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(
    () =>
      user
        ? canViewProfitAnalytics({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  const [period, setPeriod] = useState<ProfitAnalyticsPeriod>('month');
  const [dashboard, setDashboard] = useState<ProfitAnalyticsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !canView) return;
    let cancelled = false;
    setError(null);
    void fetchProfitAnalyticsDashboard(accessToken, period)
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load profit analytics',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, period]);

  if (!canView) {
    return (
      <div className="profit-analytics">
        <FinanceNav />
        <PageHeader
          title="Job / Service Profit Analytics"
          description="Drill-down analytics over JPE job financial truth."
        />
        <p className="form-error">Profit analytics is not available for your role.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profit-analytics">
        <FinanceNav />
        <PageHeader
          title="Job / Service Profit Analytics"
          description="Drill-down analytics over JPE job financial truth."
        />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="profit-analytics">
        <FinanceNav />
        <PageHeader
          title="Job / Service Profit Analytics"
          description="Drill-down analytics over JPE job financial truth."
        />
        <p className="page-muted">Loading profit analytics…</p>
      </div>
    );
  }

  const { overview, jobs, services, customers, technicians, labour, materials, suppliers, suburbs } =
    dashboard;
  const currency = overview.currency;

  return (
    <div className="profit-analytics">
      <FinanceNav />
      <PageHeader
        title="Job / Service Profit Analytics"
        description="Which jobs, services, customers, and cost patterns make or lose money — from JPE truth only."
      />

      <div className="profit-analytics__periods" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={period === p.id}
            className={`ux-compact-tabs__tab${period === p.id ? ' ux-compact-tabs__tab--active' : ''}`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Panel title="Data Quality">
        <p>
          <strong>{overview.coverage.dataQuality}</strong>
          <span className="page-muted"> — {overview.coverage.qualityNote}</span>
        </p>
        <p className="page-muted">
          Included {overview.coverage.jobsIncluded} · Verified {overview.coverage.verifiedJobs} ·
          Provisional {overview.coverage.provisionalJobs} · Incomplete{' '}
          {overview.coverage.incompleteJobs}. Incomplete jobs are labelled and excluded from
          confident rankings. Economic profit and cash profit stay separate.
        </p>
        <div className="profit-analytics__links">
          <Link href="/finance/owner-command">Financial Command</Link>
          <Link href="/finance/job-cost-control">Job cost control</Link>
        </div>
      </Panel>

      <Panel title="Overview">
        <MetricGrid>
          <StatCard label="Revenue" value={formatMoney(overview.revenueCents, currency)} />
          <StatCard
            label="Economic cost"
            value={formatMoney(overview.economicCostCents, currency)}
          />
          <StatCard
            label="Gross profit"
            value={formatMoney(overview.grossProfitCents, currency)}
          />
          <StatCard
            label="Gross margin"
            value={
              overview.grossMarginPct == null ? 'Unavailable' : `${overview.grossMarginPct}%`
            }
          />
          <StatCard
            label="Known realised cash profit"
            value={formatMoney(overview.knownRealisedCashProfitCents, currency)}
          />
          <StatCard label="Loss jobs" value={String(overview.lossJobCount)} />
          <StatCard label="Low margin jobs" value={String(overview.lowMarginJobCount)} />
        </MetricGrid>
      </Panel>

      <Panel title="Jobs">
        <h3 className="profit-analytics__subhead">Top gross profit</h3>
        <JobList
          rows={jobs.topGrossProfit}
          currency={currency}
          empty="No confident top-profit jobs in this period."
        />
        <h3 className="profit-analytics__subhead">Lowest margin</h3>
        <JobList
          rows={jobs.lowestMargin}
          currency={currency}
          empty="No confident low-margin jobs in this period."
        />
        <h3 className="profit-analytics__subhead">Loss jobs</h3>
        <JobList rows={jobs.lossJobs} currency={currency} empty="No loss jobs in this period." />
        <h3 className="profit-analytics__subhead">Largest margin misses</h3>
        <JobList
          rows={jobs.largestMarginMisses}
          currency={currency}
          empty="No margin-miss jobs with expected vs actual data."
        />
        <h3 className="profit-analytics__subhead">Financially incomplete</h3>
        <JobList
          rows={jobs.incompleteJobs}
          currency={currency}
          empty="No incomplete jobs flagged in this period."
        />
      </Panel>

      <Panel title="Services">
        <p className="page-muted">{services.taxonomyNote}</p>
        {services.rows.length === 0 ? (
          <p className="page-muted">No service aggregates for this period.</p>
        ) : (
          <ul className="jobs-list">
            {services.rows.map((row) => (
              <li key={row.key} className="jobs-list__item">
                <div>
                  <strong>{row.label}</strong>
                  <span className="page-muted">
                    {' '}
                    — {row.jobsCount} jobs · {row.dataQuality}
                    {row.grossMarginPct != null ? ` · ${row.grossMarginPct}%` : ''}
                    {row.lossJobCount > 0 ? ` · ${row.lossJobCount} loss` : ''}
                  </span>
                </div>
                <div>
                  {formatMoney(row.grossProfitCents, currency)}
                  <span className="page-muted">
                    {' '}
                    · avg {formatMoney(row.averageTicketCents, currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Customers">
        {customers.rows.length === 0 ? (
          <p className="page-muted">No customer aggregates for this period.</p>
        ) : (
          <ul className="jobs-list">
            {customers.rows.map((row) => (
              <li key={row.key} className="jobs-list__item">
                <div>
                  {row.href ? (
                    <Link href={row.href} className="jobs-link">
                      {row.label}
                    </Link>
                  ) : (
                    <strong>{row.label}</strong>
                  )}
                  <span className="page-muted">
                    {' '}
                    — {row.jobsCount} jobs · incomplete {row.incompleteJobsCount} ·{' '}
                    {row.dataQuality}
                  </span>
                </div>
                <div>
                  GP {formatMoney(row.grossProfitCents, currency)}
                  <span className="page-muted">
                    {' '}
                    · ticket {formatMoney(row.averageTicketCents, currency)}
                    {row.outstandingCustomerCashCents != null
                      ? ` · AR ${formatMoney(row.outstandingCustomerCashCents, currency)}`
                      : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Labour (operational context)">
        <MetricGrid>
          <StatCard
            label="Actual labour hours"
            value={(labour.actualLabourMinutes / 60).toFixed(1)}
          />
          <StatCard
            label="Actual labour cost"
            value={formatMoney(labour.actualLabourCostCents, currency)}
          />
          <StatCard
            label="Expected labour cost"
            value={
              labour.expectedLabourSupported
                ? formatMoney(labour.expectedLabourCostCents, currency)
                : 'Not reliably available'
            }
          />
          <StatCard
            label="Labour variance"
            value={
              labour.expectedLabourSupported
                ? formatMoney(labour.labourVarianceCents, currency)
                : '—'
            }
          />
          <StatCard
            label="Jobs with labour overrun"
            value={String(labour.jobsWithLabourOverrun)}
          />
        </MetricGrid>
        {labour.limitationNote ? <p className="page-muted">{labour.limitationNote}</p> : null}

        <h3 className="profit-analytics__subhead">Technician / team assignment context</h3>
        <p className="page-muted">{technicians.caveat}</p>
        {technicians.rows.length === 0 ? (
          <p className="page-muted">No assigned technicians on jobs in this period.</p>
        ) : (
          <ul className="jobs-list">
            {technicians.rows.map((row) => (
              <li key={row.userId} className="jobs-list__item">
                <div>
                  <strong>{row.userName}</strong>
                  <span className="page-muted">
                    {' '}
                    — {row.jobsCompleted} completed · {(row.labourMinutes / 60).toFixed(1)}h ·{' '}
                    {row.dataQuality}
                    {row.incompleteCostCaptureCount > 0
                      ? ` · ${row.incompleteCostCaptureCount} incomplete`
                      : ''}
                  </span>
                </div>
                <div>
                  {formatMoney(row.attributableGrossProfitCents, currency)}
                  <span className="page-muted">
                    {row.attributableGrossMarginPct != null
                      ? ` · ${row.attributableGrossMarginPct}%`
                      : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Materials / Suppliers">
        <MetricGrid>
          <StatCard
            label="Actual material cost"
            value={formatMoney(materials.actualMaterialCostCents, currency)}
          />
          <StatCard
            label="Expected material cost"
            value={
              materials.expectedMaterialSupported
                ? formatMoney(materials.expectedMaterialCostCents, currency)
                : 'Not reliably available'
            }
          />
          <StatCard
            label="Material variance"
            value={
              materials.expectedMaterialSupported
                ? formatMoney(materials.materialVarianceCents, currency)
                : '—'
            }
          />
          <StatCard
            label="Jobs with material overrun"
            value={String(materials.jobsWithMaterialOverrun)}
          />
        </MetricGrid>
        {materials.limitationNote ? (
          <p className="page-muted">{materials.limitationNote}</p>
        ) : null}
        <p className="page-muted">{suppliers.note}</p>
        {suppliers.rows.length === 0 ? (
          <p className="page-muted">No supplier-linked direct costs in this period.</p>
        ) : (
          <ul className="jobs-list">
            {suppliers.rows.map((row) => (
              <li key={row.supplierId} className="jobs-list__item">
                <div>
                  <strong>{row.supplierName}</strong>
                  <span className="page-muted">
                    {' '}
                    — {row.costEntryCount} entries · receipts {row.receiptCompleteCount}/
                    {row.costEntryCount}
                    {row.receiptMissingCount > 0 ? ` · missing ${row.receiptMissingCount}` : ''}
                  </span>
                </div>
                <div>
                  {formatMoney(row.spendCents, currency)}
                  <span className="page-muted">
                    {' '}
                    · job-attributed {formatMoney(row.jobAttributedSpendCents, currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Property / Suburb">
        <p className="page-muted">{suburbs.taxonomyNote}</p>
        {suburbs.rows.length === 0 ? (
          <p className="page-muted">No suburb aggregates for this period.</p>
        ) : (
          <ul className="jobs-list">
            {suburbs.rows.map((row) => (
              <li key={row.key} className="jobs-list__item">
                <div>
                  <strong>{row.label}</strong>
                  <span className="page-muted">
                    {' '}
                    — {row.jobsCount} jobs · {row.dataQuality}
                  </span>
                </div>
                <div>
                  {formatMoney(row.grossProfitCents, currency)}
                  <span className="page-muted">
                    {row.grossMarginPct != null ? ` · ${row.grossMarginPct}%` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
