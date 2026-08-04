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
