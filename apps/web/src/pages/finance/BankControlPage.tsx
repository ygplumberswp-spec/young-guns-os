import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader } from '@titan/ui';
import type {
  BankTransactionControlQueue,
  FinanceReceiptRecordSummary,
  ReceiptReconciliationControlQueue,
} from '@titan/shared';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchBankTransactionControlQueue } from '../../lib/bank-transaction-control-api';
import { fetchReceiptReconciliationControlQueue } from '../../lib/finance-receipt-reconciliation-api';
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

function MissingReceiptsList({
  items,
}: {
  items: ReceiptReconciliationControlQueue['missingReceipts'];
}) {
  if (items.length === 0) {
    return (
      <Panel title="Missing Receipts">
        <p className="page-muted">No bank debits missing receipt evidence.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Missing Receipts">
      <ul className="jobs-list">
        {items.slice(0, 20).map((item) => (
          <li key={item.bankTransactionId} className="jobs-list__item">
            <div>
              <strong>{item.transactionDate}</strong>
              <span className="page-muted"> — {item.description ?? 'No description'}</span>
            </div>
            <div>
              {formatMoney(item.amountCents, 'ZAR')}
              {item.suggestedSupplierName && (
                <span className="page-muted"> · Suggested: {item.suggestedSupplierName}</span>
              )}
              <span className="page-muted"> · {item.flag}</span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ReceiptList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: FinanceReceiptRecordSummary[];
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
        {items.slice(0, 20).map((receipt) => (
          <li key={receipt.id} className="jobs-list__item">
            <div>
              <strong>{receipt.documentDate ?? receipt.createdAt.slice(0, 10)}</strong>
              <span className="page-muted">
                {' '}
                — {receipt.supplierName ?? 'Supplier unknown'}
                {receipt.receiptNumber ? ` · #${receipt.receiptNumber}` : ''}
              </span>
            </div>
            <div>
              {receipt.totalAmountCents != null
                ? formatMoney(receipt.totalAmountCents, receipt.currency)
                : 'Amount unknown'}
              <span className="page-muted">
                {' '}
                · {receipt.matchStatus} · {receipt.verificationStatus}
              </span>
              {receipt.duplicateFlag && (
                <span className="page-muted"> · {receipt.duplicateFlag}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function SupplierReconciliationList({
  items,
}: {
  items: ReceiptReconciliationControlQueue['supplierUnknown'];
}) {
  if (items.length === 0) {
    return (
      <Panel title="Supplier Reconciliation">
        <p className="page-muted">All recent debits have a confirmed supplier.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Supplier Reconciliation">
      <ul className="jobs-list">
        {items.slice(0, 20).map((item) => (
          <li key={item.bankTransactionId} className="jobs-list__item">
            <div>
              <strong>{item.transactionDate}</strong>
              <span className="page-muted"> — {item.description ?? 'No description'}</span>
            </div>
            <div>
              {formatMoney(item.amountCents, 'ZAR')}
              {item.suggestedSupplier && (
                <span className="page-muted">
                  {' '}
                  · Suggested: {item.suggestedSupplier.supplierName} ({item.suggestedSupplier.confidence})
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ReceiptMatchSuggestions({
  items,
}: {
  items: ReceiptReconciliationControlQueue['receiptMatchSuggestions'];
}) {
  if (items.length === 0) {
    return (
      <Panel title="Receipt Matches">
        <p className="page-muted">No probable receipt/transaction pairings pending approval.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Receipt Matches">
      <ul className="jobs-list">
        {items.slice(0, 15).map((item) => (
          <li key={item.receiptId} className="jobs-list__item">
            <div>
              Receipt {item.receiptId.slice(0, 8)}…
              {item.receiptTotalCents != null && (
                <span> — {formatMoney(item.receiptTotalCents, 'ZAR')}</span>
              )}
            </div>
            <div className="page-muted">
              {item.candidates.slice(0, 2).map((c) => (
                <div key={c.bankTransactionId}>
                  → {c.transactionDate} {formatMoney(c.amountCents, 'ZAR')} ({c.confidence}) —{' '}
                  {c.reasons.join(', ')}
                </div>
              ))}
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
  const [receiptQueue, setReceiptQueue] = useState<ReceiptReconciliationControlQueue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void Promise.all([
      fetchBankTransactionControlQueue(accessToken),
      fetchReceiptReconciliationControlQueue(accessToken),
    ])
      .then(([bank, receipts]) => {
        setQueue(bank);
        setReceiptQueue(receipts);
      })
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

  if (!queue || !receiptQueue) {
    return (
      <>
        <FinanceNav />
        <PageHeader title="Bank Control" description="Transaction allocation and receipt oversight." />
        <p className="page-muted">Loading…</p>
      </>
    );
  }

  const { summary } = queue;
  const receiptSummary = receiptQueue.summary;

  return (
    <>
      <FinanceNav />
      <PageHeader
        title="Bank Control"
        description="Allocate bank debits/credits, attach receipts, reconcile suppliers, and verify evidence."
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
            <dd>{receiptSummary.receiptsMissing}</dd>
          </div>
          <div>
            <dt>Unmatched receipts</dt>
            <dd>
              {receiptSummary.unmatchedReceiptsCount} (
              {formatMoney(receiptSummary.unmatchedReceiptValueCents, 'ZAR')})
            </dd>
          </div>
          <div>
            <dt>Verification required</dt>
            <dd>{receiptSummary.verificationRequiredCount}</dd>
          </div>
          <div>
            <dt>Supplier unknown</dt>
            <dd>{receiptSummary.supplierUnknown}</dd>
          </div>
          <div>
            <dt>Today reconciled</dt>
            <dd>{receiptSummary.transactionsReconciled}</dd>
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

      <MissingReceiptsList items={receiptQueue.missingReceipts} />
      <ReceiptMatchSuggestions items={receiptQueue.receiptMatchSuggestions} />
      <ReceiptList
        title="Unmatched Receipts"
        items={receiptQueue.unmatchedReceipts}
        emptyLabel="No receipts awaiting bank transaction match."
      />
      <SupplierReconciliationList items={receiptQueue.supplierUnknown} />
      <ReceiptList
        title="Verification Required"
        items={receiptQueue.verificationRequired}
        emptyLabel="No receipts need verification review."
      />

      <TransactionList
        title="Unallocated Debits"
        items={queue.unallocatedDebits}
        emptyLabel="No unallocated debits — import a statement or connect a bank feed (future)."
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
