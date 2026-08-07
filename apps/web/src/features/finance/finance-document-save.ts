/** Placeholder line persisted when Save Draft runs against blank/incomplete editor rows. */
export const DRAFT_PLACEHOLDER_LINE_DESCRIPTION = 'Draft — line items pending';

export function isDraftPlaceholderLineItem(line: {
  description: string;
  unitPriceCents: number;
}): boolean {
  return (
    line.description.trim() === DRAFT_PLACEHOLDER_LINE_DESCRIPTION && line.unitPriceCents === 0
  );
}

export function financeDocumentEditPath(kind: 'quote' | 'invoice', id: string): string {
  return kind === 'quote' ? `/finance/quotes/${id}/edit` : `/finance/invoices/${id}/edit`;
}

export type FinanceDocumentPersistMode = 'save' | 'save_draft';

/**
 * Save Draft always persists Draft.
 * Save preserves the document's current valid internal status (new unsent documents remain Draft).
 */
export function resolveFinanceDocumentPersistStatus(
  mode: FinanceDocumentPersistMode,
  currentStatus: string,
): string {
  if (mode === 'save_draft') return 'draft';
  return currentStatus?.trim() || 'draft';
}

export function financeDocumentSaveSuccessMessage(
  mode: FinanceDocumentPersistMode,
  kind: 'quote' | 'invoice',
  savedStatus: string,
): string {
  const label = kind === 'quote' ? 'Quote' : 'Invoice';
  if (mode === 'save_draft') return `${label} draft saved`;
  if (savedStatus === 'draft') return `${label} saved as draft`;
  return `${label} saved (${savedStatus})`;
}
