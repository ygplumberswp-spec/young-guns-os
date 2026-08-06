import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { PageLoadState, Panel } from '@titan/ui';
import { formatMoney, QUOTE_STATUS_OPTIONS, type QuoteSummary } from '@titan/shared';
import { fetchQuotes } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { FinancePageHeader } from '../../features/finance/FinancePageHeader';
import { FinanceWorkspaceDraftRow } from '../../features/finance/FinanceWorkspaceDraftRow';
import {
  isQuoteDraft,
  QUOTE_LIST_FILTERS,
  quoteApiStatus,
  quoteMatchesFilter,
  visibleWorkspaceDrafts,
  type QuoteListFilter,
} from '../../features/finance/finance-filters';
import { useFinanceSectionDrafts } from '../../features/finance/useFinanceSectionDrafts';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';
import { CompactFilterTabs, PageHeader, StatusBadge } from '../../components/ux';

function formatStatus(status: QuoteSummary['status']): string {
  return QUOTE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function QuoteListPage() {
  const { accessToken, user } = useAuth();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<QuoteListFilter>('all');

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const includeArchivedDrafts = filter === 'archived';

  const { drafts: workspaceDrafts } = useFinanceSectionDrafts({
    accessToken,
    recordType: 'quote',
    enabled: canView && (filter === 'all' || filter === 'drafts' || includeArchivedDrafts),
    includeArchived: includeArchivedDrafts,
  });

  const {
    data: quotes,
    error,
    isLoading,
  } = useStaffCachedQuery({
    queryKey: `finance/quotes:${q.trim()}:${filter}`,
    enabled: canView,
    fetcher: async () =>
      fetchQuotes(accessToken!, {
        q: q.trim() || undefined,
        status: quoteApiStatus(filter),
      }),
  });

  const visibleQuotes = useMemo(() => {
    const rows = (quotes ?? []).filter((quote) => quoteMatchesFilter(quote, filter));
    return rows;
  }, [filter, quotes]);

  const visibleDrafts = useMemo(
    () =>
      visibleWorkspaceDrafts(workspaceDrafts, visibleQuotes, {
        filter,
        isDraftRecord: (record) => isQuoteDraft(record),
        includeArchived: includeArchivedDrafts,
      }),
    [filter, includeArchivedDrafts, visibleQuotes, workspaceDrafts],
  );

  const isEmpty = visibleQuotes.length === 0 && visibleDrafts.length === 0;

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="Quotes" description="You do not have permission to view finance." />
      </div>
    );
  }

  return (
    <div className="finance-page">
      <FinancePageHeader canWrite={canWrite} />
      <FinanceNav />

      <Panel title="Quotes">
        <CompactFilterTabs<QuoteListFilter>
          options={QUOTE_LIST_FILTERS}
          value={filter}
          onChange={setFilter}
          ariaLabel="Quote filters"
          maxVisible={4}
        />

        <div className="finance-toolbar">
          <input
            className="titan-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number or customer…"
            aria-label="Search Quotes"
          />
        </div>

        <PageLoadState
          isLoading={isLoading}
          error={error}
          isEmpty={isEmpty}
          emptyTitle={q || filter !== 'all' ? 'No matching quotes' : 'No quotes yet'}
          emptyDescription="Create your first quote to start tracking sales opportunities."
          loadingLabel="Loading quotes…"
        >
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Version</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visibleDrafts.map((draft) => (
                  <FinanceWorkspaceDraftRow
                    key={`draft-${draft.id}`}
                    draft={draft}
                    colSpan={7}
                    entityLabel="Quote"
                  />
                ))}
                {visibleQuotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <Link href={`/finance/quotes/${quote.id}`} className="finance-link">
                        {quote.displayQuoteNumber}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/crm/${quote.customerId}`} className="finance-link">
                        {quote.customerName}
                      </Link>
                    </td>
                    <td>
                      v{quote.versionNumber}
                      {quote.isImmutable ? ' 🔒' : ''}
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
                      {isQuoteDraft(quote) ? (
                        <StatusBadge label="Draft" tone="info" className="finance-draft-badge" />
                      ) : null}
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
