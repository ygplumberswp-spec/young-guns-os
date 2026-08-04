import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEditorLineTotals,
  createBlankEditorLines,
  exVatCentsToDisplay,
  parseEditorLinesForApi,
  parseEditorLinesForDraft,
  unitPriceToExVatCents,
} from './finance-editor-utils.js';

test('including VAT price mode converts to ex-VAT cents for API', () => {
  assert.equal(unitPriceToExVatCents('115.00', 'including_vat', 1500), 10000);
  assert.equal(exVatCentsToDisplay(10000, 'including_vat', 1500), '115.00');
});

test('draft parse always returns at least one placeholder line', () => {
  const lines = createBlankEditorLines(3);
  const parsed = parseEditorLinesForDraft(lines);
  assert.equal(parsed.length, 1);
  assert.match(parsed[0]!.description, /pending/i);
});

test('strict parse rejects empty line sets', () => {
  assert.equal(parseEditorLinesForApi(createBlankEditorLines(2)), null);
});

test('totals remain cents-safe with including VAT input', () => {
  const totals = calculateEditorLineTotals(
    [
      {
        key: 'a',
        category: 'labour',
        description: 'Labour',
        quantity: '2',
        unitPrice: '115.00',
        unitCost: '',
        vatRateBps: '1500',
      },
    ],
    { priceMode: 'including_vat', vatMode: 'standard' },
  );
  assert.equal(totals.subtotalCents, 20000);
  assert.equal(totals.vatTotalCents, 3000);
  assert.equal(totals.totalCents, 23000);
});
