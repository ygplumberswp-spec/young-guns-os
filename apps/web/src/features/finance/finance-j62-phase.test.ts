import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_FINANCE_CATALOGUE } from '@titan/shared';
import {
  applyCatalogueItemToEditorLine,
  applyManualLineDescription,
  newFinanceEditorLine,
  parseEditorLinesForDraft,
} from './finance-editor-utils.js';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readSource(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

test('duplicate catalogue items can be added to separate document lines', () => {
  const item = BUILTIN_FINANCE_CATALOGUE[1]!;
  const lineOne = applyCatalogueItemToEditorLine(newFinanceEditorLine(), item, {
    priceMode: 'excluding_vat',
    vatMode: 'standard',
  });
  const lineTwo = applyCatalogueItemToEditorLine(newFinanceEditorLine(), item, {
    priceMode: 'excluding_vat',
    vatMode: 'standard',
  });
  assert.equal(lineOne.catalogueSourceKey, item.sourceKey);
  assert.equal(lineTwo.catalogueSourceKey, item.sourceKey);
  const parsed = parseEditorLinesForDraft([lineOne, lineTwo], { vatMode: 'standard' });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]!.description, parsed[1]!.description);
});

test('manual lines remain available alongside catalogue selections', () => {
  const catalogueLine = applyCatalogueItemToEditorLine(newFinanceEditorLine(), BUILTIN_FINANCE_CATALOGUE[0]!, {
    priceMode: 'excluding_vat',
    vatMode: 'standard',
  });
  const manualLine = applyManualLineDescription(newFinanceEditorLine(), 'Custom adapter labour');
  manualLine.unitPrice = '75.00';
  const parsed = parseEditorLinesForDraft([catalogueLine, manualLine], { vatMode: 'standard' });
  assert.equal(parsed[1]!.description, 'Custom adapter labour');
});

test('catalogue search field allows duplicate selection with warning only', () => {
  const source = readSource('src/features/finance/FinanceCatalogueItemSearchField.tsx');
  assert.doesNotMatch(source, /isCatalogueSourceKeyUsed\(item\.sourceKey,\s*usedSourceKeys\)\)\s*\{\s*setDuplicateMessage[\s\S]*?return;/);
  assert.match(source, /duplicateCatalogueSelectionWarning/);
  assert.match(source, /searchFinanceCatalogue\(accessToken,\s*trimmed\)/);
  assert.match(source, /formatFinanceCatalogueSourceLabel/);
});

test('Enter in catalogue field selects item without blocking duplicates', () => {
  const source = readSource('src/features/finance/FinanceCatalogueItemSearchField.tsx');
  assert.match(source, /event\.key === 'Enter'/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /selectCatalogueItem\(results\[highlightIndex\]/);
});

test('line editor Enter on final row adds a line instead of submitting document', () => {
  const source = readSource('src/features/finance/FinanceLineItemsEditor.tsx');
  assert.match(source, /handleLineEnter/);
  assert.match(source, /if \(event\.key === 'Enter' && \(event\.target as HTMLElement\)\.tagName !== 'TEXTAREA'\)/);
  assert.match(source, /event\.preventDefault\(\)/);
});

test('quote unit cost column is gated by finance profit visibility', () => {
  const createSource = readSource('src/pages/finance/QuoteCreatePage.tsx');
  const editSource = readSource('src/pages/finance/QuoteEditPage.tsx');
  assert.match(createSource, /showUnitCost=\{canViewUnitCost\}/);
  assert.match(editSource, /showUnitCost=\{canViewUnitCost\}/);
  assert.match(createSource, /canViewFinanceProfit/);
});

test('draft parsing does not imply inventory mutation hooks', () => {
  const parsed = parseEditorLinesForDraft(
    [
      applyCatalogueItemToEditorLine(newFinanceEditorLine(), BUILTIN_FINANCE_CATALOGUE[2]!, {
        priceMode: 'excluding_vat',
        vatMode: 'standard',
      }),
    ],
    { vatMode: 'standard' },
  );
  assert.equal(parsed.length, 1);
  assert.ok(parsed[0]!.description.length > 0);
  assert.doesNotMatch(readSource('src/features/finance/finance-editor-utils.ts'), /inventoryItems|deductStock|stockMovement/i);
});
