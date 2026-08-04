import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBlankEditorLines,
  lineItemsToEditorLines,
  newFinanceEditorLine,
  parseEditorLinesForApi,
  parseEditorLinesForDraft,
} from './finance-editor-utils.js';
import {
  DRAFT_PLACEHOLDER_LINE_DESCRIPTION,
  financeDocumentEditPath,
  isDraftPlaceholderLineItem,
} from './finance-document-save.js';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readSource(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

test('blank editor rows produce a draft placeholder line for persistence', () => {
  const parsed = parseEditorLinesForDraft(createBlankEditorLines(5));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.description, DRAFT_PLACEHOLDER_LINE_DESCRIPTION);
  assert.equal(parsed[0]!.unitPriceCents, 0);
});

test('incomplete editor row with description only still saves as draft placeholder', () => {
  const line = newFinanceEditorLine();
  line.description = 'Geyser replacement';
  const parsed = parseEditorLinesForDraft([line]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.description, DRAFT_PLACEHOLDER_LINE_DESCRIPTION);
});

test('completed editor rows save real line items for draft persistence', () => {
  const line = newFinanceEditorLine();
  line.description = 'Emergency call-out';
  line.unitPrice = '450.00';
  const parsed = parseEditorLinesForDraft([line]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.description, 'Emergency call-out');
  assert.equal(parsed[0]!.unitPriceCents, 45000);
  assert.notEqual(parsed[0]!.description, DRAFT_PLACEHOLDER_LINE_DESCRIPTION);
});

test('strict parse still requires a complete line for approve/send flows', () => {
  const incomplete = newFinanceEditorLine();
  incomplete.description = 'Pending pricing';
  assert.equal(parseEditorLinesForApi([incomplete]), null);
});

test('draft placeholder lines are stripped when reloading editor state', () => {
  const lines = lineItemsToEditorLines([
    {
      id: 'placeholder-1',
      category: 'other',
      description: DRAFT_PLACEHOLDER_LINE_DESCRIPTION,
      quantity: 1,
      unitPriceCents: 0,
      vatRateBps: 1500,
    },
    {
      id: 'line-1',
      category: 'labour',
      description: 'Labour',
      quantity: 1,
      unitPriceCents: 65000,
      vatRateBps: 1500,
    },
  ]);
  assert.equal(lines.some((line) => line.description === DRAFT_PLACEHOLDER_LINE_DESCRIPTION), false);
  assert.equal(lines.some((line) => line.description === 'Labour'), true);
});

test('isDraftPlaceholderLineItem identifies persisted placeholder rows only', () => {
  assert.equal(
    isDraftPlaceholderLineItem({
      description: DRAFT_PLACEHOLDER_LINE_DESCRIPTION,
      unitPriceCents: 0,
    }),
    true,
  );
  assert.equal(
    isDraftPlaceholderLineItem({ description: 'Labour', unitPriceCents: 65000 }),
    false,
  );
});

test('finance document edit paths keep users on the saved document', () => {
  assert.equal(financeDocumentEditPath('quote', 'abc'), '/finance/quotes/abc/edit');
  assert.equal(financeDocumentEditPath('invoice', 'abc'), '/finance/invoices/abc/edit');
});

test('actions bar exposes Save and Save Draft without conflating Save & New', () => {
  const source = readSource('src/features/finance/FinanceDocumentActionsBar.tsx');
  assert.match(source, /onAction\('save'\)/);
  assert.match(source, /'Save'/);
  assert.match(source, /onAction\('save_draft'\)/);
  assert.match(source, /Save Draft/);
  assert.match(source, /save_new/);
});

test('quote and invoice editor pages wire Save and Save Draft without side effects', () => {
  for (const page of [
    'src/pages/finance/QuoteCreatePage.tsx',
    'src/pages/finance/QuoteEditPage.tsx',
    'src/pages/finance/InvoiceCreatePage.tsx',
    'src/pages/finance/InvoiceEditPage.tsx',
  ]) {
    const source = readSource(page);
    const saveBlock =
      source.match(/if \(action === 'save' \|\| action === 'save_draft'\) \{[\s\S]*?\n      \}/)?.[0] ?? '';
    assert.ok(saveBlock.length > 0, `save block missing in ${page}`);
    assert.match(saveBlock, /persist(Quote|Invoice)\(false\)/);
    assert.doesNotMatch(saveBlock, /issue(Quote|Invoice)\(/);
    assert.doesNotMatch(saveBlock, /status: 'sent'/);
  }
});

test('create pages navigate to edit URL after first successful save', () => {
  for (const page of ['src/pages/finance/QuoteCreatePage.tsx', 'src/pages/finance/InvoiceCreatePage.tsx']) {
    const source = readSource(page);
    const saveBlock =
      source.match(/if \(action === 'save' \|\| action === 'save_draft'\) \{[\s\S]*?\n      \}/)?.[0] ?? '';
    assert.ok(saveBlock.length > 0, `save block missing in ${page}`);
    assert.match(source, /financeDocumentEditPath/);
    assert.match(saveBlock, /replace: true/);
    assert.doesNotMatch(saveBlock, /navigate\('\/finance\/(quotes|invoices)\/new'/);
  }
});

test('editor pages show Xero pending numbering until official numbers exist', () => {
  assert.match(readSource('src/pages/finance/QuoteCreatePage.tsx'), /Draft — Xero quote number pending/);
  assert.match(readSource('src/pages/finance/InvoiceCreatePage.tsx'), /Draft — Xero invoice number pending/);
  assert.match(
    readSource('src/pages/finance/QuoteEditPage.tsx'),
    /displayQuoteNumber \|\| 'Draft — Xero quote number pending'/,
  );
  assert.match(
    readSource('src/pages/finance/InvoiceEditPage.tsx'),
    /displayInvoiceNumber \|\| 'Draft — Xero invoice number pending'/,
  );
});
