import { PageHeader } from '../../components/ux';
import { useEffect, useState } from 'react';
import { EmptyState, Panel } from '@titan/ui';
import type { PortalFinanceCentre } from '@titan/shared';
import { PortalApiClientError, fetchPortalFinance } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';
import { FinanceReportExportActions } from '../../features/reports/FinanceReportExportActions';

export function PortalFinancePage() {
  const { accessToken } = usePortalAuth();
  const [finance, setFinance] = useState<PortalFinanceCentre | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchPortalFinance(accessToken)
      .then(setFinance)
      .catch((err) =>
        setError(err instanceof PortalApiClientError ? err.message : 'Unable to load finance data'),
      );
  }, [accessToken]);

  return (
    <div className="portal-page">
      <PageHeader
        title="Invoices & Payments"
        description="Invoice history, balances, and payment records."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {finance ? (
        <>
          <Panel title="Account history report">
            <p className="page-muted">
              Download a client-safe PDF of your jobs, invoices, and service history for this
              account.
            </p>
            {accessToken ? (
              <FinanceReportExportActions
                accessToken={accessToken}
                kind="customer_property_history"
                channel="portal"
              />
            ) : null}
          </Panel>
          <Panel title="Outstanding Balance">
            <p className="tabular-nums">
              {(finance.outstandingBalanceCents / 100).toFixed(2)} {finance.currency}
            </p>
          </Panel>
          <Panel title="Pay An Invoice">
            <EmptyState
              className="titan-empty-state--compact"
              title="Online Payment Not Available"
              description="Secure customer checkout / payment links are not enabled in this workspace yet. Contact the office to arrange payment — no payment was attempted."
            />
          </Panel>
          <Panel title="Invoices">
            {finance.invoices.length === 0 ? (
              <EmptyState
                className="titan-empty-state--compact"
                title="No Invoices"
                description="Invoices for your account will appear here."
              />
            ) : (
              <ul className="portal-list">
                {finance.invoices.map((invoice) => (
                  <li key={invoice.id}>
                    <strong>{invoice.displayOfficialInvoiceNumber}</strong> — {invoice.status}
                    <span className="page-muted">
                      Online pay unavailable — contact the office to settle this invoice.
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Payments">
            {finance.payments.length === 0 ? (
              <EmptyState
                className="titan-empty-state--compact"
                title="No Payments Recorded"
                description="Payments recorded against your invoices will appear here."
              />
            ) : (
              <ul className="portal-list">
                {finance.payments.map((payment) => (
                  <li key={payment.id}>
                    <strong>{payment.invoiceNumber}</strong> —{' '}
                    <span className="tabular-nums">
                      {(payment.amountCents / 100).toFixed(2)} {finance.currency}
                    </span>
                    {/* payment.invoiceNumber is official InvoiceNumber from API (Row 87) */}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
