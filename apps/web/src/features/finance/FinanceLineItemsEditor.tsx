import { Button } from '@titan/ui';
import { FINANCE_EDITOR_LINE_CATEGORY_OPTIONS, formatMoney } from '@titan/shared';
import type { FinanceEditorLine } from './finance-editor-utils';
import { calculateEditorLineTotals, newFinanceEditorLine } from './finance-editor-utils';

type FinanceLineItemsEditorProps = {
  lines: FinanceEditorLine[];
  onChange: (lines: FinanceEditorLine[]) => void;
  currency?: string;
  disabled?: boolean;
  showUnitCost?: boolean;
};

export function FinanceLineItemsEditor({
  lines,
  onChange,
  currency = 'ZAR',
  disabled,
  showUnitCost = true,
}: FinanceLineItemsEditorProps) {
  const totals = calculateEditorLineTotals(lines);

  function updateLine(key: string, patch: Partial<FinanceEditorLine>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function moveLine(key: string, direction: -1 | 1) {
    const index = lines.findIndex((line) => line.key === key);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= lines.length) return;
    const next = [...lines];
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    onChange(next);
  }

  return (
    <div className="finance-line-items">
      <div className="finance-line-items__header">
        <h3>Line items</h3>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => onChange([...lines, newFinanceEditorLine()])}>
          Add line
        </Button>
      </div>

      <div className="finance-table-wrap">
        <table className="finance-table finance-line-items__table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price (ex VAT)</th>
              {showUnitCost ? <th>Unit cost</th> : null}
              <th>VAT %</th>
              <th>Line total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const lineTotals = calculateEditorLineTotals([line]);
              return (
                <tr key={line.key}>
                  <td>
                    <select
                      className="titan-input"
                      value={line.category}
                      disabled={disabled}
                      onChange={(e) => updateLine(line.key, { category: e.target.value as FinanceEditorLine['category'] })}
                    >
                      {FINANCE_EDITOR_LINE_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </td>
                  <td><input className="titan-input" value={line.description} disabled={disabled} required onChange={(e) => updateLine(line.key, { description: e.target.value })} /></td>
                  <td><input className="titan-input finance-line-items__qty" value={line.quantity} disabled={disabled} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} /></td>
                  <td><input className="titan-input" value={line.unitPrice} disabled={disabled} onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })} /></td>
                  {showUnitCost ? <td><input className="titan-input" value={line.unitCost} disabled={disabled} onChange={(e) => updateLine(line.key, { unitCost: e.target.value })} /></td> : null}
                  <td><input className="titan-input finance-line-items__vat" value={(Number.parseInt(line.vatRateBps, 10) / 100).toString()} disabled={disabled} onChange={(e) => updateLine(line.key, { vatRateBps: String(Math.round(Number.parseFloat(e.target.value) * 100) || 1500) })} /></td>
                  <td>{formatMoney(lineTotals.totalCents, currency)}</td>
                  <td className="finance-line-items__actions">
                    <button type="button" disabled={disabled} onClick={() => moveLine(line.key, -1)} aria-label="Move up">↑</button>
                    <button type="button" disabled={disabled} onClick={() => moveLine(line.key, 1)} aria-label="Move down">↓</button>
                    <button type="button" disabled={disabled || lines.length === 1} onClick={() => onChange(lines.filter((item) => item.key !== line.key))} aria-label="Remove">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="finance-line-items__totals">
        <div><span>Subtotal</span><strong>{formatMoney(totals.subtotalCents, currency)}</strong></div>
        <div><span>VAT</span><strong>{formatMoney(totals.vatTotalCents, currency)}</strong></div>
        <div><span>Total</span><strong>{formatMoney(totals.totalCents, currency)}</strong></div>
      </div>
    </div>
  );
}
