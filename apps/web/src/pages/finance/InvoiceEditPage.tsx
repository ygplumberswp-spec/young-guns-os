import { useEffect, useMemo, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { LoadingState } from '@titan/ui';
import type { CustomerSummary, InvoiceDetail } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import {
  fetchInvoice,
  updateInvoiceBillingRecipient,
} from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { useStaffMutationInvalidation } from '../../lib/cache-invalidation';
import { BillingRecipientPanel } from '../../features/finance/BillingRecipientPanel';
import {
  billingValuesFromRecord,
  resolveBillingCustomerName,
} from '../../features/finance/billing-recipient-state';
import { useFinanceDraftAuraContext } from '../../features/finance/useFinanceDraftAuraContext';
import { FinanceNav } from '../../features/finance/FinanceNav';
import { isInvoiceDraft } from '../../features/finance/finance-filters';
import { canManageFinance } from '../../features/finance/utils';
import { PageHeader } from '../../components/ux';

export function InvoiceEditPage() {
  const [, params] = useRoute('/finance/invoices/:id/edit');
  const invoiceId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const { invalidateInvoices } = useStaffMutationInvalidation();
  const [, navigate] = useLocation();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFinance(user.permissions) : false;
  const isDraft = invoice ? isInvoiceDraft(invoice) : false;

  useEffect(() => {
    if (user && !canWrite) navigate(`/finance/invoices/${invoiceId}`);
  }, [canWrite, invoiceId, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken || !invoiceId || !canWrite) {
        setIsLoading(false);
        return;
      }

      try {
        const [invoiceData, customerData] = await Promise.all([
          fetchInvoice(accessToken, invoiceId),
          fetchCustomers(accessToken),
        ]);
        if (cancelled) return;

        if (!isInvoiceDraft(invoiceData)) {
          navigate(`/finance/invoices/${invoiceId}`);
          return;
        }

        setInvoice(invoiceData);
        setCustomers(customerData);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load invoice');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canWrite, invoiceId, navigate]);

  const billingCustomerName = useMemo(() => {
    if (!invoice) return '';
    return resolveBillingCustomerName(
      invoice.billingCustomerId,
      customers,
      invoice.customerName,
    );
  }, [customers, invoice]);

  useFinanceDraftAuraContext(
    invoice
      ? {
          pageTitle: `Edit invoice ${invoice.displayInvoiceNumber}`,
          recordType: 'invoice',
          recordId: invoice.id,
          serviceCustomerId: invoice.customerId,
          serviceCustomerName: invoice.customerName,
          billingCustomerName,
          recipientName: invoice.recipientName,
          jobId: invoice.jobId,
        }
      : null,
  );

  if (isLoading) return <LoadingState label="Loading invoice…" />;

  if (error && !invoice) {
    return (
      <div className="finance-page">
        <PageHeader title="Edit invoice" description="Draft invoice billing recipient" />
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="finance-page">
      <PageHeader
        title={`Edit ${invoice.displayInvoiceNumber}`}
        description={invoice.title}
        backFallbackHref={`/finance/invoices/${invoice.id}`}
        auraRecordId={invoice.id}
        auraRecordType="invoice"
        auraCustomerId={invoice.customerId}
        auraJobId={invoice.jobId ?? undefined}
      />
      <FinanceNav />
      {error ? <p className="form-error">{error}</p> : null}

      <div className="finance-form">
        <BillingRecipientPanel
          recipientLabel="Invoice Recipient"
          serviceCustomerId={invoice.customerId}
          serviceCustomerName={invoice.customerName}
          customers={customers}
          values={billingValuesFromRecord(invoice)}
          editable={canWrite && isDraft}
          blockedMessage={
            !isDraft
              ? 'Issued invoices cannot change billing recipient here. Use void, credit note, or reissue.'
              : null
          }
          requireReason={false}
          onSave={async (input) => {
            if (!accessToken) return;
            const updated = await updateInvoiceBillingRecipient(accessToken, invoice.id, input);
            setInvoice((current) => (current ? { ...current, ...updated } : current));
            invalidateInvoices();
          }}
        />
      </div>
    </div>
  );
}
