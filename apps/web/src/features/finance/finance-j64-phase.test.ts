import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDuplicateCustomersByContact, FINANCE_DIRECT_EVIDENCE_SCOPE } from '@titan/shared';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readSource(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

const editorPages = [
  'src/pages/finance/QuoteCreatePage.tsx',
  'src/pages/finance/QuoteEditPage.tsx',
  'src/pages/finance/InvoiceCreatePage.tsx',
  'src/pages/finance/InvoiceEditPage.tsx',
] as const;

test('preview modal exposes Save, Save Draft, Download PDF and Close', () => {
  const modalSource = readSource('src/features/finance/FinanceDocumentPreviewModal.tsx');
  assert.match(modalSource, /Save Draft/);
  assert.match(modalSource, /Download PDF/);
  assert.match(modalSource, /Close/);
  assert.match(modalSource, /saveHandlers\?\.onSave/);
  assert.match(modalSource, /saveHandlers\?\.saveError/);
  assert.match(modalSource, /saveHandlers\?\.saveNotice/);
});

test('preview hook delegates save to editor callbacks without closing modal', () => {
  const hookSource = readSource('src/features/finance/useFinanceDocumentPreview.tsx');
  assert.match(hookSource, /saveHandlers/);
  assert.match(hookSource, /runPreviewSave/);
  assert.match(hookSource, /setSaveNotice/);
  assert.match(hookSource, /setSaveError/);
  const saveBlock = hookSource.match(/const runPreviewSave = useCallback\([\s\S]*?\}, \[\],?\);/)?.[0] ?? '';
  assert.doesNotMatch(saveBlock, /closePreview/);
  assert.doesNotMatch(hookSource, /issueQuote|issueInvoice|syncXero|yoco/i);
});

test('all finance editor pages wire preview save handlers from shared persist logic', () => {
  for (const page of editorPages) {
    const source = readSource(page);
    assert.match(source, /useFinanceDocumentPreview\(\{[\s\S]*saveHandlers/s, `${page} missing preview saveHandlers`);
    assert.match(source, /onSave:/, `${page} missing onSave handler`);
    assert.match(source, /onSaveDraft:/, `${page} missing onSaveDraft handler`);
    assert.match(source, /linkPhotosAfterFinanceSave/, `${page} missing photo link on save`);
  }
});

test('create pages pass draftClientActionId for direct uploads without a job', () => {
  for (const page of ['src/pages/finance/QuoteCreatePage.tsx', 'src/pages/finance/InvoiceCreatePage.tsx']) {
    const source = readSource(page);
    assert.match(source, /draftClientActionId=\{clientActionId\}/, `${page} missing draftClientActionId`);
  }
});

test('photos panel supports direct finance staging uploads', () => {
  const panelSource = readSource('src/features/finance/FinanceDocumentPhotosPanel.tsx');
  assert.match(panelSource, /uploadFinanceStagingPhoto/);
  assert.match(panelSource, /FINANCE_DIRECT_EVIDENCE_SCOPE/);
  assert.match(panelSource, /source: 'finance_direct'/);
  assert.match(panelSource, /capture="environment"/);
});

test('customer search exposes Add new customer with duplicate protection and RBAC', () => {
  const source = readSource('src/features/finance/CustomerSearchField.tsx');
  assert.match(source, /Add new customer/);
  assert.match(source, /findDuplicateCustomersByContact/);
  assert.match(source, /canCreateCustomer/);
  assert.match(source, /duplicateMatches/);
});

test('new quote and invoice pages pass customer-create RBAC', () => {
  for (const page of ['src/pages/finance/QuoteCreatePage.tsx', 'src/pages/finance/InvoiceCreatePage.tsx']) {
    const source = readSource(page);
    assert.match(source, /canCreateCustomer=\{canCreateCustomerRecord\}/, `${page} missing RBAC prop`);
    assert.match(source, /canCreateCustomer\(/, `${page} missing canCreateCustomer helper`);
  }
});

test('findDuplicateCustomersByContact detects name phone and email matches', () => {
  const results = [
    { id: '1', name: 'Young Guns Plumbing', companyName: null, email: 'ops@yg.co.za', phone: '021 555 0100' },
    { id: '2', name: 'Other Co', companyName: 'Other Co', email: 'other@example.com', phone: '021 555 9999' },
  ];
  assert.equal(findDuplicateCustomersByContact({ name: 'Young Guns Plumbing' }, results).length, 1);
  assert.equal(findDuplicateCustomersByContact({ email: 'ops@yg.co.za' }, results).length, 1);
  assert.equal(findDuplicateCustomersByContact({ phone: '0215550100' }, results).length, 1);
  assert.equal(findDuplicateCustomersByContact({ name: 'Unique Name' }, results).length, 0);
});

test('finance direct evidence scope is stable sentinel job id', () => {
  assert.match(FINANCE_DIRECT_EVIDENCE_SCOPE, /^[0-9a-f-]{36}$/);
});

test('preview save helper never blocks save on photo link failure', () => {
  const source = readSource('src/features/finance/finance-document-editor-save.ts');
  assert.match(source, /catch \{\s*\/\/ Upload or link failure must never block Save or Save Draft\./s);
});

test('preview CSS includes save confirmation notice styling', () => {
  const css = readSource('src/styles/finance-document-preview.css');
  assert.match(css, /\.finance-document-preview__notice/);
});

test('document engine API client exposes finance staging and content routes', () => {
  const source = readSource('src/lib/document-engine-api-client.ts');
  assert.match(source, /\/finance\/staging\//);
  assert.match(source, /\/finance\/documents\//);
  assert.match(source, /financeDirectPhotoContentUrl/);
});

test('API document-engine routes enforce finance RBAC on direct uploads and content', () => {
  const apiRoot = join(webRoot, '../api/src');
  const routeSource = readFileSync(join(apiRoot, 'routes/document-engine.ts'), 'utf8');
  assert.match(routeSource, /finance:write/);
  assert.match(routeSource, /finance:read/);
  assert.match(routeSource, /finance\/staging/);
  assert.match(routeSource, /finance\/photos\/content/);
});

test('finance evidence storage validates tenant scope and path traversal', () => {
  const apiRoot = join(webRoot, '../api/src');
  const source = readFileSync(join(apiRoot, 'services/finance-document-evidence-storage.service.ts'), 'utf8');
  assert.match(source, /validateFinanceDirectUpload/);
  assert.match(source, /includes\('\.\.'\)/);
  assert.match(source, /metadata\.companyId !== input\.companyId/);
});
