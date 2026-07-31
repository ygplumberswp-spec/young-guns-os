import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, PageHeader, PageLoadState, Panel } from '@titan/ui';
import { formatMoney, QUOTE_STATUS_OPTIONS, type QuoteSummary } from '@titan/shared';
import { fetchQuotes } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';

function formatStatus(status: QuoteSummary['status']): string {
  return QUOTE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function QuoteListPage() {
  const { accessToken, user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const {
    data: quotes,
    error,
    isLoading,
  } = useStaffCachedQuery({
    queryKey: `finance/quotes:${q.trim()}:${status}`,
    enabled: canView,
    fetcher: async () =>
      fetchQuotes(accessToken!, { q: q.trim() || undefined, status: status || undefined }),
  });

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="Quotes" description="You do not have permission to view finance." />
      </div>
    );
  }

  return (
    <div className="finance-page">
      <PageHeader
        title="Finance"
        description="Quotes, invoices, and payment records for your company."
        actions={
          canWrite ? (
            <Link href="/finance/quotes/new">
              <Button>New quote</Button>
            </Link>
          ) : undefined
        }
      />
      <FinanceNav />

      <Panel title="Quotes">
        <div className="finance-toolbar">
          <input
            className="titan-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number or title…"
            aria-label="Search quotes"
          />
          <select
            className="titan-input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {QUOTE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <PageLoadState
          isLoading={isLoading}
          error={error}
          isEmpty={(quotes?.length ?? 0) === 0}
          emptyTitle={q || status ? 'No matching quotes' : 'No quotes yet'}
          emptyDescription="Create your first quote to start tracking sales opportunities."
          emptyAction={
            canWrite ? (
              <Link href="/finance/quotes/new">
                <Button>New quote</Button>
              </Link>
            ) : undefined
          }
          loadingLabel="Loading quotes…"
        >
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Title</th>
                  <th>Version</th>
                  <th>Customer</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {(quotes ?? []).map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <Link href={`/finance/quotes/${quote.id}`} className="finance-link">
                        {quote.quoteNumber}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/finance/quotes/${quote.id}`} className="finance-link">
                        {quote.title}
                      </Link>
                    </td>
                    <td>
                      v{quote.versionNumber}
                      {quote.isImmutable ? ' 🔒' : ''}
                    </td>
                    <td>
                      <Link href={`/crm/${quote.customerId}`} className="finance-link">
                        {quote.customerName}
                      </Link>
                    </td>
                    <td>
                      {quote.jobId ? (
                        <Link href={`/jobs/${quote.jobId}`} className="finance-link">
                          {quote.jobTitle}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`finance-status finance-status--${quote.status}`}>
                        {formatStatus(quote.status)}
                      </span>
                    </td>
                    <td className="tabular-nums">
                      {formatMoney(quote.totalCents ?? quote.amountCents, quote.currency)}
                    </td>
                    <td>{new Date(quote.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageLoadState>
      </Panel>
    </div>
  );
}
