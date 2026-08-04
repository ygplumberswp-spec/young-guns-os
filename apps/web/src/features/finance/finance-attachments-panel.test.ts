import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const featureRoot = dirname(fileURLToPath(import.meta.url));
const webRoot = join(featureRoot, '../../..');
const panelSource = readFileSync(join(featureRoot, 'FinanceDocumentAttachmentsPanel.tsx'), 'utf8');
const utilsSource = readFileSync(join(featureRoot, 'finance-attachment-utils.ts'), 'utf8');
const indexCss = readFileSync(join(webRoot, 'src/index.css'), 'utf8');

const editorPages = [
  'QuoteCreatePage.tsx',
  'QuoteEditPage.tsx',
  'InvoiceCreatePage.tsx',
  'InvoiceEditPage.tsx',
] as const;

function readPage(name: string): string {
  return readFileSync(join(webRoot, `src/pages/finance/${name}`), 'utf8');
}

test('attachments panel supports mobile camera and photo-library inputs', () => {
  assert.match(panelSource, /accept=\{FINANCE_ATTACHMENT_ACCEPT\}/);
  assert.match(panelSource, /capture="environment"/);
  assert.match(panelSource, /accept="image\/jpeg,image\/png,image\/webp,image\/heic,\.heic"/);
  assert.match(utilsSource, /image\/heic/);
  assert.match(utilsSource, /application\/pdf/);
});

test('attachments panel exposes drag-and-drop, captions, reorder, replace and PDF toggle', () => {
  assert.match(panelSource, /onDrop=\{handleDrop\}/);
  assert.match(panelSource, /Include in PDF/);
  assert.match(panelSource, /moveAttachment/);
  assert.match(panelSource, /replaceFinanceAttachment/);
  assert.match(panelSource, /updateCaption/);
  assert.match(panelSource, /linkStagingJobEvidence/);
});

test('upload failures are isolated and do not block the editor save flow', () => {
  assert.match(panelSource, /status: 'error'/);
  assert.match(panelSource, /Upload failed/);
  assert.doesNotMatch(panelSource, /persistQuote/);
  assert.doesNotMatch(panelSource, /persistInvoice/);
});

test('all quote and invoice editor pages include full-width Photos & Attachments section', () => {
  for (const page of editorPages) {
    const source = readPage(page);
    assert.match(source, /FinanceDocumentAttachmentsPanel/, `${page} missing attachments panel`);
  }
  assert.match(panelSource, /Photos & Attachments/);
  assert.match(panelSource, /finance-editor-card--attachments/);
});

test('create pages link staging attachments after first save', () => {
  assert.match(readPage('QuoteCreatePage.tsx'), /linkStagingAttachmentsToDocument/);
  assert.match(readPage('InvoiceCreatePage.tsx'), /linkStagingAttachmentsToDocument/);
});

test('editor preview requests pass attachment scope for PDF inclusion', () => {
  assert.match(readPage('QuoteEditPage.tsx'), /attachmentScope:\s*\{\s*quoteId\s*\}/);
  assert.match(readPage('InvoiceEditPage.tsx'), /attachmentScope:\s*\{\s*invoiceId\s*\}/);
  assert.match(readPage('QuoteCreatePage.tsx'), /financePreviewAttachmentScope/);
});

test('attachments CSS spans full editor width', () => {
  assert.match(indexCss, /\.finance-editor-card--attachments\s*\{[^}]*grid-column:\s*1 \/ -1/s);
});
