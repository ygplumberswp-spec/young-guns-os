import { formatMoney } from '@titan/shared';
import type { FinanceDocumentPriceMode, FinanceDocumentVatMode, FinanceEditorLine } from './finance-editor-utils';
import { calculateEditorLineTotals } from './finance-editor-utils';

type FinanceLineItemsTotalsProps = {
  lines: FinanceEditorLine[];
  vatMode: FinanceDocumentVatMode;
  priceMode: FinanceDocumentPriceMode;
  currency?: string;
  className?: string;
};

export function FinanceLineItemsTotals({
  lines,
  vatMode,
  priceMode,
  currency = 'ZAR',
  className,
}: FinanceLineItemsTotalsProps) {
  const totals = calculateEditorLineTotals(lines, { priceMode, vatMode });
  const rootClass = ['finance-line-items__totals-panel', className].filter(Boolean).join(' ');

  return (
    <aside className={rootClass} aria-label="Document totals">
      <h3 className="finance-line-items__totals-heading">Document totals</h3>
      <div className="finance-line-items__totals-row">
        <span>Subtotal</span>
        <strong className="tabular-nums">{formatMoney(totals.subtotalCents, currency)}</strong>
      </div>
      <div className="finance-line-items__totals-row">
        <span>VAT ({vatMode === 'zero' ? '0' : '15'}%)</span>
        <strong className="tabular-nums">{formatMoney(totals.vatTotalCents, currency)}</strong>
      </div>
      <div className="finance-line-items__totals-row finance-line-items__totals-row--grand">
        <span>Total</span>
        <strong className="tabular-nums finance-amount">{formatMoney(totals.totalCents, currency)}</strong>
      </div>
    </aside>
  );
}
