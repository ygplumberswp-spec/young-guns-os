import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader, StatCard } from '@titan/ui';
import type {
  OperatingProfitDashboard,
  OperatingProfitPeriod,
} from '@titan/shared';
import { canViewOperatingProfit, formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchOperatingProfitDashboard } from '../../lib/operating-profit-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';

const PERIODS: Array<{ id: OperatingProfitPeriod; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
];

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="operating-profit__metrics">{children}</div>;
}

export function OperatingProfitPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(
    () =>
      user
        ? canViewOperatingProfit({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  const [period, setPeriod] = useState<OperatingProfitPeriod>('month');
  const [dashboard, setDashboard] = useState<OperatingProfitDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !canView) return;
    let cancelled = false;
    setError(null);
    void fetchOperatingProfitDashboard(accessToken, period)
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load operating profit',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, period]);

  if (!canView) {
    return (
      <div className="operating-profit">
        <FinanceNav />
        <PageHeader
          title="Overhead & Operating Profit"
          description="Company gross profit minus known business overhead."
        />
        <p className="form-error">Operating profit is not available for your role.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="operating-profit">
        <FinanceNav />
        <PageHeader
          title="Overhead & Operating Profit"
          description="Company gross profit minus known business overhead."
        />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="operating-profit">
        <FinanceNav />
        <PageHeader
          title="Overhead & Operating Profit"
          description="Company gross profit minus known business overhead."
        />
        <p className="page-muted">Loading operating profit…</p>
      </div>
    );
  }

  const { summary, overhead, issues } = dashboard;
  const currency = summary.currency;

  return (
    <div className="operating-profit">
      <FinanceNav />
      <PageHeader
        title="Overhead & Operating Profit"
        description="Job gross profit − known business overhead = known operating profit. Economic and cash views stay separate."
      />

      <div className="operating-profit__periods" role="tablist" aria-label="Period">
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
          <strong>{summary.completeness}</strong>
          <span className="page-muted"> — {summary.qualityNote}</span>
        </p>
        <p className="page-muted">
          Jobs included {summary.jobsIncluded} · Incomplete jobs {summary.incompleteJobs}.
          Transfers {formatMoney(summary.excludedTransferOutCents, currency)} and non-operating{' '}
          {formatMoney(summary.excludedNonOperatingOutCents, currency)} are excluded from operating
          totals.
        </p>
        <div className="operating-profit__links">
          <Link href={summary.drillDown.cashControl}>Cash Control</Link>
          <Link href={summary.drillDown.profitAnalytics}>Profit Analytics</Link>
          <Link href="/finance/owner-command">Financial Command</Link>
        </div>
      </Panel>

      <Panel title="Operating Profit">
        <MetricGrid>
          <StatCard
            label="Economic revenue"
            value={formatMoney(summary.economicRevenueCents, currency)}
          />
          <StatCard
            label="Direct economic costs"
            value={formatMoney(summary.directEconomicCostCents, currency)}
          />
          <StatCard
            label="Company gross profit"
            value={formatMoney(summary.companyGrossProfitCents, currency)}
          />
          <StatCard
            label="Gross margin"
            value={
              summary.grossMarginPct == null ? 'Unavailable' : `${summary.grossMarginPct}%`
            }
          />
          <StatCard
            label="Known overhead"
            value={formatMoney(summary.knownOverheadCents, currency)}
          />
          <StatCard
            label="Known operating profit"
            value={formatMoney(summary.knownOperatingProfitCents, currency)}
          />
          <StatCard
            label="Operating margin"
            value={
              summary.operatingMarginPct == null
                ? 'Unavailable'
                : `${summary.operatingMarginPct}%`
            }
          />
        </MetricGrid>
      </Panel>

      <Panel title="Cash View">
        <p className="page-muted">
          Cash movement is not economic profit. Labelled as known operating cash movement only.
        </p>
        <MetricGrid>
          <StatCard
            label="Customer cash collected"
            value={formatMoney(summary.customerCashCollectedCents, currency)}
          />
          <StatCard
            label="Direct cash out"
            value={formatMoney(summary.directCashOutCents, currency)}
          />
          <StatCard
            label="Overhead cash out"
            value={formatMoney(summary.overheadCashOutCents, currency)}
          />
          <StatCard
            label="Known operating cash movement"
            value={formatMoney(summary.knownOperatingCashMovementCents, currency)}
          />
        </MetricGrid>
      </Panel>

      <Panel title="Overhead Breakdown">
        <p className="page-muted">{overhead.note}</p>
        {overhead.knownOverheadMtdCents != null ? (
          <p className="page-muted">
            Known overhead MTD: {formatMoney(overhead.knownOverheadMtdCents, currency)} (period
            total — not a forecast).
          </p>
        ) : null}
        {overhead.categories.length === 0 ? (
          <p className="page-muted">No authorised overhead allocations in this period.</p>
        ) : (
          <ul className="jobs-list">
            {overhead.categories.map((cat) => (
              <li key={cat.category} className="jobs-list__item">
                <div>
                  <Link href={cat.href} className="jobs-link">
                    {cat.category}
                  </Link>
                  <span className="page-muted">
                    {' '}
                    — {cat.allocationCount} entries · {cat.transactionCount} tx · {cat.dataQuality}
                    {cat.percentOfKnownOverhead != null
                      ? ` · ${cat.percentOfKnownOverhead}% of overhead`
                      : ''}
                    {cat.missingReceiptCount > 0
                      ? ` · ${cat.missingReceiptCount} missing receipts`
                      : ''}
                  </span>
                  {cat.lines.length > 0 ? (
                    <ul className="operating-profit__lines">
                      {cat.lines.slice(0, 5).map((line) => (
                        <li key={line.allocationId}>
                          <Link href={line.href} className="jobs-link">
                            {line.transactionDate}
                          </Link>
                          <span className="page-muted">
                            {' '}
                            {line.merchantName ?? line.description ?? 'Allocation'} —{' '}
                            {formatMoney(line.amountCents, currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div>{formatMoney(cat.amountCents, currency)}</div>
              </li>
            ))}
          </ul>
        )}
        <div className="operating-profit__links">
          <Link href={summary.drillDown.bankControl}>Open bank control</Link>
        </div>
      </Panel>

      <Panel title="Needs Attention">
        {issues.length === 0 ? (
          <p className="page-muted">No open operating-profit attention items.</p>
        ) : (
          <ul className="jobs-list">
            {issues.map((issue) => (
              <li key={`${issue.kind}-${issue.label}`} className="jobs-list__item">
                <div>
                  <strong>{issue.kind.replace(/_/g, ' ')}</strong>
                  <span className="page-muted">
                    {' '}
                    — {issue.label}
                    {issue.count > 0 ? ` (${issue.count})` : ''}
                  </span>
                </div>
                <div>
                  {issue.amountCents != null ? formatMoney(issue.amountCents, currency) : '—'}
                  {' · '}
                  <Link href={issue.href} className="jobs-link">
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
