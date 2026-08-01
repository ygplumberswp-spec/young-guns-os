type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

type StatusBadgeProps = {
  label: string;
  tone?: StatusBadgeTone;
};

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`ux-status-badge ux-status-badge--${tone}`}>{label}</span>;
}

export function invoiceSyncPending(invoice: {
  status: string;
  xeroInvoiceNumber: string | null;
}): boolean {
  if (invoice.status === 'cancelled' || invoice.status === 'draft') {
    return false;
  }
  return invoice.xeroInvoiceNumber == null;
}
