import { Link } from 'wouter';
import type {
  ExecutiveOutstandingBucket,
  ExecutiveOutstandingInvoiceRow,
  ExecutiveOutstandingInvoices,
  ExecutiveSectionStatus,
  ExecutiveXeroFinance,
} from '@titan/shared';
import { Button, EmptyState, Panel } from '@titan/ui';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardDetailsDisclosure } from './DashboardDetailsDisclosure';
import { DashboardFreshnessFooter } from './DashboardFreshnessFooter';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import {
  buildOpenArEmptyDescription,
  OPEN_AR_IMPORT_PENDING_NOTE,
  openArOwnerCaption,
  resolveFinanceCardHonesty,
  resolveOpenArHistoryCoverage,
  resolveSectionHonesty,
} from './dashboard-honesty';

type OutstandingInvoicesPanelProps = {
  data: ExecutiveOutstandingInvoices | null;
  xeroFinance?: ExecutiveXeroFinance | null;
  section?: ExecutiveSectionStatus | null;
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  previewLimit?: number;
};

/** Beyond this many rows the list scrolls inside the card instead of stretching the page. */
const SCROLL_AFTER_ROWS = 8;

const BUCKET_LABELS: Record<ExecutiveOutstandingBucket, string> = {
  overdue: 'Overdue',
  due_today: 'Due today',
  due_soon: 'Due soon',
  current: 'Current',
  undated: 'No due date',
};

