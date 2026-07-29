import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import { formatMoney, QUOTE_STATUS_OPTIONS, type QuoteSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchQuotes } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';

function formatStatus(status: QuoteSummary['status']): string {
  return QUOTE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function QuoteListPage() {
  const { accessToken, user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function loadQuotes() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchQuotes(accessToken);
        if (!cancelled) setQuotes(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load quotes');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadQuotes();
    return () => { cancelled = true; };
  }, [accessToken, canView]);

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

      {isLoading ? <p className="page-muted">Loading quotes…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!isLoading && !error ? (
        quotes.length === 0 ? (
          <EmptyState
            title="No quotes yet"
            description="Create your first quote to start tracking sales opportunities."
            action={
              canWrite ? (
                <Link href="/finance/quotes/new">
                  <Button>New quote</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Panel title="Quotes">
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Title</th>
                    <th>Customer</th>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr key={quote.id}>
                      <td>{quote.quoteNumber}</td>
                      <td>{quote.title}</td>
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
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`finance-status finance-status--${quote.status}`}>
                          {formatStatus(quote.status)}
                        </span>
                      </td>
                      <td>{formatMoney(quote.amountCents, quote.currency)}</td>
                      <td>{new Date(quote.updatedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )
      ) : null}
    </div>
  );
}
