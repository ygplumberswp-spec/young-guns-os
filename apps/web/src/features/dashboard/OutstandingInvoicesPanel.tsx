import { Link } from 'wouter';
import type { ExecutiveOutstandingInvoices } from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';

type OutstandingInvoicesPanelProps = {
  data: ExecutiveOutstandingInvoices | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

function formatDueDate(iso: string | null): string {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function OutstandingInvoicesPanel({
  data,
  isLoading = false,
  error = null,
  onRetry,
}: OutstandingInvoicesPanelProps) {
  const { formatMoney } = useCompanyLocale();

  return (
    <Panel title="Outstanding invoices" description="Open AR from live finance records">
      {isLoading && !data ? (
        <DashboardSectionSkeleton rows={3} />
      ) : error && !data ? (
        <EmptyState
          title="Unable to load invoices"
          description={error}
          action={
            onRetry ? (
              <button type="button" className="exec-dashboard-retry" onClick={onRetry}>
                Retry
              </button>
            ) : undefined
          }
        />
      ) : !data || data.invoiceCount === 0 || data.outstandingCents <= 0 ? (
        <EmptyState
          title="No outstanding invoices"
          description="Open balances will appear here when invoices are sent and unpaid."
          action={
            <Link href="/finance/invoices">
              <Button size="sm" variant="secondary">
                View invoices
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="exec-outstanding">
          <div className="exec-outstanding__hero">
            <p className="exec-outstanding__amount">
              {formatMoney(data.outstandingCents, data.currency)}
            </p>
            <p className="exec-outstanding__count">
              {data.invoiceCount} open invoice{data.invoiceCount === 1 ? '' : 's'}
            </p>
          </div>

          <div className="exec-outstanding__stats">
            <div className="exec-outstanding__stat">
              <span>Oldest overdue</span>
              {data.oldestOverdue ? (
                <Link
                  href={`/finance/invoices/${data.oldestOverdue.id}`}
                  className="exec-outstanding__overdue-link"
                >
                  <strong>{data.oldestOverdue.invoiceNumber}</strong>
                  <span>
                    {data.oldestOverdue.customerName}
                    {' · '}
                    {formatDueDate(data.oldestOverdue.dueDate)}
                    {' · '}
                    {formatMoney(data.oldestOverdue.outstandingCents, data.currency)}
                  </span>
                </Link>
              ) : (
                <p className="page-muted exec-outstanding__none-overdue">None overdue</p>
              )}
            </div>
            <div className="exec-outstanding__stat">
              <span>Largest outstanding</span>
              {data.largestOutstanding ? (
                <Link
                  href={`/finance/invoices/${data.largestOutstanding.id}`}
                  className="exec-outstanding__overdue-link"
                >
                  <strong>{data.largestOutstanding.invoiceNumber}</strong>
                  <span>
                    {data.largestOutstanding.customerName}
                    {' · '}
                    {formatMoney(data.largestOutstanding.outstandingCents, data.currency)}
                  </span>
                </Link>
              ) : (
                <p className="page-muted exec-outstanding__none-overdue">
                  Largest balance unavailable
                </p>
              )}
            </div>
          </div>

          <Link href="/finance/invoices">
            <Button size="sm" variant="secondary">
              View invoices
            </Button>
          </Link>
        </div>
      )}
    </Panel>
  );
}
