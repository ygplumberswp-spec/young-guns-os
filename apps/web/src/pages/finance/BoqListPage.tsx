import { PageHeader } from '../../components/ux';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, PageLoadState, Panel } from '@titan/ui';
import { BOQ_STATUS_OPTIONS, type BoqDocumentSummary } from '@titan/shared';
import { fetchBoqDocuments } from '../../lib/boq-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';

function formatStatus(status: BoqDocumentSummary['status']): string {
  return BOQ_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function BoqListPage() {
  const { accessToken, user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  const { data: documents, error, isLoading } = useStaffCachedQuery({
    queryKey: `finance/boq:${q.trim()}:${status}`,
    enabled: canView,
    fetcher: async () =>
      fetchBoqDocuments(accessToken!, { q: q.trim() || undefined, status: status || undefined }),
  });

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="BOQs" description="You do not have permission to view finance." />
      </div>
    );
  }

  return (
    <div className="finance-page">
      <PageHeader
        title="BOQ workspace"
        description="Bill of quantities for tenders and estimate take-offs."
        actions={
          canWrite ? (
            <Link href="/finance/boq/new">
              <Button>New BOQ</Button>
            </Link>
          ) : undefined
        }
      />
      <FinanceNav />

      <Panel title="BOQ documents">
        <div className="finance-toolbar">
          <input
            className="titan-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number or title…"
            aria-label="Search BOQs"
          />
          <select
            className="titan-input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {BOQ_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <PageLoadState
          isLoading={isLoading}
          error={error}
          isEmpty={(documents?.length ?? 0) === 0}
          emptyTitle={q || status ? 'No matching BOQs' : 'No BOQs yet'}
          emptyDescription="Create a BOQ to capture tender line items before converting to a quote."
          emptyAction={
            canWrite ? (
              <Link href="/finance/boq/new">
                <Button>New BOQ</Button>
              </Link>
            ) : undefined
          }
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
                {(documents ?? []).map((document) => (
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
                    <td>{formatStatus(document.status)}</td>
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
