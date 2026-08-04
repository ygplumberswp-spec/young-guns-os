import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDuplicateCustomersByContact } from '@titan/shared';

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
  assert.match(modalSource, /saveHandlers\?\.onSave/);
  assert.match(modalSource, /saveHandlers\?\.saveError/);
  assert.match(modalSource, /saveHandlers\?\.saveNotice/);
});

test('preview hook prevents double submit while saving', () => {
  const hookSource = readSource('src/features/finance/useFinanceDocumentPreview.tsx');
  assert.match(hookSource, /if \(!handler \|\| isSaving\) return/);
  const modalSource = readSource('src/features/finance/FinanceDocumentPreviewModal.tsx');
  assert.match(modalSource, /disabled=\{!canSave \|\| saving \|\| isLoading\}/);
});

test('all finance editor pages wire preview save handlers from shared persist logic', () => {
  for (const page of editorPages) {
    const source = readSource(page);
    assert.match(source, /saveHandlers:/, `${page} missing saveHandlers`);
    assert.match(source, /onSave:/, `${page} missing onSave`);
    assert.match(source, /onSaveDraft:/, `${page} missing onSaveDraft`);
    assert.match(source, /saveQuoteDraft|saveInvoiceDraft/, `${page} missing shared save callback`);
  }
});

test('create pages use replace navigation after first save from preview path', () => {
  for (const page of ['src/pages/finance/QuoteCreatePage.tsx', 'src/pages/finance/InvoiceCreatePage.tsx']) {
    const source = readSource(page);
    assert.match(source, /financeDocumentEditPath/);
    assert.match(source, /replace: true/);
  }
});

test('customer search exposes Add new customer with duplicate protection and RBAC', () => {
  const source = readSource('src/features/finance/CustomerSearchField.tsx');
  assert.match(source, /Add new customer/);
  assert.match(source, /findDuplicateCustomersByContact/);
  assert.match(source, /canCreateCustomer/);
  assert.match(source, /duplicateMatches/);
  assert.match(source, /normalizeSaPhone/);
  assert.match(source, /isValidEmailAddress/);
});

test('new quote and invoice pages pass customer-create RBAC', () => {
  for (const page of ['src/pages/finance/QuoteCreatePage.tsx', 'src/pages/finance/InvoiceCreatePage.tsx']) {
    const source = readSource(page);
    assert.match(source, /canCreateCustomer=\{canCreateCustomerRecord\}/);
    assert.match(source, /canCreateCustomer\(/);
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
});

test('preview save does not trigger approve send or Xero side effects', () => {
  const hookSource = readSource('src/features/finance/useFinanceDocumentPreview.tsx');
  assert.doesNotMatch(hookSource, /issueQuote|issueInvoice|syncXero|yoco|sendWhatsApp/i);
  for (const page of editorPages) {
    const saveBlock = readSource(page).match(/save(Quote|Invoice)Draft = useCallback\([\s\S]*?\}, \[[\s\S]*?\]\);/)?.[0] ?? '';
    assert.doesNotMatch(saveBlock, /issueQuote|issueInvoice|updateInvoice\(accessToken, .*status: 'sent'/);
  }
});

test('preview CSS includes save confirmation notice styling', () => {
  const css = readSource('src/styles/finance-document-preview.css');
  assert.match(css, /\.finance-document-preview__notice/);
});

test('photos panel still requires linked job on fe4dbc5 scope', () => {
  const panelSource = readSource('src/features/finance/FinanceDocumentPhotosPanel.tsx');
  assert.match(panelSource, /Select a linked job before uploading/);
  assert.doesNotMatch(panelSource, /uploadFinanceStagingPhoto/);
});
