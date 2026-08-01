import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { PageLoadState, Panel } from '@titan/ui';
import { BOQ_STATUS_OPTIONS, type BoqDocumentSummary } from '@titan/shared';
import { fetchBoqDocuments } from '../../lib/boq-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { FinancePageHeader } from '../../features/finance/FinancePageHeader';
import {
  BOQ_LIST_FILTERS,
  boqApiStatus,
  boqMatchesFilter,
  isBoqDraft,
  type BoqListFilter,
} from '../../features/finance/finance-filters';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';
import { CompactFilterTabs, PageHeader, StatusBadge } from '../../components/ux';

function formatStatus(status: BoqDocumentSummary['status']): string {
  return BOQ_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function BoqListPage() {
  const { accessToken, user } = useAuth();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<BoqListFilter>('all');

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const { data: documents, error, isLoading } = useStaffCachedQuery({
    queryKey: `finance/boq:${q.trim()}:${filter}`,
    enabled: canView,
    fetcher: async () =>
      fetchBoqDocuments(accessToken!, {
        q: q.trim() || undefined,
        status: boqApiStatus(filter),
      }),
  });

  const visibleDocuments = useMemo(
    () => (documents ?? []).filter((document) => boqMatchesFilter(document, filter)),
    [documents, filter],
  );

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="BOQs" description="You do not have permission to view finance." />
      </div>
    );
  }

  return (
    <div className="finance-page">
      <FinancePageHeader canWrite={canWrite} />
      <FinanceNav />

      <Panel title="BOQs">
        <CompactFilterTabs<BoqListFilter>
          options={BOQ_LIST_FILTERS}
          value={filter}
          onChange={setFilter}
          ariaLabel="BOQ filters"
          maxVisible={4}
        />

        <div className="finance-toolbar">
          <input
            className="titan-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number or title…"
            aria-label="Search BOQs"
          />
        </div>

        <PageLoadState
          isLoading={isLoading}
          error={error}
          isEmpty={visibleDocuments.length === 0}
          emptyTitle={q || filter !== 'all' ? 'No matching BOQs' : 'No BOQs yet'}
          emptyDescription="Create a BOQ to capture tender line items before converting to a quote."
          loadingLabel="Loading BOQs…"
        >
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Title</th>
                  <th>Customer</th>
                  <th>Job</th>
                  <th>Lines</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visibleDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <Link href={`/finance/boq/${document.id}`} className="finance-link">
                        {document.boqNumber}
                      </Link>
                    </td>
                    <td>{document.title}</td>
                    <td>{document.customerName ?? '—'}</td>
                    <td>{document.jobTitle ?? '—'}</td>
                    <td>{document.lineCount}</td>
                    <td>
                      {formatStatus(document.status)}
                      {isBoqDraft(document) ? (
                        <StatusBadge label="Draft" tone="info" className="finance-draft-badge" />
                      ) : null}
                    </td>
                    <td>{new Date(document.updatedAt).toLocaleDateString()}</td>
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
