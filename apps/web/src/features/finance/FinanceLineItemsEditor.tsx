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

type DocumentVatMode = 'standard' | 'zero';

function resolveDocumentVatMode(lines: FinanceEditorLine[]): DocumentVatMode | 'mixed' {
  const rates = new Set(lines.map((line) => (Number.parseInt(line.vatRateBps, 10) || 0) === 0 ? 'zero' : 'standard'));
  if (rates.size === 1) return rates.values().next().value as DocumentVatMode;
  return 'mixed';
}

export function FinanceLineItemsEditor({
  lines,
  onChange,
  currency = 'ZAR',
  disabled,
  showUnitCost = true,
}: FinanceLineItemsEditorProps) {
  const totals = calculateEditorLineTotals(lines);
  const vatMode = resolveDocumentVatMode(lines);

  function updateLine(key: string, patch: Partial<FinanceEditorLine>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function setDocumentVatMode(mode: DocumentVatMode) {
    const vatRateBps = mode === 'zero' ? '0' : '1500';
    onChange(lines.map((line) => ({ ...line, vatRateBps })));
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
    <div className="finance-line-items finance-line-items--editor">
      <div className="finance-line-items__toolbar">
        <div
          className="finance-vat-selector"
          role="group"
          aria-label="Document VAT treatment"
        >
          <span className="finance-vat-selector__label">VAT treatment</span>
          <div className="finance-vat-selector__options">
            <button
              type="button"
              className={`finance-vat-selector__option${vatMode === 'standard' ? ' finance-vat-selector__option--active' : ''}`}
              disabled={disabled}
              aria-pressed={vatMode === 'standard'}
              onClick={() => setDocumentVatMode('standard')}
            >
              VAT 15%
            </button>
            <button
              type="button"
              className={`finance-vat-selector__option${vatMode === 'zero' ? ' finance-vat-selector__option--active' : ''}`}
              disabled={disabled}
              aria-pressed={vatMode === 'zero'}
              onClick={() => setDocumentVatMode('zero')}
            >
              No VAT
            </button>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => onChange([...lines, newFinanceEditorLine()])}
        >
          Add line
        </Button>
      </div>

      <div className="finance-table-wrap finance-line-items__table-wrap">
        <table className="finance-table finance-line-items__table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit price (ex VAT)</th>
              {showUnitCost ? <th>Unit cost</th> : null}
              <th>Line total</th>
              <th className="finance-line-items__actions-col" aria-label="Line actions" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const lineTotals = calculateEditorLineTotals([line]);
              return (
                <tr key={line.key} className="finance-line-items__row">
                  <td data-label="Category">
                    <select
                      className="titan-input finance-editor-field"
                      value={line.category}
                      disabled={disabled}
                      aria-label={`Line ${index + 1} category`}
                      onChange={(e) =>
                        updateLine(line.key, {
                          category: e.target.value as FinanceEditorLine['category'],
                        })
                      }
                    >
                      {FINANCE_EDITOR_LINE_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Description">
                    <input
                      className="titan-input finance-editor-field"
                      value={line.description}
                      disabled={disabled}
                      required
                      aria-label={`Line ${index + 1} description`}
                      placeholder="Describe the work or material"
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    />
                  </td>
                  <td data-label="Qty">
                    <input
                      className="titan-input finance-editor-field finance-line-items__qty"
                      value={line.quantity}
                      disabled={disabled}
                      inputMode="decimal"
                      aria-label={`Line ${index + 1} quantity`}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td data-label="Unit price">
                    <input
                      className="titan-input finance-editor-field"
                      value={line.unitPrice}
                      disabled={disabled}
                      inputMode="decimal"
                      aria-label={`Line ${index + 1} unit price`}
                      placeholder="0.00"
                      onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                    />
                  </td>
                  {showUnitCost ? (
                    <td data-label="Unit cost">
                      <input
                        className="titan-input finance-editor-field"
                        value={line.unitCost}
                        disabled={disabled}
                        inputMode="decimal"
                        aria-label={`Line ${index + 1} unit cost`}
                        placeholder="0.00"
                        onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                      />
                    </td>
                  ) : null}
                  <td data-label="Line total" className="finance-line-items__line-total tabular-nums">
                    {formatMoney(lineTotals.totalCents, currency)}
                  </td>
                  <td className="finance-line-items__actions">
                    <button
                      type="button"
                      className="finance-line-items__action-btn"
                      disabled={disabled || index === 0}
                      onClick={() => moveLine(line.key, -1)}
                      aria-label={`Move line ${index + 1} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="finance-line-items__action-btn"
                      disabled={disabled || index === lines.length - 1}
                      onClick={() => moveLine(line.key, 1)}
                      aria-label={`Move line ${index + 1} down`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="finance-line-items__action-btn finance-line-items__action-btn--remove"
                      disabled={disabled || lines.length === 1}
                      onClick={() => onChange(lines.filter((item) => item.key !== line.key))}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <aside className="finance-line-items__totals-panel" aria-label="Document totals">
        <div className="finance-line-items__totals-row">
          <span>Subtotal</span>
          <strong className="tabular-nums">{formatMoney(totals.subtotalCents, currency)}</strong>
        </div>
        <div className="finance-line-items__totals-row">
          <span>VAT (15%)</span>
          <strong className="tabular-nums">{formatMoney(totals.vatTotalCents, currency)}</strong>
        </div>
        <div className="finance-line-items__totals-row finance-line-items__totals-row--grand">
          <span>Total</span>
          <strong className="tabular-nums finance-amount">{formatMoney(totals.totalCents, currency)}</strong>
        </div>
      </aside>
    </div>
  );
}
