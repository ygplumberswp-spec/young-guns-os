import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader, StatCard } from '@titan/ui';
import type {
  OwnerFinancialCommandDashboard,
  OwnerFinancialCommandPeriod,
} from '@titan/shared';
import { canViewOwnerFinancialCommand, formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchOwnerFinancialCommandDashboard } from '../../lib/owner-financial-command-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';

const PERIODS: Array<{ id: OwnerFinancialCommandPeriod; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="owner-fin-command__metrics">{children}</div>;
}

export function OwnerFinancialCommandPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(
    () =>
      user
        ? canViewOwnerFinancialCommand({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  const [period, setPeriod] = useState<OwnerFinancialCommandPeriod>('month');
  const [dashboard, setDashboard] = useState<OwnerFinancialCommandDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !canView) return;
    let cancelled = false;
    setError(null);
    void fetchOwnerFinancialCommandDashboard(accessToken, period)
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : 'Unable to load Owner Financial Command Centre',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, period]);

  if (!canView) {
    return (
      <div className="owner-fin-command">
        <FinanceNav />
        <PageHeader
          title="Financial Command Centre"
          description="Owner financial heartbeat over TITAN cash, JPE, and receivables truth."
        />
        <p className="form-error">Financial Command Centre is not available for your role.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="owner-fin-command">
        <FinanceNav />
        <PageHeader
          title="Financial Command Centre"
          description="Owner financial heartbeat over TITAN cash, JPE, and receivables truth."
        />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="owner-fin-command">
        <FinanceNav />
        <PageHeader
          title="Financial Command Centre"
          description="Owner financial heartbeat over TITAN cash, JPE, and receivables truth."
        />
        <p className="page-muted">Loading financial command centre…</p>
      </div>
    );
  }

  const currency = dashboard.currency;

  return (
    <div className="owner-fin-command">
      <FinanceNav />
      <PageHeader
        title="Financial Command Centre"
        description="Where every financial number comes from existing CASH, JPE, invoice, and bank truth — with drill-down."
      />

      <div className="owner-fin-command__periods" role="tablist" aria-label="Period">
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

      <Panel title="Financial Truth">
        <p>
          <strong>{dashboard.financialTruth.completeness}</strong>
          {dashboard.financialTruth.reasons.length > 0 && (
            <span className="page-muted">
              {' '}
              — {dashboard.financialTruth.reasons.join('; ')}
            </span>
          )}
        </p>
        <p className="page-muted">
          Economic profit and cash profit are shown separately. No bank balance is invented.
        </p>
      </Panel>

      <Panel title="Financial Heartbeat">
        <MetricGrid>
          <StatCard
            label="Invoiced revenue"
            value={formatMoney(dashboard.heartbeat.invoicedRevenueCents, currency)}
          />
          <StatCard
            label="Customer cash collected"
            value={formatMoney(dashboard.heartbeat.customerCashCollectedCents, currency)}
          />
          <StatCard
            label="Known gross profit (economic)"
            value={
              dashboard.heartbeat.knownGrossProfitCents == null
                ? 'Unavailable'
                : formatMoney(dashboard.heartbeat.knownGrossProfitCents, currency)
            }
          />
          <StatCard
            label="Known gross margin"
            value={
              dashboard.heartbeat.knownGrossMarginPct == null
                ? 'Unavailable'
                : `${dashboard.heartbeat.knownGrossMarginPct}%`
            }
          />
          <StatCard
            label="Known realised cash profit"
            value={formatMoney(dashboard.heartbeat.knownRealisedCashProfitCents, currency)}
          />
          <StatCard
            label="Outstanding customer cash"
            value={formatMoney(dashboard.heartbeat.outstandingCustomerCashCents, currency)}
          />
        </MetricGrid>
        <div className="owner-fin-command__links">
          <Link href={dashboard.drillDown.payments}>Payments</Link>
          <Link href={dashboard.drillDown.invoices}>Invoices</Link>
          <Link href={dashboard.drillDown.cashControl}>Cash Control</Link>
        </div>
      </Panel>

      <Panel title="Cash Movement">
        <MetricGrid>
          <StatCard
            label="Money in"
            value={formatMoney(dashboard.cash.moneyInCents, currency)}
          />
          <StatCard
            label="Money out"
            value={formatMoney(dashboard.cash.moneyOutCents, currency)}
          />
          <StatCard
            label="Direct job cash out"
            value={formatMoney(dashboard.cash.directJobCashOutCents, currency)}
          />
          <StatCard
            label="Overhead cash out"
            value={formatMoney(dashboard.cash.overheadCashOutCents, currency)}
          />
          <StatCard
            label="Known Net Cash Movement"
            value={formatMoney(dashboard.cash.knownNetCashMovementCents, currency)}
          />
          <StatCard
            label="Unexplained debits"
            value={formatMoney(dashboard.cash.unexplainedDebitCents, currency)}
          />
          <StatCard
            label="Unexplained credits"
            value={formatMoney(dashboard.cash.unexplainedCreditCents, currency)}
          />
        </MetricGrid>
        <p className="page-muted">
          Cash truth: {dashboard.cash.completeness}
          {dashboard.cash.completenessReasons.length > 0
            ? ` — ${dashboard.cash.completenessReasons.map((r) => r.replace(/_/g, ' ')).join(', ')}`
            : ''}
        </p>
        <div className="owner-fin-command__links">
          <Link href={dashboard.drillDown.cashControl}>Open Every-Rand Control</Link>
          <Link href={dashboard.drillDown.bankControl}>Bank Control</Link>
        </div>
      </Panel>

      <Panel title="Receivables">
        <MetricGrid>
          <StatCard
            label="Total outstanding"
            value={formatMoney(dashboard.receivables.totalOutstandingCents, currency)}
          />
          <StatCard
            label="Overdue"
            value={`${dashboard.receivables.overdueCount} · ${formatMoney(dashboard.receivables.overdueCents, currency)}`}
          />
          <StatCard label="Due soon (7 days)" value={String(dashboard.receivables.dueSoonCount)} />
          <StatCard
            label="Unpaid / part-paid"
            value={String(dashboard.receivables.unpaidOrPartialCount)}
          />
        </MetricGrid>
        {dashboard.receivables.largest.length === 0 ? (
          <p className="page-muted">No outstanding customer invoices.</p>
        ) : (
          <ul className="jobs-list">
            {dashboard.receivables.largest.map((inv) => (
              <li key={inv.invoiceId} className="jobs-list__item">
                <div>
                  <Link href={inv.href} className="jobs-link">
                    {inv.invoiceNumber ?? inv.invoiceId}
                  </Link>
                  <span className="page-muted">
                    {' '}
                    — {inv.customerName ?? 'Customer'}
                    {inv.jobId ? (
                      <>
                        {' · '}
                        <Link href={`/jobs/${inv.jobId}`} className="jobs-link">
                          Job
                        </Link>
                      </>
                    ) : null}
                    {inv.isOverdue ? ' · overdue' : ''}
                  </span>
                </div>
                <div>{formatMoney(inv.balanceDueCents, currency)}</div>
              </li>
            ))}
          </ul>
        )}
        <div className="owner-fin-command__links">
          <Link href={dashboard.drillDown.overdueInvoices}>Overdue invoices</Link>
        </div>
      </Panel>

      <Panel title="Profitability">
        <MetricGrid>
          <StatCard
            label="Profitable jobs (known)"
            value={String(dashboard.profitability.profitableJobsCount)}
          />
          <StatCard
            label="Low margin"
            value={String(dashboard.profitability.lowMarginJobsCount)}
          />
          <StatCard label="Loss jobs" value={String(dashboard.profitability.lossJobsCount)} />
          <StatCard
            label="Financially incomplete"
            value={String(dashboard.profitability.financiallyIncompleteCount)}
          />
          <StatCard
            label="Needs financial review"
            value={String(dashboard.profitability.needingReviewCount)}
          />
        </MetricGrid>
        {dashboard.profitability.samples.length === 0 ? (
          <p className="page-muted">No profitability attention items in this period.</p>
        ) : (
          <ul className="jobs-list">
            {dashboard.profitability.samples.map((job) => (
              <li key={`${job.kind}-${job.jobId}`} className="jobs-list__item">
                <div>
                  <Link href={job.href} className="jobs-link">
                    {job.jobReference ?? job.title}
                  </Link>
                  <span className="page-muted">
                    {' '}
                    — {job.kind.replace(/_/g, ' ')}
                    {job.flagSummary ? ` · ${job.flagSummary}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="owner-fin-command__links">
          <Link href="/finance/operating-profit">Known Operating Profit</Link>
          <Link href="/finance/budget-control">Budget vs Actual</Link>
          <Link href="/finance/growth-planner">Growth Planner</Link>
          <Link href={dashboard.drillDown.jobCostControl}>Job cost control</Link>
        </div>
      </Panel>

      <Panel title="Needs Attention">
        <MetricGrid>
          <StatCard
            label="Unallocated bank spending"
            value={`${dashboard.costControl.unallocatedBankDebitsCount} · ${formatMoney(dashboard.costControl.unallocatedBankDebitsCents, currency)}`}
          />
          <StatCard
            label="Missing receipts"
            value={`${dashboard.costControl.missingReceiptsCount} · ${formatMoney(dashboard.costControl.missingReceiptsCents, currency)}`}
          />
          <StatCard
            label="Unpaid costs"
            value={`${dashboard.costControl.unpaidDirectCostsCount} · ${formatMoney(dashboard.costControl.unpaidDirectCostsCents, currency)}`}
          />
          <StatCard
            label="Partial allocations"
            value={`${dashboard.costControl.partialAllocationsCount} · ${formatMoney(dashboard.costControl.partialAllocationsCents, currency)}`}
          />
          <StatCard
            label="Missing labour"
            value={String(dashboard.costControl.missingLabourCount)}
          />
          <StatCard
            label="Missing materials"
            value={String(dashboard.costControl.missingMaterialCount)}
          />
          <StatCard
            label="Unknown suppliers"
            value={String(dashboard.costControl.unknownSuppliersCount)}
          />
        </MetricGrid>

        {dashboard.attention.length === 0 ? (
          <p className="page-muted">No open financial attention items.</p>
        ) : (
          <ul className="jobs-list">
            {dashboard.attention.map((item) => (
              <li key={`${item.kind}-${item.label}`} className="jobs-list__item">
                <div>
                  <strong>{item.priority.toUpperCase()}</strong>
                  <span className="page-muted">
                    {' '}
                    — {item.label}
                    {item.count != null ? ` (${item.count})` : ''}
                  </span>
                </div>
                <div>
                  {item.amountCents != null ? formatMoney(item.amountCents, currency) : '—'}
                  {' · '}
                  <Link href={item.href} className="jobs-link">
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent / Important">
        <h3 className="owner-fin-command__subhead">Largest outstanding invoices</h3>
        {dashboard.recentImportant.largestOutstandingInvoices.length === 0 ? (
          <p className="page-muted">None</p>
        ) : (
          <ul className="jobs-list">
            {dashboard.recentImportant.largestOutstandingInvoices.map((inv) => (
              <li key={inv.invoiceId} className="jobs-list__item">
                <Link href={inv.href} className="jobs-link">
                  {inv.invoiceNumber ?? inv.invoiceId}
                </Link>
                <span>{formatMoney(inv.balanceDueCents, currency)}</span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="owner-fin-command__subhead">Largest unexplained transactions</h3>
        {dashboard.recentImportant.largestUnexplainedTransactions.length === 0 ? (
          <p className="page-muted">None</p>
        ) : (
          <ul className="jobs-list">
            {dashboard.recentImportant.largestUnexplainedTransactions.map((tx) => (
              <li key={tx.id} className="jobs-list__item">
                <span>
                  {tx.label}{' '}
                  <span className="page-muted">({tx.direction})</span>
                </span>
                <span>
                  {formatMoney(tx.amountCents, currency)}{' '}
                  <Link href={tx.href} className="jobs-link">
                    Trace
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="owner-fin-command__subhead">Worst-margin jobs</h3>
        {dashboard.recentImportant.worstMarginJobs.length === 0 ? (
          <p className="page-muted">None</p>
        ) : (
          <ul className="jobs-list">
            {dashboard.recentImportant.worstMarginJobs.map((job) => (
              <li key={job.jobId} className="jobs-list__item">
                <Link href={job.href} className="jobs-link">
                  {job.jobReference ?? job.title}
                </Link>
                <span className="page-muted">{job.kind.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
