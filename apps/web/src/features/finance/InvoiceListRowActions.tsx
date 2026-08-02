import { Link } from 'wouter';
import type { InvoiceSummary } from '@titan/shared';
import { buildPaymentRecordHref } from '@titan/shared';
import { MoreMenu, type MoreMenuItem } from '../../components/ux';
import { isInvoiceDraft } from '../finance/finance-filters';

type InvoiceListRowActionsProps = {
  invoice: InvoiceSummary;
  canWrite: boolean;
};

function buildInvoiceMoreItems(invoice: InvoiceSummary, canWrite: boolean): MoreMenuItem[] {
  const items: MoreMenuItem[] = [];
  const isDraft = isInvoiceDraft(invoice);
  const isCancelled = invoice.status === 'cancelled';

  if (canWrite && isDraft && invoice.totalCents > 0) {
    items.push({ id: 'approve', label: 'Approve', disabled: true });
  }

  if (canWrite && !isDraft && !isCancelled && ['sent', 'partial', 'overdue'].includes(invoice.status)) {
    items.push({ id: 'send', label: 'Send / Resend', disabled: true });
  }

  items.push({
    id: 'customer',
    label: 'View Customer',
    href: `/crm/${invoice.customerId}`,
  });

  if (invoice.jobId) {
    items.push({
      id: 'job',
      label: 'View Job',
      href: `/jobs/${invoice.jobId}`,
    });
  }

  items.push({
    id: 'payments',
    label: 'View Payment History',
    href: buildPaymentRecordHref({ invoiceId: invoice.id, jobId: invoice.jobId }),
  });

  items.push({ id: 'pdf', label: 'Download PDF', disabled: true });

  if (canWrite && !isCancelled) {
    items.push({ id: 'duplicate', label: 'Duplicate as Draft', disabled: true });
  }

  const destructive: MoreMenuItem[] = [];
  if (canWrite && !isDraft && !isCancelled) {
    destructive.push({ id: 'void', label: 'Void', disabled: true, destructive: true });
    destructive.push({ id: 'credit', label: 'Create Credit Note', disabled: true, destructive: true });
  }
  if (canWrite && isCancelled) {
    destructive.push({ id: 'archive', label: 'Archive', disabled: true, destructive: true });
  }

  return [...items, ...destructive];
}

/** Invoice list row actions — View, Edit (draft only), More menu. */
export function InvoiceListRowActions({ invoice, canWrite }: InvoiceListRowActionsProps) {
  const isDraft = isInvoiceDraft(invoice);
  const moreItems = buildInvoiceMoreItems(invoice, canWrite);

  return (
    <div className="ux-row-actions ux-row-actions--desktop">
      <Link href={`/finance/invoices/${invoice.id}`} className="ux-row-actions__btn" aria-label="View invoice">
        View
      </Link>
      {canWrite && isDraft ? (
        <Link
          href={`/finance/invoices/${invoice.id}#edit`}
          className="ux-row-actions__btn"
          aria-label="Edit draft invoice"
        >
          Edit
        </Link>
      ) : null}
      <MoreMenu label="More" items={moreItems} align="end" />
    </div>
  );
}
