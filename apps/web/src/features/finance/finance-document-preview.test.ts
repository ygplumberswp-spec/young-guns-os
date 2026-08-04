import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFinanceEditorPreviewInput } from './finance-preview-request.js';
import { parseEditorLinesForPreview } from './finance-editor-utils.js';
import { newFinanceEditorLine } from './finance-editor-utils.js';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readSource(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

test('buildFinanceEditorPreviewInput maps unsaved editor values for API preview', () => {
  const line = newFinanceEditorLine();
  line.description = 'Emergency call-out';
  line.unitPrice = '500.00';
  const input = buildFinanceEditorPreviewInput({
    kind: 'quote',
    customer: {
      id: 'cust-1',
      name: 'Sea Point Body Corporate',
      companyName: null,
      email: 'office@example.com',
      phone: null,
      xeroContactId: null,
    },
    customerReference: 'PO-7781',
    issuedAt: '2026-08-04',
    dueDate: '2026-08-18',
    addresses: {
      billingAddress: '1 Main Rd',
      siteAddress: '12 Ocean View',
      postalAddress: 'PO Box 44',
    },
    lines: [line],
    vatMode: 'standard',
    priceMode: 'excluding_vat',
    notes: 'Confirm access with caretaker.',
  });

  assert.equal(input.kind, 'quote');
  assert.equal(input.customer?.name, 'Sea Point Body Corporate');
  assert.equal(input.customerReference, 'PO-7781');
  assert.equal(input.lines.length, 1);
  assert.equal(input.lines[0]!.unitPriceCents, 50000);
  assert.equal(input.notes, 'Confirm access with caretaker.');
});

test('parseEditorLinesForPreview skips blank rows but keeps in-progress lines', () => {
  const complete = newFinanceEditorLine();
  complete.description = 'Labour';
  complete.unitPrice = '650.00';
  const blank = newFinanceEditorLine();
  const parsed = parseEditorLinesForPreview([complete, blank], { vatMode: 'standard' });
  assert.equal(parsed.length, 1);
});

test('quote and invoice editor pages wire preview without save or window.open detail', () => {
  for (const page of [
    'src/pages/finance/QuoteCreatePage.tsx',
    'src/pages/finance/QuoteEditPage.tsx',
    'src/pages/finance/InvoiceCreatePage.tsx',
    'src/pages/finance/InvoiceEditPage.tsx',
  ]) {
    const source = readSource(page);
    assert.match(source, /useFinanceDocumentPreview/);
    assert.match(source, /buildFinanceEditorPreviewInput/);
    assert.match(source, /previewModal/);
    const previewBlock = source.match(/if \(action === 'preview_pdf'\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.ok(previewBlock.length > 0, `preview block missing in ${page}`);
    assert.doesNotMatch(previewBlock, /persist(Quote|Invoice)\(/);
    assert.doesNotMatch(previewBlock, /window\.open\(`\/finance\/(quotes|invoices)/);
  }
});

test('finance API client exposes read-only document preview endpoint', () => {
  const source = readSource('src/lib/finance-api.ts');
  assert.match(source, /previewFinanceDocument/);
  assert.match(source, /\/finance\/documents\/preview/);
});

test('TitanDocumentView supports title-free finance preview rendering', () => {
  const source = readSource('src/components/documents/TitanDocumentView.tsx');
  assert.match(source, /hideTitle/);
  assert.match(source, /hidePaymentOptions/);
  assert.match(source, /documentAddresses/);
  assert.match(source, /customerReference/);
});
