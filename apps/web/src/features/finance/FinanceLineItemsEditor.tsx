import { useRef } from 'react';
import { FINANCE_EDITOR_LINE_CATEGORY_OPTIONS, formatMoney } from '@titan/shared';
import { FinanceCatalogueItemSearchField } from './FinanceCatalogueItemSearchField';
import type { FinanceDocumentPriceMode, FinanceDocumentVatMode, FinanceEditorLine } from './finance-editor-utils';
import {
  applyDocumentVatMode,
  calculateEditorLineTotals,
  ensureTrailingBlankLines,
  newFinanceEditorLine,
} from './finance-editor-utils';

type FinanceLineItemsEditorProps = {
  accessToken: string;
  lines: FinanceEditorLine[];
  onChange: (lines: FinanceEditorLine[]) => void;
  vatMode: FinanceDocumentVatMode;
  onVatModeChange: (mode: FinanceDocumentVatMode) => void;
  priceMode: FinanceDocumentPriceMode;
  onPriceModeChange: (mode: FinanceDocumentPriceMode) => void;
  currency?: string;
  disabled?: boolean;
  showUnitCost?: boolean;
};

export function FinanceLineItemsEditor({
  accessToken,
  lines,
  onChange,
  vatMode,
  onVatModeChange,
  priceMode,
  onPriceModeChange,
  currency = 'ZAR',
  disabled,
  showUnitCost = true,
}: FinanceLineItemsEditorProps) {
  const descriptionRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const totals = calculateEditorLineTotals(lines, { priceMode, vatMode });

  function setLines(next: FinanceEditorLine[]) {
    onChange(ensureTrailingBlankLines(next, 2));
  }

  function updateLine(key: string, patch: Partial<FinanceEditorLine>) {
    setLines(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLineAfter(key?: string) {
    const index = key ? lines.findIndex((line) => line.key === key) : lines.length - 1;
    const next = [...lines];
    const insertAt = index >= 0 ? index + 1 : next.length;
    next.splice(insertAt, 0, newFinanceEditorLine());
    setLines(next);
    const newKey = next[insertAt]!.key;
    window.requestAnimationFrame(() => descriptionRefs.current[newKey]?.focus());
  }

  function handleVatModeChange(mode: FinanceDocumentVatMode) {
    onVatModeChange(mode);
    onChange(applyDocumentVatMode(lines, mode));
  }

  function handleLineEnter(event: React.KeyboardEvent, lineKey: string, isLastRow: boolean) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (isLastRow) addLineAfter(lineKey);
  }

  function handleFormKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'TEXTAREA') {
      event.preventDefault();
    }
  }

  return (
    <div className="finance-line-items finance-line-items--editor" onKeyDown={handleFormKeyDown}>
      <div className="finance-line-items__toolbar">
        <div className="finance-line-items__toolbar-group">
          <div className="finance-vat-selector" role="group" aria-label="Document VAT treatment">
            <span className="finance-vat-selector__label">VAT</span>
            <div className="finance-vat-selector__options">
              <button
                type="button"
                className={`finance-vat-selector__option${vatMode === 'standard' ? ' finance-vat-selector__option--active' : ''}`}
                disabled={disabled}
                aria-pressed={vatMode === 'standard'}
                onClick={() => handleVatModeChange('standard')}
              >
                VAT 15%
              </button>
              <button
                type="button"
                className={`finance-vat-selector__option${vatMode === 'zero' ? ' finance-vat-selector__option--active' : ''}`}
                disabled={disabled}
                aria-pressed={vatMode === 'zero'}
                onClick={() => handleVatModeChange('zero')}
              >
                No VAT
              </button>
            </div>
          </div>

          <div className="finance-vat-selector" role="group" aria-label="Price entry mode">
            <span className="finance-vat-selector__label">Prices</span>
            <div className="finance-vat-selector__options">
              <button
                type="button"
                className={`finance-vat-selector__option${priceMode === 'excluding_vat' ? ' finance-vat-selector__option--active' : ''}`}
                disabled={disabled}
                aria-pressed={priceMode === 'excluding_vat'}
                onClick={() => onPriceModeChange('excluding_vat')}
              >
                Excl. VAT
              </button>
              <button
                type="button"
                className={`finance-vat-selector__option${priceMode === 'including_vat' ? ' finance-vat-selector__option--active' : ''}`}
                disabled={disabled}
                aria-pressed={priceMode === 'including_vat'}
                onClick={() => onPriceModeChange('including_vat')}
              >
                Incl. VAT
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="finance-table-wrap finance-line-items__table-wrap">
        <table className="finance-table finance-line-items__table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Item / description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>{priceMode === 'including_vat' ? 'Unit price (incl. VAT)' : 'Unit price (ex VAT)'}</th>
              {showUnitCost ? <th>Unit cost</th> : null}
              <th>Line total</th>
              <th className="finance-line-items__actions-col" aria-label="Line actions" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const lineTotals = calculateEditorLineTotals([line], { priceMode, vatMode });
              const isLastRow = index === lines.length - 1;
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
                  <td data-label="Item / description">
                    <FinanceCatalogueItemSearchField
                      accessToken={accessToken}
                      line={line}
                      allLines={lines}
                      lineIndex={index}
                      disabled={disabled}
                      currency={currency}
                      priceMode={priceMode}
                      vatMode={vatMode}
                      inputRef={(el) => {
                        descriptionRefs.current[line.key] = el;
                      }}
                      onLineChange={(nextLine) => {
                        setLines(lines.map((row) => (row.key === line.key ? nextLine : row)));
                      }}
                      onCatalogueSelected={(lineKey) => addLineAfter(lineKey)}
                    />
                  </td>
                  <td data-label="Qty">
                    <input
                      className="titan-input finance-editor-field finance-line-items__qty"
                      value={line.quantity}
                      disabled={disabled}
                      inputMode="decimal"
                      aria-label={`Line ${index + 1} quantity`}
                      onKeyDown={(e) => handleLineEnter(e, line.key, isLastRow)}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td data-label="Unit">
                    <input
                      className="titan-input finance-editor-field finance-line-items__unit"
                      value={line.unit}
                      disabled={disabled}
                      aria-label={`Line ${index + 1} unit`}
                      placeholder="each"
                      onChange={(e) => updateLine(line.key, { unit: e.target.value })}
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
                      onKeyDown={(e) => handleLineEnter(e, line.key, isLastRow)}
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
                      className="finance-line-items__action-btn finance-line-items__action-btn--remove"
                      disabled={disabled || lines.length <= 1}
                      onClick={() => setLines(lines.filter((item) => item.key !== line.key))}
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

      <div className="finance-line-items__add-row">
        <button type="button" className="finance-line-items__add-btn" disabled={disabled} onClick={() => addLineAfter()}>
          + Add line
        </button>
      </div>

      <aside className="finance-line-items__totals-panel" aria-label="Document totals">
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
    </div>
  );
}
