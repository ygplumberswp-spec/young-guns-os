import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const indexCss = readFileSync(join(webRoot, 'src/index.css'), 'utf8');

const editorPages = [
  'QuoteCreatePage.tsx',
  'QuoteEditPage.tsx',
  'InvoiceCreatePage.tsx',
  'InvoiceEditPage.tsx',
] as const;

const detailPages = ['QuoteDetailPage.tsx', 'InvoiceDetailPage.tsx'] as const;

function readPage(name: string): string {
  return readFileSync(join(webRoot, `src/pages/finance/${name}`), 'utf8');
}

test('finance editor CSS has no restrictive 72rem max-width', () => {
  assert.doesNotMatch(indexCss, /\.finance-editor\s*\{[^}]*max-width:\s*72rem/s);
  assert.match(indexCss, /\.finance-editor--workspace\s*\{[^}]*max-width:\s*none/s);
});

test('line-item table fills workspace container at full width', () => {
  assert.match(indexCss, /\.finance-line-items--workspace\s+\.finance-line-items__table\s*\{[^}]*width:\s*100%/s);
  assert.match(indexCss, /\.finance-line-items--workspace\s+\.finance-line-items__table-wrap\s*\{[^}]*width:\s*100%/s);
  assert.match(indexCss, /\.finance-line-items__col-description\s*\{/s);
});

test('desktop workspace grid reflows at tablet breakpoint (1024px)', () => {
  const layoutRule = indexCss.match(
    /@media\s*\(\s*max-width:\s*1024px\s*\)\s*\{[\s\S]*?\.finance-editor__layout--workspace[\s\S]*?grid-template-columns:\s*1fr[\s\S]*?\}/,
  );
  assert.ok(layoutRule, 'finance workspace tablet reflow rule missing');
  const block = layoutRule[0]!;
  assert.match(block, /\.finance-editor__bottom-grid[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(block, /\.finance-detail--workspace[\s\S]*?grid-template-columns:\s*1fr/);
});

test('mobile layout stacks line items and actions at 768px without page-level clip', () => {
  const mobileRule = indexCss.match(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{[\s\S]*?\.finance-document-actions__primary \.titan-btn[\s\S]*?\}/);
  assert.ok(mobileRule, 'finance mobile reflow block missing');
  const block = mobileRule[0]!;
  assert.match(block, /\.finance-line-items--editor \.finance-table tr[\s\S]*?display:\s*block/);
  assert.match(block, /\.finance-line-items__totals-panel[\s\S]*?width:\s*100%/);
  assert.doesNotMatch(block, /overflow-x:\s*clip/);
});

test('narrow mobile viewports use full-width totals and controlled table scroll (~390px)', () => {
  const previewCss = readFileSync(join(webRoot, 'src/styles/finance-document-preview.css'), 'utf8');
  assert.match(previewCss, /finance-document-preview__iframe[\s\S]*?width:\s*100%/);
  assert.match(indexCss, /\.finance-line-items__totals-panel[\s\S]*?width:\s*100%/);
  assert.match(indexCss, /\.finance-line-items--workspace[\s\S]*overflow-x:\s*auto/);
  assert.match(indexCss, /\.finance-page--workspace\s*\{[^}]*min-width:\s*0/s);
});

test('desktop workspace retains side-by-side notes and totals near 1440px', () => {
  assert.match(
    indexCss,
    /\.finance-editor__bottom-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(16rem,\s*22rem\)/s,
  );
  assert.match(indexCss, /\.finance-line-items--workspace\s+\.finance-line-items__table\s*\{[^}]*width:\s*100%/s);
});

test('workspace does not use overflow-x clip to hide broken layout', () => {
  assert.doesNotMatch(indexCss, /\.finance-page--workspace\s*\{[^}]*overflow-x:\s*clip/s);
  assert.match(indexCss, /\.finance-line-items--workspace[\s\S]*overflow-x:\s*auto/);
});

test('workspace uses min-width zero and controlled table scroll for narrow viewports', () => {
  assert.match(indexCss, /\.finance-page--workspace\s*\{[^}]*min-width:\s*0/s);
  assert.match(indexCss, /\.finance-editor__bottom-grid\s*\{[^}]*min-width:\s*0/s);
});

test('all quote and invoice editor pages use workspace layout classes', () => {
  for (const page of editorPages) {
    const source = readPage(page);
    assert.match(source, /finance-page--workspace/, `${page} missing finance-page--workspace`);
    assert.match(source, /finance-editor--workspace/, `${page} missing finance-editor--workspace`);
    assert.match(source, /finance-editor__layout--workspace/, `${page} missing finance-editor__layout--workspace`);
    assert.match(source, /finance-editor__bottom-grid/, `${page} missing notes/totals bottom grid`);
    assert.match(source, /FinanceLineItemsTotals/, `${page} missing FinanceLineItemsTotals`);
  }
});

test('quote and invoice detail/preview pages use workspace layout classes', () => {
  for (const page of detailPages) {
    const source = readPage(page);
    assert.match(source, /finance-page--workspace/, `${page} missing finance-page--workspace`);
    assert.match(source, /finance-detail--workspace/, `${page} missing finance-detail--workspace`);
    assert.match(source, /finance-table--workspace/, `${page} missing full-width line table`);
  }
});
