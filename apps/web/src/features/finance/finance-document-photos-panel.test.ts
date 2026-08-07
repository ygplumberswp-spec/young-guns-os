import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const featureRoot = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(join(featureRoot, 'FinanceDocumentPhotosPanel.tsx'), 'utf8');

test('photos panel uses document engine and job evidence routes', () => {
  assert.match(panelSource, /ensureFinanceQuoteDocument|ensureFinanceInvoiceDocument/);
  assert.match(panelSource, /uploadOfficeJobEvidence/);
  assert.match(panelSource, /uploadFinanceStagingPhoto|uploadFinanceDocumentPhoto/);
  assert.match(panelSource, /saveTitanDocumentDraft/);
  assert.match(panelSource, /capture="environment"/);
  assert.match(panelSource, /draftClientActionId/);
});

test('all finance editor pages include document-engine photos panel', () => {
  const webRoot = join(featureRoot, '../../pages/finance');
  for (const page of ['QuoteCreatePage.tsx', 'QuoteEditPage.tsx', 'InvoiceCreatePage.tsx', 'InvoiceEditPage.tsx']) {
    const source = readFileSync(join(webRoot, page), 'utf8');
    assert.match(source, /FinanceDocumentPhotosPanel/, `${page} missing photos panel`);
  }
});
