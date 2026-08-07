import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Panel, PageHeader } from '@titan/ui';
import type { JobLinkageControlQueue, JobLinkageQueueItem } from '@titan/shared';
import { formatMoney } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchJobLinkageControlQueue } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';

function LinkageRow({ row }: { row: JobLinkageQueueItem }) {
  const href =
    row.entityType === 'invoice'
      ? `/finance/invoices/${row.entityId}`
      : `/finance/quotes/${row.entityId}`;

  return (
    <li>
      <Link href={href} className="jobs-link">
        {row.documentNumber}
      </Link>
      <span>
        {row.entityType} · {formatMoney(row.amountCents, row.currency)}
        {row.reference ? ` · ${row.reference}` : ''}
        {row.topCandidate
          ? ` · suggested ${row.topCandidate.jobNumber ?? row.topCandidate.jobId} (${row.topCandidate.confidence})`
          : ''}
      </span>
      {row.topCandidate?.reasons?.length ? (
        <ul className="portal-list">
          {row.topCandidate.reasons.slice(0, 3).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function JobLinkageControlPage() {
  const { accessToken } = useAuth();
  const [queue, setQueue] = useState<JobLinkageControlQueue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchJobLinkageControlQueue(accessToken)
      .then(setQueue)
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : 'Unable to load linkage control queue'),
      );
  }, [accessToken]);

  if (error) {
    return (
      <>
        <PageHeader title="Job Linkage Control" description="Link financial documents to the correct job." />
        <p className="form-error">{error}</p>
      </>
    );
  }

  if (!queue) {
    return (
      <>
        <PageHeader title="Job Linkage Control" description="Link financial documents to the correct job." />
        <p className="page-muted">Loading…</p>
      </>
    );
  }

  const { summary } = queue;

  return (
    <>
      <PageHeader
        title="Job Linkage Control"
        description="Review orphan quotes and invoices. Link only with evidence — no bulk auto-linking."
      />

      <Panel title="Orphan Summary">
        <dl className="jobs-detail-list">
          <div>
            <dt>Unlinked invoices</dt>
            <dd>
              {summary.unlinkedInvoicesCount} · {formatMoney(summary.unlinkedInvoicesValueCents, 'ZAR')}
            </dd>
          </div>
          <div>
            <dt>Unlinked quotes</dt>
            <dd>
              {summary.unlinkedQuotesCount} · {formatMoney(summary.unlinkedQuotesValueCents, 'ZAR')}
            </dd>
          </div>
          <div>
            <dt>High-confidence suggestions</dt>
            <dd>{summary.highConfidenceSuggestions}</dd>
          </div>
          <div>
            <dt>Ambiguous records</dt>
            <dd>{summary.ambiguousRecords}</dd>
          </div>
          <div>
            <dt>Linkage conflicts</dt>
            <dd>{summary.linkageConflicts}</dd>
          </div>
          <div>
            <dt>Recently linked</dt>
            <dd>{summary.recentlyLinkedCount}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Suggested Matches">
        {queue.suggested.length === 0 ? (
          <p className="page-muted">No suggested matches on this page.</p>
        ) : (
          <ul className="portal-list">
            {queue.suggested.map((row) => (
              <LinkageRow key={`${row.entityType}:${row.entityId}`} row={row} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Ambiguous Matches">
        {queue.ambiguous.length === 0 ? (
          <p className="page-muted">No ambiguous matches on this page.</p>
        ) : (
          <ul className="portal-list">
            {queue.ambiguous.map((row) => (
              <LinkageRow key={`${row.entityType}:${row.entityId}`} row={row} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Unlinked Invoices">
        {queue.unlinkedInvoices.length === 0 ? (
          <p className="page-muted">No unlinked invoices on this page.</p>
        ) : (
          <ul className="portal-list">
            {queue.unlinkedInvoices.map((row) => (
              <LinkageRow key={row.entityId} row={row} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Unlinked Quotes">
        {queue.unlinkedQuotes.length === 0 ? (
          <p className="page-muted">No unlinked quotes on this page.</p>
        ) : (
          <ul className="portal-list">
            {queue.unlinkedQuotes.map((row) => (
              <LinkageRow key={row.entityId} row={row} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recently Linked">
        {queue.recentlyLinked.length === 0 ? (
          <p className="page-muted">No recent linkage activity.</p>
        ) : (
          <ul className="portal-list">
            {queue.recentlyLinked.map((row) => (
              <LinkageRow key={`${row.entityType}:${row.entityId}`} row={row} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
