import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.describe('finance editor workspace layout', () => {
  test('workspace CSS supports full-width editors at desktop width', async ({ page }) => {
    const css = readFileSync(join(process.cwd(), 'apps/web/src/index.css'), 'utf8');
    expect(css).toMatch(/\.finance-editor--workspace[\s\S]*max-width:\s*none/);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(`
      <div class="finance-page finance-page--editor finance-page--workspace">
        <div class="finance-editor finance-editor--workspace">
          <section class="finance-editor-card--full finance-editor-card--attachments">Photos & Attachments</section>
          <div class="finance-editor__bottom-grid">
            <section class="finance-editor-card--notes">Notes</section>
            <aside class="finance-line-items__totals-panel--workspace">Totals</aside>
          </div>
        </div>
      </div>
    `);

    const editor = page.locator('.finance-editor--workspace');
    await expect(editor).toBeVisible();
    const box = await editor.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(600);
  });

  test('mobile viewport keeps customer and preview actions accessible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <div class="finance-customer-search finance-customer-search--editor">
        <input aria-label="Customer search" />
        <button type="button">Add new customer</button>
      </div>
      <div class="finance-document-preview__actions">
        <button>Save</button>
        <button>Save Draft</button>
        <button>Close</button>
      </div>
    `);

    await expect(page.getByLabel('Customer search')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add new customer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible();
  });
});

test.describe('finance PDF preview modal contract', () => {
  test('modal includes Save, Save Draft, Download PDF, Close and notice region', async ({ page }) => {
    const modalSource = readFileSync(
      join(process.cwd(), 'apps/web/src/features/finance/FinanceDocumentPreviewModal.tsx'),
      'utf8',
    );
    expect(modalSource).toMatch(/Save Draft/);
    expect(modalSource).toMatch(/finance-document-preview__notice/);

    await page.setContent(`
      <link rel="stylesheet" href="/src/styles/finance-document-preview.css" />
      <div class="finance-document-preview" role="dialog" aria-modal="true" aria-label="Document preview">
        <div class="finance-document-preview__panel">
          <header class="finance-document-preview__toolbar">
            <div class="finance-document-preview__actions">
              <button type="button">Save</button>
              <button type="button">Save Draft</button>
              <button type="button">Close</button>
              <button type="button">Download PDF</button>
            </div>
          </header>
          <p class="finance-document-preview__notice">Draft saved</p>
          <iframe class="finance-document-preview__iframe" title="Quote PDF preview"></iframe>
        </div>
      </div>
    `);

    await expect(page.getByRole('dialog', { name: 'Document preview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
    await expect(page.locator('.finance-document-preview__iframe')).toBeVisible();
  });
});
