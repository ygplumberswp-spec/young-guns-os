import { Link } from 'wouter';
import type {
  ExecutiveOutstandingInvoices,
  ExecutiveSectionStatus,
  ExecutiveXeroFinance,
} from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveFinanceCardHonesty, resolveSectionHonesty } from './dashboard-honesty';

type OutstandingInvoicesPanelProps = {
  data: ExecutiveOutstandingInvoices | null;
  xeroFinance?: ExecutiveXeroFinance | null;
  section?: ExecutiveSectionStatus | null;
  generatedAt?: string | null;
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

function formatSyncLabel(iso: string | null): string {
  if (!iso) return 'No successful sync yet';
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(deltaMs)) return 'Unknown';
  if (deltaMs < 45_000) return 'Just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function buildEmptyDescription(xero: ExecutiveXeroFinance | null | undefined): string {
  if (!xero?.connected) {
    return 'Open balances appear from TITAN finance records. Connect Xero and sync, or create invoices in Finance.';
  }
  if (xero.importStatus === 'running' || xero.importStatus === 'queued' || xero.importStatus === 'pending') {
    return xero.importMessage ?? 'Xero import is in progress. Outstanding balances will appear when sync finishes.';
  }
  if (xero.lastError) {
    return `Xero sync needs attention: ${xero.lastError}`;
  }
  if (!xero.lastSyncAt && xero.syncedInvoiceCount === 0) {
    return 'Xero is connected, but no invoices have been imported yet. Run Sync now from Integrations → Xero.';
  }
  return 'Open balances will appear here when invoices are sent and unpaid.';
}

export function OutstandingInvoicesPanel({
  data,
  xeroFinance = null,
  section = null,
  generatedAt = null,
  isLoading = false,
  error = null,
  onRetry,
}: OutstandingInvoicesPanelProps) {
  const { formatMoney } = useCompanyLocale();
  const hasOutstanding = Boolean(data && data.invoiceCount > 0 && data.outstandingCents > 0);
  const sectionHonesty = resolveSectionHonesty(section, error);
  const finance = resolveFinanceCardHonesty(xeroFinance, error);
  // The invoice read itself must be sound before any Xero completeness caveat is meaningful.
  const sourceDown = sectionHonesty.state === 'unavailable';
  const state = sourceDown
    ? 'unavailable'
    : sectionHonesty.state === 'partial' && finance.state === 'live'
      ? 'partial'
      : finance.state;
  const note = sourceDown
    ? sectionHonesty.note
    : [sectionHonesty.state === 'partial' ? sectionHonesty.note : null, finance.note]
        .filter(Boolean)
        .join(' · ') || null;

  return (
    <Panel title="Outstanding Invoices" description="Open AR from synced TITAN finance records">
      {isLoading && !data ? (
        <DashboardSectionSkeleton rows={3} />
      ) : sourceDown ? (
        <EmptyState
          title="Unable To Load Invoices"
          description={
            note ?? 'Open balances could not be read. This is not the same as a zero balance.'
          }
          action={
            onRetry ? (
              <button type="button" className="exec-dashboard-retry" onClick={onRetry}>
                Retry
              </button>
            ) : undefined
          }
        />
      ) : !hasOutstanding ? (
        <EmptyState
          title="No Outstanding Invoices"
          description={buildEmptyDescription(xeroFinance)}
          action={
            <Link href={xeroFinance?.connected ? '/integrations/xero' : '/finance/invoices'}>
              <Button size="sm" variant="secondary">
                {xeroFinance?.connected && !xeroFinance.lastSyncAt ? 'Open Xero sync' : 'View invoices'}
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="exec-outstanding">
          <div className="exec-outstanding__hero">
            <p className="exec-outstanding__amount">
              {formatMoney(data!.outstandingCents, data!.currency)}
            </p>
            <p className="exec-outstanding__count">
              {data!.invoiceCount} open invoice{data!.invoiceCount === 1 ? '' : 's'}
            </p>
          </div>

          <div className="exec-outstanding__stats">
            <div className="exec-outstanding__stat">
              <span>Oldest overdue</span>
              {data!.oldestOverdue ? (
                <Link
                  href={`/finance/invoices/${data!.oldestOverdue.id}`}
                  className="exec-outstanding__overdue-link"
                >
                  <strong>{data!.oldestOverdue.invoiceNumber}</strong>
                  <span>
                    {data!.oldestOverdue.customerName}
                    {' · '}
                    {formatDueDate(data!.oldestOverdue.dueDate)}
                    {' · '}
                    {formatMoney(data!.oldestOverdue.outstandingCents, data!.currency)}
                  </span>
                </Link>
              ) : (
                <p className="page-muted exec-outstanding__none-overdue">None overdue</p>
              )}
            </div>
            <div className="exec-outstanding__stat">
              <span>Largest outstanding</span>
              {data!.largestOutstanding ? (
                <Link
                  href={`/finance/invoices/${data!.largestOutstanding.id}`}
                  className="exec-outstanding__overdue-link"
                >
                  <strong>{data!.largestOutstanding.invoiceNumber}</strong>
                  <span>
                    {data!.largestOutstanding.customerName}
                    {' · '}
                    {formatMoney(data!.largestOutstanding.outstandingCents, data!.currency)}
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

      {xeroFinance ? (
        <p className="exec-outstanding__xero-meta" data-testid="xero-finance-meta">
          {xeroFinance.connected
            ? `Xero${xeroFinance.organisationName ? ` · ${xeroFinance.organisationName}` : ''} · Last sync attempt ${formatSyncLabel(xeroFinance.lastSyncAt)} · ${xeroFinance.syncedInvoiceCount} invoices / ${xeroFinance.syncedPaymentCount} payments / ${xeroFinance.syncedQuoteCount} quotes synced · Revenue ${((xeroFinance.revenueCents ?? 0) / 100).toLocaleString(undefined, { style: 'currency', currency: xeroFinance.currency })} · Quote pipeline ${xeroFinance.quotePipelineCount}`
            : 'Xero not connected — figures are TITAN finance records only'}
        </p>
      ) : null}

      <DashboardSourceMeta
        source={section?.source ?? 'TITAN invoices (all open balances)'}
        updatedAt={section?.updatedAt ?? generatedAt}
        state={state}
        href="/finance/invoices"
        linkLabel="Open finance"
        note={note}
      />
    </Panel>
  );
}
