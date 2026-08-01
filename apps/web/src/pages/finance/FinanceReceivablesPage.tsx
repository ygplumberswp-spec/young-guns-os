import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { EmptyState, PageLoadState, Panel, StatCard } from '@titan/ui';
import { formatMoney, type InvoiceSummary } from '@titan/shared';
import { fetchFinanceStats, fetchInvoices } from '../../lib/finance-api';
import { fetchReceivablesIntelligence } from '../../lib/finance-intelligence-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance } from '../../features/finance/utils';
import { PageHeader, SummaryCardGrid } from '../../components/ux';

type DebtorRow = {
  customerId: string;
  customerName: string;
  totalInvoicedCents: number;
  totalPaidCents: number;
  outstandingCents: number;
  overdueCents: number;
  oldestDueDate: string | null;
  maxDaysOverdue: number;
  openInvoiceCount: number;
  lastPaymentAt: string | null;
};

function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const now = new Date();
  if (due >= now) return 0;
  return Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
}

function buildDebtorRows(invoices: InvoiceSummary[]): DebtorRow[] {
  const byCustomer = new Map<string, DebtorRow>();

  for (const invoice of invoices) {
    if (['paid', 'cancelled', 'draft'].includes(invoice.status)) continue;
    const outstanding = Math.max(0, invoice.outstandingCents);
    if (outstanding <= 0) continue;

    const entry =
      byCustomer.get(invoice.customerId) ??
      ({
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        totalInvoicedCents: 0,
        totalPaidCents: 0,
        outstandingCents: 0,
        overdueCents: 0,
        oldestDueDate: null,
        maxDaysOverdue: 0,
        openInvoiceCount: 0,
        lastPaymentAt: null,
      } satisfies DebtorRow);

    entry.totalInvoicedCents += invoice.amountCents;
    entry.totalPaidCents += invoice.amountPaidCents;
    entry.outstandingCents += outstanding;
    entry.openInvoiceCount += 1;

    const overdue = invoice.isOverdue ? outstanding : 0;
    entry.overdueCents += overdue;

    const invoiceDays = daysOverdue(invoice.dueDate);
    entry.maxDaysOverdue = Math.max(entry.maxDaysOverdue, invoiceDays);

    if (invoice.dueDate) {
      if (!entry.oldestDueDate || new Date(invoice.dueDate) < new Date(entry.oldestDueDate)) {
        entry.oldestDueDate = invoice.dueDate;
      }
    }

    byCustomer.set(invoice.customerId, entry);
  }

  return [...byCustomer.values()].sort((a, b) => b.overdueCents - a.overdueCents || b.outstandingCents - a.outstandingCents);
}

function sumDueWithinDays(invoices: InvoiceSummary[], days: number): number {
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return invoices.reduce((sum, invoice) => {
    if (['paid', 'cancelled', 'draft'].includes(invoice.status)) return sum;
    const outstanding = Math.max(0, invoice.outstandingCents);
    if (outstanding <= 0 || !invoice.dueDate) return sum;
    const due = new Date(invoice.dueDate);
    if (due <= cutoff) return sum + outstanding;
    return sum;
  }, 0);
}

function countPartialInvoices(invoices: InvoiceSummary[]): number {
  return invoices.filter(
    (invoice) =>
      !['paid', 'cancelled', 'draft'].includes(invoice.status) &&
      invoice.amountPaidCents > 0 &&
      invoice.outstandingCents > 0,
  ).length;
}

