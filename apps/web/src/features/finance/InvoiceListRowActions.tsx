import { useState } from 'react';
import { Link } from 'wouter';
import type { InvoiceSummary } from '@titan/shared';
import { buildPaymentRecordHref } from '@titan/shared';
import { MoreMenu, type MoreMenuItem } from '../../components/ux';
import { isInvoiceDraft } from '../finance/finance-filters';
import { InvoiceWriteApprovalModal } from './InvoiceWriteApprovalModal';

type InvoiceListRowActionsProps = {
  invoice: InvoiceSummary;
  canWrite: boolean;
  accessToken?: string;
  isOwner?: boolean;
  onActionComplete?: () => void;
};

function buildInvoiceMoreItems(
  invoice: InvoiceSummary,
  canWrite: boolean,
  onVoid?: () => void,
  onCredit?: () => void,
): MoreMenuItem[] {
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
  const voidEligible = ['sent', 'partial', 'overdue', 'paid'].includes(invoice.status);
  if (canWrite && !isDraft && !isCancelled && voidEligible) {
    destructive.push({
      id: 'void',
      label: 'Void',
      destructive: true,
      onSelect: onVoid,
    });
    destructive.push({
      id: 'credit',
      label: 'Create Credit Note',
      destructive: true,
      onSelect: onCredit,
    });
  }
  if (canWrite && isCancelled) {
    destructive.push({ id: 'archive', label: 'Archive', disabled: true, destructive: true });
  }

  return [...items, ...destructive];
}

/** Invoice list row actions — View, Edit (draft only), More menu. */
export function InvoiceListRowActions({
  invoice,
  canWrite,
  accessToken,
  isOwner = false,
  onActionComplete,
}: InvoiceListRowActionsProps) {
  const isDraft = isInvoiceDraft(invoice);
  const [modalOperation, setModalOperation] = useState<'invoice_void' | 'credit_note_create' | null>(
    null,
  );

  const moreItems = buildInvoiceMoreItems(
    invoice,
    canWrite,
    accessToken ? () => setModalOperation('invoice_void') : undefined,
    accessToken ? () => setModalOperation('credit_note_create') : undefined,
  );

  return (
    <>
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
      {accessToken && modalOperation ? (
        <InvoiceWriteApprovalModal
          open
          invoice={invoice}
          operation={modalOperation}
          accessToken={accessToken}
          isOwner={isOwner}
          onClose={() => setModalOperation(null)}
          onComplete={() => {
            setModalOperation(null);
            onActionComplete?.();
          }}
        />
      ) : null}
    </>
  );
}
