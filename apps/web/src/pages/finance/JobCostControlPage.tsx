import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader } from '@titan/ui';
import type { JobCostControlQueue } from '@titan/shared';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchJobCostControlQueue } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';

export function JobCostControlPage() {
  const { accessToken } = useAuth();
  const [queue, setQueue] = useState<JobCostControlQueue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchJobCostControlQueue(accessToken)
      .then(setQueue)
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : 'Unable to load cost control queue'),
      );
  }, [accessToken]);

  if (error) {
    return (
      <>
        <PageHeader title="Financial Control" description="Cost capture and missing-money oversight." />
        <p className="form-error">{error}</p>
      </>
    );
  }

  if (!queue) {
    return (
      <>
        <PageHeader title="Financial Control" description="Cost capture and missing-money oversight." />
        <p className="page-muted">Loading…</p>
      </>
    );
  }

  const { summary } = queue;

  return (
    <>
      <PageHeader
        title="Financial Control"
        description="Jobs and costs that need Owner attention before profit can be trusted."
      />

      <Panel title="Financial Attention">
        <dl className="jobs-detail-list">
          <div>
            <dt>Completed jobs needing review</dt>
            <dd>{summary.completedJobsNeedingReview}</dd>
          </div>
          <div>
            <dt>Missing labour</dt>
            <dd>{summary.missingLabourJobs}</dd>
          </div>
          <div>
            <dt>Missing cost evidence</dt>
            <dd>{summary.missingCostEvidence}</dd>
          </div>
          <div>
            <dt>Unallocated costs</dt>
            <dd>
              {formatMoney(summary.unallocatedCostsCents, 'ZAR')} ({summary.unallocatedCostsCount})
            </dd>
          </div>
          <div>
            <dt>Outstanding customer cash</dt>
            <dd>{formatMoney(summary.outstandingCustomerCashCents, 'ZAR')}</dd>
          </div>
          <div>
            <dt>Low-margin jobs</dt>
            <dd>{summary.lowMarginJobs}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Needs Attention">
        {queue.completedJobsNeedingReview.length === 0 ? (
          <p className="page-muted">No completed jobs currently need financial review.</p>
        ) : (
          <ul className="portal-list">
            {queue.completedJobsNeedingReview.slice(0, 20).map((row) => (
              <li key={row.jobId}>
                <Link href={`/jobs/${row.jobId}`} className="jobs-link">
                  {row.jobReference ?? row.title}
                </Link>
                <span>
                  {row.completenessStatus.replace(/_/g, ' ')}
                  {row.isStale ? ' · review outdated' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Unallocated Money">
        {queue.unallocatedCosts.length === 0 ? (
          <p className="page-muted">No unallocated costs in native TITAN sources.</p>
        ) : (
          <ul className="portal-list">
            {queue.unallocatedCosts.slice(0, 20).map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                <strong>{formatMoney(row.amountCents, 'ZAR')}</strong>
                <span>
                  {row.description}
                  {row.supplierName ? ` — ${row.supplierName}` : ''} · No job assigned
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Margin Problems">
        {queue.marginProblems.length === 0 ? (
          <p className="page-muted">No margin problems detected.</p>
        ) : (
          <ul className="portal-list">
            {queue.marginProblems.slice(0, 20).map((row) => (
              <li key={row.jobId}>
                <Link href={`/jobs/${row.jobId}`} className="jobs-link">
                  {row.jobReference ?? row.title}
                </Link>
                <span>{row.flags.map((f) => f.type.replace(/_/g, ' ')).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Outstanding Cash">
        {queue.paymentOutstanding.length === 0 ? (
          <p className="page-muted">No outstanding customer payments on reviewed jobs.</p>
        ) : (
          <ul className="portal-list">
            {queue.paymentOutstanding.slice(0, 20).map((row) => (
              <li key={row.jobId}>
                <Link href={`/jobs/${row.jobId}`} className="jobs-link">
                  {row.jobReference ?? row.title}
                </Link>
                <span>{formatMoney(row.amountCents, 'ZAR')} outstanding</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