export function FinanceReceivablesPage() {
  const { accessToken, user } = useAuth();
  const [q, setQ] = useState('');
  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);

  const {
    data: bundle,
    error,
    isLoading,
  } = useStaffCachedQuery({
    queryKey: 'finance/receivables-workspace',
    enabled: canView,
    fetcher: async () => {
      const [stats, receivables, invoices] = await Promise.all([
        fetchFinanceStats(accessToken!),
        fetchReceivablesIntelligence(accessToken!),
        fetchInvoices(accessToken!, { outstandingOnly: true }),
      ]);
      return { stats, receivables, invoices };
    },
  });

  const debtorRows = useMemo(() => {
    const rows = buildDebtorRows(bundle?.invoices ?? []);
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.customerName.toLowerCase().includes(needle));
  }, [bundle?.invoices, q]);

  const due7Cents = useMemo(
    () => sumDueWithinDays(bundle?.invoices ?? [], 7),
    [bundle?.invoices],
  );
  const due30Cents = useMemo(
    () => sumDueWithinDays(bundle?.invoices ?? [], 30),
    [bundle?.invoices],
  );
  const partialCount = useMemo(
    () => countPartialInvoices(bundle?.invoices ?? []),
    [bundle?.invoices],
  );

  if (!canView) {
    return (
      <div className="finance-page owner-page-content">
        <PageHeader title="Receivables" description="You do not have permission to view receivables." />
      </div>
    );
  }

  const currency = bundle?.stats.currency ?? bundle?.receivables.currency ?? 'ZAR';
  const fmt = (cents: number) => formatMoney(cents, currency);

  return (
    <div className="finance-page owner-page-content">
      <FinanceNav />
      <PageHeader
        title="Receivables"
        description="Outstanding invoices, aging, and who owes us — sourced from synced Xero ACCREC data."
        breadcrumbs={[
          { label: 'Finance', href: '/finance/quotes' },
          { label: 'Receivables', href: '/finance/receivables' },
        ]}
      />

      <PageLoadState isLoading={isLoading && !bundle} error={error ?? null} loadingLabel="Loading receivables…">
        {bundle ? (
          <>
            <SummaryCardGrid columns={4} className="finance-receivables-summary">
              <StatCard
                label="Total outstanding"
                value={fmt(bundle.stats.outstandingCents)}
                hint={`${bundle.stats.invoiceCount} invoice(s) on file`}
              />
              <StatCard
                label="Total overdue"
                value={fmt(bundle.receivables.overdueAmountCents)}
                hint={`${bundle.receivables.overdueCount} overdue invoice(s)`}
              />
              <StatCard label="Due in 7 days" value={fmt(due7Cents)} hint="Outstanding with due date within 7 days" />
              <StatCard label="Due in 30 days" value={fmt(due30Cents)} hint="Outstanding with due date within 30 days" />
            </SummaryCardGrid>

            <SummaryCardGrid columns={4} className="finance-receivables-summary">
              <StatCard
                label="Partial invoices"
                value={String(partialCount)}
                hint="Deposit or progress payment received; balance still owing"
              />
              <StatCard
                label="Unallocated payments"
                value="—"
                hint="Not tracked separately — payments are linked to invoices"
              />
              <StatCard
                label="Promises to pay"
                value="—"
                hint="Promise-to-pay workflow — Phase 5"
              />
              <StatCard
                label="Collected this month"
                value="—"
                hint="Use Payments for cash received; invoiced vs collected kept separate"
              />
            </SummaryCardGrid>

            <Panel title="Aging" className="owner-page-content__section">
              <div className="finance-aging-grid">
                {bundle.receivables.ageingBuckets.map((bucket) => (
                  <div key={bucket.bucket} className="finance-aging-bucket">
                    <span className="finance-aging-bucket__label">{bucket.bucket}</span>
                    <strong className="finance-aging-bucket__amount">{fmt(bucket.amountCents)}</strong>
                    <span className="finance-aging-bucket__count">{bucket.count} invoice(s)</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Debtors" className="owner-page-content__section">
              <div className="finance-table-toolbar">
                <input
                  type="search"
                  className="finance-table-search"
                  placeholder="Search customer…"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  aria-label="Search debtors"
                />
                <Link href="/finance/invoices?filter=outstanding" className="finance-table-link">
                  View all outstanding invoices
                </Link>
              </div>

              {debtorRows.length === 0 ? (
                <EmptyState
                  title="No outstanding receivables"
                  description="When customers owe money, debtor balances appear here from synced invoice data."
                />
              ) : (
                <div className="finance-table-wrap">
                  <table className="finance-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Total invoiced</th>
                        <th>Total paid</th>
                        <th>Outstanding</th>
                        <th>Overdue</th>
                        <th>Oldest due</th>
                        <th>Days overdue</th>
                        <th>Open invoices</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debtorRows.map((row) => (
                        <tr key={row.customerId}>
                          <td>{row.customerName}</td>
                          <td>{fmt(row.totalInvoicedCents)}</td>
                          <td>{fmt(row.totalPaidCents)}</td>
                          <td>{fmt(row.outstandingCents)}</td>
                          <td>{row.overdueCents > 0 ? fmt(row.overdueCents) : '—'}</td>
                          <td>{row.oldestDueDate ? new Date(row.oldestDueDate).toLocaleDateString() : '—'}</td>
                          <td>{row.maxDaysOverdue > 0 ? row.maxDaysOverdue : '—'}</td>
                          <td>{row.openInvoiceCount}</td>
                          <td>
                            {row.overdueCents > 0 ? (
                              <span className="finance-status-badge finance-status-badge--overdue">Overdue</span>
                            ) : (
                              <span className="finance-status-badge finance-status-badge--current">Current</span>
                            )}
                          </td>
                          <td className="finance-table-actions">
                            <Link href={`/customers/${row.customerId}`}>View</Link>
                            <Link href="/finance/invoices">Invoices</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {bundle.receivables.collectionPriorities.length > 0 ? (
              <Panel title="Collection priorities" className="owner-page-content__section">
                <div className="finance-table-wrap">
                  <table className="finance-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Customer</th>
                        <th>Outstanding</th>
                        <th>Days overdue</th>
                        <th>Priority</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.receivables.collectionPriorities.map((item) => (
                        <tr key={item.invoiceId}>
                          <td>{item.invoiceNumber}</td>
                          <td>{item.customerName}</td>
                          <td>{fmt(item.outstandingCents)}</td>
                          <td>{item.daysOverdue ?? '—'}</td>
                          <td>{item.priority}</td>
                          <td className="finance-table-actions">
                            <Link href={`/finance/invoices/${item.invoiceId}`}>Open</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ) : null}

            <p className="finance-source-note">
              Source: Xero ACCREC via TITAN sync · Last loaded {new Date().toLocaleString()}
            </p>
          </>
        ) : null}
      </PageLoadState>
    </div>
  );
}
