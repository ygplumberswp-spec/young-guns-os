import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader } from '@titan/ui';
import type { BankTransactionControlQueue } from '@titan/shared';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchBankTransactionControlQueue } from '../../lib/bank-transaction-control-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';

function TransactionList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: BankTransactionControlQueue['unallocatedDebits'];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <Panel title={title}>
        <p className="page-muted">{emptyLabel}</p>
      </Panel>
    );
  }

  return (
    <Panel title={title}>
      <ul className="jobs-list">
        {items.slice(0, 20).map((tx) => (
          <li key={tx.id} className="jobs-list__item">
            <div>
              <strong>{tx.transactionDate}</strong>
              <span className="page-muted"> — {tx.description ?? tx.reference ?? 'No description'}</span>
            </div>
            <div>
              {formatMoney(tx.amountCents, tx.currency)} ({tx.direction})
              {tx.unallocatedAmountCents > 0 && (
                <span className="page-muted">
                  {' '}
                  · {formatMoney(tx.unallocatedAmountCents, tx.currency)} unallocated
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function BankControlPage() {
  const { accessToken } = useAuth();
  const [queue, setQueue] = useState<BankTransactionControlQueue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchBankTransactionControlQueue(accessToken)
      .then(setQueue)
      .catch((err) =>
        setError(
          err instanceof ApiClientError ? err.message : 'Unable to load bank transaction control',
        ),
      );
  }, [accessToken]);

  if (error) {
    return (
      <>
        <FinanceNav />
        <PageHeader title="Bank Control" description="Transaction allocation and receipt oversight." />
        <p className="form-error">{error}</p>
      </>
    );
  }

  if (!queue) {
    return (
      <>
        <FinanceNav />
        <PageHeader title="Bank Control" description="Transaction allocation and receipt oversight." />
        <p className="page-muted">Loading…</p>
      </>
    );
  }

  const { summary } = queue;

  return (
    <>
      <FinanceNav />
      <PageHeader
        title="Bank Control"
        description="Allocate bank debits/credits to jobs, costs, and overhead without duplicating economic costs."
      />

      <Panel title="Needs Attention">
        <dl className="jobs-detail-list">
          <div>
            <dt>Unallocated debits</dt>
            <dd>
              {formatMoney(summary.unallocatedDebitsCents, 'ZAR')} ({summary.unallocatedDebitsCount})
            </dd>
          </div>
          <div>
            <dt>Missing receipts</dt>
            <dd>{summary.missingReceiptsCount}</dd>
          </div>
          <div>
            <dt>Credits needing review</dt>
            <dd>{summary.creditsNeedingReviewCount}</dd>
          </div>
          <div>
            <dt>Today money in</dt>
            <dd>{formatMoney(summary.moneyInTodayCents, 'ZAR')}</dd>
          </div>
          <div>
            <dt>Today money out</dt>
            <dd>{formatMoney(summary.moneyOutTodayCents, 'ZAR')}</dd>
          </div>
        </dl>
        <p className="page-muted">
          <Link href="/finance/bank-transactions/import">Import bank statement</Link>
        </p>
      </Panel>

      <TransactionList
        title="Unallocated Debits"
        items={queue.unallocatedDebits}
        emptyLabel="No unallocated debits — import a statement or connect a bank feed (future)."
      />
      <TransactionList
        title="Missing Receipts"
        items={queue.missingReceipts}
        emptyLabel="No missing receipts."
      />
      <TransactionList
        title="Suggested Matches"
        items={queue.suggestedMatches}
        emptyLabel="No suggested matches pending."
      />
      <TransactionList
        title="Partially Allocated"
        items={queue.partiallyAllocated}
        emptyLabel="No partially allocated transactions."
      />
      <TransactionList
        title="Credits Needing Review"
        items={queue.creditsNeedingReview}
        emptyLabel="No credits awaiting review."
      />
    </>
  );
}
