import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader } from '@titan/ui';
import type {
  CashControlIssuesResult,
  CashControlJobView,
  CashControlLedgerPage,
  CashControlSummary,
} from '@titan/shared';
import { canViewCashControl, formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchCashControlIssues,
  fetchCashControlJob,
  fetchCashControlLedger,
  fetchCashControlSummary,
} from '../../lib/cash-control-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';

function CompletenessBadge({ summary }: { summary: CashControlSummary }) {
  return (
    <div className="jobs-detail-list">
      <div>
        <dt>Cash truth completeness</dt>
        <dd>
          <strong>{summary.completeness}</strong>
          {summary.completenessReasons.length > 0 && (
            <span className="page-muted">
              {' '}
              — {summary.completenessReasons.map((r) => r.replace(/_/g, ' ')).join(', ')}
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>Bank coverage</dt>
        <dd>
          {summary.bankCoverage.incomplete
            ? 'Incomplete — Known Net Cash Movement only'
            : `${summary.bankCoverage.transactionCount} transactions across ${summary.bankCoverage.activeAccountCount} accounts`}
        </dd>
      </div>
    </div>
  );
}

function PeriodPanel({
  title,
  metrics,
}: {
  title: string;
  metrics: CashControlSummary['today'];
}) {
  return (
    <Panel title={title}>
      <dl className="jobs-detail-list">
        <div>
          <dt>Customer cash collected</dt>
          <dd>{formatMoney(metrics.moneyIn.customerCashCollectedCents, 'ZAR')}</dd>
        </div>
        <div>
          <dt>Other classified money in</dt>
          <dd>{formatMoney(metrics.moneyIn.otherClassifiedMoneyInCents, 'ZAR')}</dd>
        </div>
        <div>
          <dt>Direct job cash out</dt>
          <dd>{formatMoney(metrics.moneyOut.directJobCashOutCents, 'ZAR')}</dd>
        </div>
        <div>
          <dt>Overhead cash out</dt>
          <dd>{formatMoney(metrics.moneyOut.overheadCashOutCents, 'ZAR')}</dd>
        </div>
        <div>
          <dt>Other classified money out</dt>
          <dd>{formatMoney(metrics.moneyOut.otherClassifiedMoneyOutCents, 'ZAR')}</dd>
        </div>
        <div>
          <dt>Unexplained money</dt>
          <dd>{formatMoney(metrics.unexplainedMoneyCents, 'ZAR')}</dd>
        </div>
        <div>
          <dt>Known Net Cash Movement</dt>
          <dd>
            <strong>{formatMoney(metrics.knownNetCashMovementCents, 'ZAR')}</strong>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function IssueBucket({
  title,
  count,
  amountCents,
}: {
  title: string;
  count: number;
  amountCents: number;
}) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>
        {count} · {formatMoney(amountCents, 'ZAR')}
      </dd>
    </div>
  );
}

export function CashControlPage() {
  const { accessToken, user } = useAuth();
  const canView = useMemo(
    () =>
      user
        ? canViewCashControl({
            roleName: user.roleName,
            permissions: user.permissions,
          })
        : false,
    [user],
  );

  const [summary, setSummary] = useState<CashControlSummary | null>(null);
  const [issues, setIssues] = useState<CashControlIssuesResult | null>(null);
  const [ledger, setLedger] = useState<CashControlLedgerPage | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobView, setJobView] = useState<CashControlJobView | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !canView) return;
    let cancelled = false;
    void Promise.all([
      fetchCashControlSummary(accessToken),
      fetchCashControlIssues(accessToken),
    ])
      .then(([summaryData, issuesData]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setIssues(issuesData);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : 'Unable to load cash control');
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  useEffect(() => {
    if (!accessToken || !canView) return;
    let cancelled = false;
    void fetchCashControlLedger(accessToken, { page, pageSize: 25, q: query || undefined })
      .then((data) => {
        if (!cancelled) setLedger(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load cash ledger');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, page, query]);

  useEffect(() => {
    if (!accessToken || !canView || !selectedJobId) {
      setJobView(null);
      return;
    }
    let cancelled = false;
    setJobError(null);
    void fetchCashControlJob(accessToken, selectedJobId)
      .then((data) => {
        if (!cancelled) setJobView(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setJobView(null);
          setJobError(err instanceof ApiClientError ? err.message : 'Unable to load job cash view');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, selectedJobId]);

  if (!canView) {
    return (
      <>
        <FinanceNav />
        <PageHeader
          title="Every-Rand Control"
          description="Owner cash-control layer — where every rand came from and went."
        />
        <p className="form-error">Cash control is not available for your role.</p>
      </>
    );
  }

  if (error) {
    return (
      <>
        <FinanceNav />
        <PageHeader
          title="Every-Rand Control"
          description="Owner cash-control layer — where every rand came from and went."
        />
        <p className="form-error">{error}</p>
      </>
    );
  }

  if (!summary || !issues || !ledger) {
    return (
      <>
        <FinanceNav />
        <PageHeader
          title="Every-Rand Control"
          description="Owner cash-control layer — where every rand came from and went."
        />
        <p className="page-muted">Loading cash control…</p>
      </>
    );
  }

  return (
    <>
      <FinanceNav />
      <PageHeader
        title="Every-Rand Control"
        description="Where every rand came from and where every rand went — using TITAN bank, payment, and JPE truth."
      />

      <Panel title="Cash Truth Status">
        <CompletenessBadge summary={summary} />
        <dl className="jobs-detail-list" style={{ marginTop: '1rem' }}>
          <div>
            <dt>Known realised cash profit (MTD)</dt>
            <dd>{formatMoney(summary.knownRealisedCashProfitCents, 'ZAR')}</dd>
          </div>
          <div>
            <dt>Economic vs cash</dt>
            <dd className="page-muted">
              Economic gross profit stays on each job (JPE). This page reports cash movement and
              known realised cash profit separately.
            </dd>
          </div>
        </dl>
      </Panel>

      <PeriodPanel title="Today" metrics={summary.today} />
      <PeriodPanel title="This Month" metrics={summary.monthToDate} />

      <Panel title="Needs Attention">
        <dl className="jobs-detail-list">
          <IssueBucket
            title="Unexplained debits"
            count={issues.totals.unexplainedDebits.count}
            amountCents={issues.totals.unexplainedDebits.amountCents}
          />
          <IssueBucket
            title="Unexplained credits"
            count={issues.totals.unexplainedCredits.count}
            amountCents={issues.totals.unexplainedCredits.amountCents}
          />
          <IssueBucket
            title="Partial allocations"
            count={issues.totals.partialAllocations.count}
            amountCents={issues.totals.partialAllocations.amountCents}
          />
          <IssueBucket
            title="Missing receipts"
            count={issues.totals.missingReceipts.count}
            amountCents={issues.totals.missingReceipts.amountCents}
          />
          <IssueBucket
            title="Unknown suppliers"
            count={issues.totals.unknownSuppliers.count}
            amountCents={issues.totals.unknownSuppliers.amountCents}
          />
          <IssueBucket
            title="Unpaid job costs"
            count={issues.totals.unpaidJobCosts.count}
            amountCents={issues.totals.unpaidJobCosts.amountCents}
          />
          <IssueBucket
            title="Outstanding customer invoices"
            count={issues.totals.outstandingCustomerInvoices.count}
            amountCents={issues.totals.outstandingCustomerInvoices.amountCents}
          />
        </dl>

        {issues.issues.length === 0 ? (
          <p className="page-muted">No open cash-control issues.</p>
        ) : (
          <ul className="jobs-list" style={{ marginTop: '1rem' }}>
            {issues.issues.slice(0, 30).map((issue) => (
              <li key={`${issue.kind}-${issue.sourceId}`} className="jobs-list__item">
                <div>
                  <strong>{issue.kind.replace(/_/g, ' ')}</strong>
                  <span className="page-muted"> — {issue.label}</span>
                  {issue.jobId && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="jobs-link"
                        onClick={() => setSelectedJobId(issue.jobId)}
                      >
                        Job drill-down
                      </button>
                      {' · '}
                      <Link href={`/jobs/${issue.jobId}`} className="jobs-link">
                        Open job
                      </Link>
                    </>
                  )}
                </div>
                <div>
                  {formatMoney(issue.amountCents, issue.currency)}
                  {issue.transactionDate && (
                    <span className="page-muted"> · {issue.transactionDate}</span>
                  )}
                  <span className="page-muted"> · {issue.source}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {selectedJobId && (
        <Panel title={`Job cash drill-down · ${selectedJobId}`}>
          {jobError && <p className="form-error">{jobError}</p>}
          {!jobError && !jobView && <p className="page-muted">Loading job cash view…</p>}
          {jobView && (
            <dl className="jobs-detail-list">
              <div>
                <dt>Invoiced economic revenue</dt>
                <dd>{formatMoney(jobView.invoicedEconomicRevenueCents, jobView.currency)}</dd>
              </div>
              <div>
                <dt>Economic direct costs</dt>
                <dd>{formatMoney(jobView.economicDirectCostsCents, jobView.currency)}</dd>
              </div>
              <div>
                <dt>Gross profit (economic)</dt>
                <dd>{formatMoney(jobView.grossProfitCents, jobView.currency)}</dd>
              </div>
              <div>
                <dt>Cash collected</dt>
                <dd>{formatMoney(jobView.cashCollectedCents, jobView.currency)}</dd>
              </div>
              <div>
                <dt>Cash direct costs paid</dt>
                <dd>{formatMoney(jobView.cashDirectCostsPaidCents, jobView.currency)}</dd>
              </div>
              <div>
                <dt>Known realised cash profit</dt>
                <dd>{formatMoney(jobView.knownRealisedCashProfitCents, jobView.currency)}</dd>
              </div>
              <div>
                <dt>Unpaid direct costs</dt>
                <dd>{formatMoney(jobView.unpaidDirectCostsCents, jobView.currency)}</dd>
              </div>
              <div>
                <dt>Customer balance outstanding</dt>
                <dd>{formatMoney(jobView.customerBalanceOutstandingCents, jobView.currency)}</dd>
              </div>
              <div>
                <dt>Completeness / confidence</dt>
                <dd className="page-muted">
                  {jobView.completeness}
                  {jobView.confidence ? ` · ${jobView.confidence.status}` : ''}
                </dd>
              </div>
              <div>
                <dt>Sources</dt>
                <dd className="page-muted">{jobView.sourceTrace.join(', ')}</dd>
              </div>
            </dl>
          )}
          {jobView && jobView.directCostSettlements.length > 0 && (
            <ul className="jobs-list" style={{ marginTop: '1rem' }}>
              {jobView.directCostSettlements.map((cost) => (
                <li key={cost.directCostId} className="jobs-list__item">
                  <div>
                    Economic {formatMoney(cost.economicCostCents, jobView.currency)}
                    <span className="page-muted">
                      {' '}
                      · paid {formatMoney(cost.amountPaidCents, jobView.currency)} · unpaid{' '}
                      {formatMoney(cost.unpaidCents, jobView.currency)}
                      {cost.supplierName ? ` · ${cost.supplierName}` : ''}
                    </span>
                  </div>
                  <div className="page-muted">
                    receipt:{cost.receiptStatus} · bank links:{cost.linkedBankAllocationIds.length}{' '}
                    ({formatMoney(cost.linkedBankAllocationCents, jobView.currency)})
                  </div>
                </li>
              ))}
            </ul>
          )}
          {jobView && jobView.bankAllocations.length > 0 && (
            <ul className="jobs-list" style={{ marginTop: '1rem' }}>
              {jobView.bankAllocations.map((alloc) => (
                <li key={alloc.allocationId} className="jobs-list__item">
                  <div>
                    <strong>{alloc.transactionDate}</strong>
                    <span className="page-muted">
                      {' '}
                      — {alloc.description ?? alloc.transactionId}
                    </span>
                  </div>
                  <div>
                    {formatMoney(alloc.amountCents, jobView.currency)}
                    <span className="page-muted">
                      {' '}
                      · {alloc.allocationType.replace(/_/g, ' ')} · source:bank_allocation
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: '0.75rem' }}>
            <Link href={`/jobs/${selectedJobId}`} className="jobs-link">
              View job
            </Link>
            {' · '}
            <Link href="/finance/bank-control" className="jobs-link">
              Bank allocation queue
            </Link>
            {' · '}
            <button type="button" onClick={() => setSelectedJobId(null)}>
              Close drill-down
            </button>
          </div>
        </Panel>
      )}

      <Panel title="Every-Rand Ledger">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search description, reference, supplier, job…"
            value={query}
            onChange={(e) => {
              setPage(1);
              setQuery(e.target.value);
            }}
            aria-label="Search cash ledger"
          />
          <span className="page-muted">
            Page {ledger.page} · {ledger.total} rows
          </span>
        </div>

        {ledger.rows.length === 0 ? (
          <p className="page-muted">
            No bank ledger rows yet. Import a statement or classify transactions in Bank Control.
          </p>
        ) : (
          <ul className="jobs-list">
            {ledger.rows.map((row) => (
              <li key={row.id} className="jobs-list__item">
                <div>
                  <strong>{row.transactionDate}</strong>
                  <span className="page-muted">
                    {' '}
                    — {row.description ?? row.reference ?? 'No description'}
                  </span>
                  {row.jobId && (
                    <span className="page-muted">
                      {' '}
                      ·{' '}
                      <Link href={`/jobs/${row.jobId}`} className="jobs-link">
                        Job
                      </Link>
                    </span>
                  )}
                </div>
                <div>
                  {row.direction === 'debit' ? '−' : '+'}
                  {formatMoney(row.amountCents, row.currency)}
                  <span className="page-muted">
                    {' '}
                    · {row.classification.replace(/_/g, ' ')} · {row.controlState.replace(/_/g, ' ')}
                    {row.unallocatedAmountCents > 0
                      ? ` · ${formatMoney(row.unallocatedAmountCents, row.currency)} unallocated`
                      : ''}
                    {' · '}
                    {row.receiptStatus.replace(/_/g, ' ')} · source:{row.source}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!ledger.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
          <Link href="/finance/bank-control" className="jobs-link">
            Open Bank Control
          </Link>
        </div>
      </Panel>
    </>
  );
}
)
