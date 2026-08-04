import { PageHeader } from '../../components/ux';
import { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, LoadingState, Panel } from '@titan/ui';
import type { InvoiceDetail } from '@titan/shared';
import { canEditInvoice, formatMoney, INVOICE_STAGE_OPTIONS, INVOICE_STATUS_OPTIONS, buildPaymentRecordHref } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchInvoice } from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { canAccessFinance, canManageFinance } from '../../features/finance/utils';

function formatStatus(status: InvoiceDetail['status']): string {
  return INVOICE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function formatStage(stage: InvoiceDetail['stage']): string {
  return INVOICE_STAGE_OPTIONS.find((option) => option.value === stage)?.label ?? stage;
}

export function InvoiceDetailPage() {
  const [, params] = useRoute('/finance/invoices/:id');
  const invoiceId = params?.id ?? '';
  const { accessToken, user } = useAuth();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canView = useMemo(() => (user ? canAccessFinance(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageFinance(user.permissions) : false), [user]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !invoiceId || !canView) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchInvoice(accessToken, invoiceId);
        if (!cancelled) setInvoice(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load invoice');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, invoiceId, canView]);

  if (!canView) {
    return (
      <div className="finance-page">
        <PageHeader title="Invoice" description="You do not have permission to view finance." />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <PageHeader title="Invoice" description="Invoice detail" />
        <LoadingState label="Loading Invoice…" />
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="finance-page">
        <PageHeader title="Invoice" description="Invoice detail" />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  return (
    <div className="finance-page">
      <PageHeader
        title={invoice.displayOfficialInvoiceNumber}
        description={invoice.customerName}
        actions={
          <div className="jobs-detail__actions">
            {canWrite && canEditInvoice(invoice) ? (
              <Link href={`/finance/invoices/${invoice.id}/edit`}>
                <Button variant="secondary">Edit Invoice</Button>
              </Link>
            ) : null}
            {canWrite ? (
              <Link href={buildPaymentRecordHref({ invoiceId: invoice.id, jobId: invoice.jobId })}>
                <Button>Record Payment</Button>
              </Link>
            ) : null}
          </div>
        }
      />
      <FinanceNav />

      {error ? <p className="form-error">{error}</p> : null}

      <div className="finance-detail">
        <Panel title="Summary">
          <dl className="finance-detail-list">
            <div>
              <dt>Official number</dt>
              <dd className="tabular-nums">{invoice.displayOfficialInvoiceNumber}</dd>
            </div>
            <div>
              <dt>Xero reference</dt>
              <dd>{invoice.xeroReference ?? '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`finance-status finance-status--${invoice.status}`}>
                  {formatStatus(invoice.status)}
                </span>
                {invoice.isOverdue ? <span className="finance-badge--overdue"> · Overdue</span> : null}
              </dd>
            </div>
            <div>
              <dt>Stage</dt>
              <dd>{formatStage(invoice.stage)}</dd>
            </div>
            <div>
              <dt>Customer</dt>
              <dd>
                <Link href={`/crm/${invoice.customerId}`} className="finance-link">
                  {invoice.customerName}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Job</dt>
              <dd>
                {invoice.jobId ? (
                  <Link href={`/jobs/${invoice.jobId}`} className="finance-link">
                    {invoice.jobTitle}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Quote</dt>
              <dd>
                {invoice.quoteId ? (
                  <Link href={`/finance/quotes/${invoice.quoteId}`} className="finance-link">
                    {invoice.quoteNumber}
                    {invoice.quoteVersionNumber ? ` (v${invoice.quoteVersionNumber})` : ''}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(invoice.subtotalCents, invoice.currency)}</dd>
            </div>
            <div>
              <dt>VAT</dt>
              <dd className="tabular-nums">{formatMoney(invoice.vatCents, invoice.currency)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(invoice.totalCents, invoice.currency)}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd className="tabular-nums">{formatMoney(invoice.amountPaidCents, invoice.currency)}</dd>
            </div>
            <div>
              <dt>Outstanding</dt>
              <dd className="tabular-nums">{formatMoney(invoice.outstandingCents, invoice.currency)}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}</dd>
            </div>
            <div>
              <dt>Payment terms</dt>
              <dd>{invoice.paymentTerms ?? '—'}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Line Items">
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>VAT</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((line) => (
                  <tr key={line.id}>
                    <td>{line.description}</td>
                    <td>{line.quantity}</td>
                    <td className="tabular-nums">{formatMoney(line.unitPriceCents, invoice.currency)}</td>
                    <td className="tabular-nums">{formatMoney(line.lineVatCents, invoice.currency)}</td>
                    <td className="tabular-nums">{formatMoney(line.lineTotalCents, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Payments">
          {invoice.payments.length === 0 ? (
            <p className="page-muted">No payments recorded against this invoice yet.</p>
          ) : (
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="tabular-nums">
                        <Link href={`/finance/payments/${payment.id}`} className="finance-link">
                          {formatMoney(payment.amountCents, payment.currency)}
                        </Link>
                      </td>
                      <td>{payment.method.replace(/_/g, ' ')}</td>
                      <td>{payment.reference ?? '—'}</td>
                      <td>{new Date(payment.paidAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canWrite ? (
            <div className="finance-panel-actions">
              <Link href={buildPaymentRecordHref({ invoiceId: invoice.id, jobId: invoice.jobId })}>
                <Button variant="secondary">Record Payment</Button>
              </Link>
            </div>
          ) : null}
        </Panel>

        {invoice.notes ? (
          <Panel title="Notes">
            <p className="page-muted">{invoice.notes}</p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