function countLabel(count: number): string {
  return `${count} invoice${count === 1 ? '' : 's'}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
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

function buildXeroFinanceDisclosureMeta(xero: ExecutiveXeroFinance, formatMoney: (cents: number, currency?: string) => string): string {
  if (!xero.connected) {
    return 'Xero not connected — figures are TITAN finance records only';
  }
  const revenue = formatMoney(xero.revenueCents ?? 0, xero.currency);
  return [
    `Xero${xero.organisationName ? ` · ${xero.organisationName}` : ''}`,
    `Last sync attempt ${formatSyncLabel(xero.lastSyncAt)}`,
    `${xero.syncedInvoiceCount} invoices / ${xero.syncedPaymentCount} payments / ${xero.syncedQuoteCount} quotes synced`,
    `Revenue ${revenue}`,
    `Quote pipeline ${xero.quotePipelineCount}`,
  ].join(' · ');
}

function InvoiceRow({
  invoice,
  currency,
  formatMoney,
  showDaysOverdue,
}: {
  invoice: ExecutiveOutstandingInvoiceRow;
  currency: string;
  formatMoney: (cents: number, currency?: string) => string;
  showDaysOverdue: boolean;
}) {
  return (
    <tr className={`exec-outstanding__row is-${invoice.bucket}`}>
      <td data-label="Invoice" className="exec-outstanding__col--number">
        <span className={`exec-outstanding__accent is-${invoice.bucket}`} aria-hidden="true" />
        <Link href={`/finance/invoices/${invoice.id}`} className="finance-link">
          {invoice.invoiceNumber}
        </Link>
      </td>
      <td data-label="Customer">
        {invoice.customerId ? (
          <Link href={`/crm/${invoice.customerId}`} className="exec-outstanding__customer">
            {invoice.customerName}
          </Link>
        ) : (
          invoice.customerName
        )}
      </td>
      <td data-label="Issued" className="exec-outstanding__col--detail">
        {formatDate(invoice.issuedAt)}
      </td>
      <td data-label="Due">{formatDate(invoice.dueDate)}</td>
      <td data-label="Total" className="exec-outstanding__col--detail exec-outstanding__col--num">
        {formatMoney(invoice.originalTotalCents, currency)}
      </td>
      <td data-label="Paid" className="exec-outstanding__col--detail exec-outstanding__col--num">
        {formatMoney(invoice.amountPaidCents, currency)}
      </td>
      <td data-label="Balance" className="exec-outstanding__col--num exec-outstanding__balance">
        {formatMoney(invoice.outstandingCents, currency)}
      </td>
      <td data-label="Status">
        <span className={`exec-outstanding__badge is-${invoice.bucket}`}>
          {BUCKET_LABELS[invoice.bucket]}
        </span>
      </td>
      {showDaysOverdue ? (
        <td data-label="Days overdue" className="exec-outstanding__col--num">
          {invoice.daysOverdue == null ? '—' : `${invoice.daysOverdue}d`}
        </td>
      ) : null}
      <td data-label="" className="exec-outstanding__col--action">
        <Link href={`/finance/invoices/${invoice.id}`} className="exec-outstanding__open">
          Open
        </Link>
      </td>
    </tr>
  );
}

export function OutstandingInvoicesPanel({
  data,
  xeroFinance = null,
  section = null,
  generatedAt = null,
  isLoading = false,
  error = null,
  onRetry,
  previewLimit,
}: OutstandingInvoicesPanelProps) {
  const { formatMoney } = useCompanyLocale();
  const hasOutstanding = Boolean(data && data.invoiceCount > 0 && data.outstandingCents > 0);
  const sectionHonesty = resolveSectionHonesty(section, error);
  const finance = resolveFinanceCardHonesty(xeroFinance, error);
  const sourceDown = sectionHonesty.state === 'unavailable';
  const state = sourceDown
    ? 'unavailable'
    : sectionHonesty.state === 'partial' && finance.state === 'live'
      ? 'partial'
      : finance.state;
  const disclosureNote = sourceDown
    ? sectionHonesty.note
    : [
        sectionHonesty.state === 'partial' ? sectionHonesty.note : null,
        finance.note,
        sectionHonesty.state === 'partial' && data && data.excludedInvoiceCount > 0
          ? `${data.excludedInvoiceCount} open invoice(s) are excluded from the total because their amounts are unusable.`
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || null;

  const history = resolveOpenArHistoryCoverage(xeroFinance, sourceDown ? 'unavailable' : null);
  const importPending =
    history.coverage !== 'complete' ||
    finance.state === 'partial' ||
    sectionHonesty.state === 'partial';
  const ownerCaption = openArOwnerCaption(history.coverage);
  const rowLimit = previewLimit ?? SCROLL_AFTER_ROWS;
  const rows = (data?.invoices ?? []).slice(0, rowLimit);
  const currency = data?.currency ?? 'ZAR';
  const listed = rows.length;
  const total = data?.invoiceCount ?? 0;
  const truncated = listed < total;
  const showDaysOverdue = (data?.overdueCount ?? 0) > 0;
  const dueSoonCount = (data?.dueTodayCount ?? 0) + (data?.dueSoonCount ?? 0);
  const currentCount = (data?.currentCount ?? 0) + (data?.undatedInvoiceCount ?? 0);

  return (
    <Panel
      title="Outstanding Invoices"
      description="All open invoices"
      headerAction={<Link href="/finance/invoices">View all invoices</Link>}
    >
      {isLoading && !data ? (
        <DashboardSectionSkeleton rows={4} />
      ) : sourceDown ? (
        <EmptyState
          title="Outstanding Invoices Unavailable"
          description={
            disclosureNote ??
            'Open balances could not be read. This is not the same as a zero balance.'
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
          className="titan-empty-state--compact exec-panel-empty--compact"
          title="No outstanding invoices"
          description={buildOpenArEmptyDescription(xeroFinance)}
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
          <dl className="exec-outstanding__summary">
            <div className="exec-outstanding__tile">
              <dt>Total outstanding</dt>
              <dd className="exec-outstanding__amount">
                {formatMoney(data!.outstandingCents, currency)}
              </dd>
              {ownerCaption ? <span>{ownerCaption}</span> : null}
            </div>
            <div className="exec-outstanding__tile is-overdue">
              <dt>Overdue</dt>
              <dd>{formatMoney(data!.overdueCents, currency)}</dd>
              <span>{countLabel(data!.overdueCount)}</span>
            </div>
            <div className="exec-outstanding__tile is-due_soon">
              <dt>Due soon</dt>
              <dd>{formatMoney(data!.dueSoonCents, currency)}</dd>
              <span>{countLabel(dueSoonCount)}</span>
            </div>
            <div className="exec-outstanding__tile is-current">
              <dt>Current</dt>
              <dd>{formatMoney(data!.currentCents, currency)}</dd>
              <span>{countLabel(currentCount)}</span>
            </div>
            <div className="exec-outstanding__tile">
              <dt>Total open</dt>
              <dd>{total}</dd>
              <span>{total === 1 ? 'invoice' : 'invoices'}</span>
            </div>
          </dl>

          {importPending ? (
            <p className="exec-outstanding__coverage">{OPEN_AR_IMPORT_PENDING_NOTE}</p>
          ) : null}

          <div
            className={`exec-outstanding__table-wrap${listed > SCROLL_AFTER_ROWS ? ' is-scrollable' : ''}`}
          >
            <table className="exec-outstanding__table">
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Customer</th>
                  <th scope="col" className="exec-outstanding__col--detail">
                    Issued
                  </th>
                  <th scope="col">Due</th>
                  <th scope="col" className="exec-outstanding__col--detail exec-outstanding__col--num">
                    Total
                  </th>
                  <th scope="col" className="exec-outstanding__col--detail exec-outstanding__col--num">
                    Paid
                  </th>
                  <th scope="col" className="exec-outstanding__col--num">
                    Balance
                  </th>
                  <th scope="col">Status</th>
                  {showDaysOverdue ? (
                    <th scope="col" className="exec-outstanding__col--num">
                      Days overdue
                    </th>
                  ) : null}
                  <th scope="col" className="exec-outstanding__col--action">
                    <span className="visually-hidden">Open invoice</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    currency={currency}
                    formatMoney={formatMoney}
                    showDaysOverdue={showDaysOverdue}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="exec-outstanding__footer">
            <p className="exec-outstanding__showing">
              {truncated
                ? `Showing 1 to ${listed} of ${total} outstanding invoices — the totals above cover all ${total}.`
                : `Showing 1 to ${total} of ${total} outstanding invoice${total === 1 ? '' : 's'}`}
            </p>
            <p className="exec-outstanding__legend">
              <span className="is-overdue">Overdue</span>
              <span className="is-due_soon">Due soon</span>
              <span className="is-current">Current</span>
            </p>
            {truncated ? (
              <Link href="/finance/invoices" className="exec-outstanding__view-all">
                View all outstanding invoices
              </Link>
            ) : null}
          </div>
        </div>
      )}

      <DashboardFreshnessFooter
        updatedAt={section?.updatedAt ?? generatedAt}
        state={importPending ? 'live' : state}
        financialImportPending={importPending}
      />
      <DashboardDetailsDisclosure>
        {xeroFinance ? (
          <p className="exec-source-meta" data-testid="xero-finance-meta">
            {buildXeroFinanceDisclosureMeta(xeroFinance, formatMoney)}
          </p>
        ) : null}
        <DashboardSourceMeta
          source={section?.source ?? 'TITAN invoices (all open balances)'}
          updatedAt={section?.updatedAt ?? generatedAt}
          state={state}
          href="/finance/invoices"
          linkLabel="Open finance"
          note={[disclosureNote, history.coverage !== 'complete' ? history.note : null]
            .filter(Boolean)
            .join(' · ') || null}
        />
      </DashboardDetailsDisclosure>
    </Panel>
  );
}
