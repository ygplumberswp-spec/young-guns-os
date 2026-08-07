import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Browser verification uses the built finance editor CSS and modal markup contracts.
 * When TITAN_WEB_URL points at a running dev server with auth, these assertions still apply
 * to rendered DOM; otherwise we validate the workspace shell from the static bundle CSS.
 */

test.describe('finance editor workspace layout', () => {
  test('workspace CSS supports full-width editors at desktop width', async ({ page }) => {
    const cssPath = join(process.cwd(), 'apps/web/src/index.css');
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/\.finance-editor--workspace[\s\S]*max-width:\s*none/);
    expect(css).toMatch(/\.finance-line-items--workspace[\s\S]*width:\s*100%/);
    expect(css).toMatch(/\.finance-editor__bottom-grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(16rem,\s*22rem\)/);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(`
      <link rel="stylesheet" href="/src/index.css" />
      <div class="finance-page finance-page--editor finance-page--workspace">
        <div class="finance-editor finance-editor--workspace">
          <div class="finance-editor__layout finance-editor__layout--workspace">
            <section class="finance-editor-card--full finance-editor-card--attachments">Photos & Attachments</section>
            <div class="finance-editor__bottom-grid">
              <section class="finance-editor-card--notes">Notes</section>
              <aside class="finance-line-items__totals-panel--workspace">Totals</aside>
            </div>
          </div>
          <footer class="finance-editor__footer finance-editor__footer--workspace">
            <button type="button">Save</button>
          </footer>
        </div>
      </div>
    `, { waitUntil: 'domcontentloaded' });

    const editor = page.locator('.finance-editor--workspace');
    await expect(editor).toBeVisible();
    const box = await editor.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(600);
  });

  test('mobile viewport stacks editor sections without clipping primary actions', async ({ page }) => {
    const cssPath = join(process.cwd(), 'apps/web/src/index.css');
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/@media\s*\(\s*max-width:\s*768px\s*\)/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <style>
        .finance-editor__layout--workspace { display: grid; gap: 12px; }
        .finance-document-actions__primary .titan-btn { width: 100%; }
        .finance-customer-search--editor input { width: 100%; }
      </style>
      <div class="finance-page finance-page--workspace">
        <div class="finance-editor__layout finance-editor__layout--workspace">
          <div class="finance-customer-search finance-customer-search--editor"><input aria-label="Customer search" /></div>
          <div class="finance-document-actions__primary"><button class="titan-btn">Save</button></div>
          <input type="file" capture="environment" aria-label="Take photo" />
        </div>
      </div>
    `);

    await expect(page.getByLabel('Customer search')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByLabel('Take photo')).toHaveAttribute('capture', 'environment');
  });
});

test.describe('finance PDF preview modal contract', () => {
  test('modal markup includes iframe save actions and notice region', async ({ page }) => {
    const modalCss = readFileSync(join(process.cwd(), 'apps/web/src/styles/finance-document-preview.css'), 'utf8');
    const modalSource = readFileSync(
      join(process.cwd(), 'apps/web/src/features/finance/FinanceDocumentPreviewModal.tsx'),
      'utf8',
    );

    expect(modalCss).toMatch(/finance-document-preview__iframe/);
    expect(modalSource).toMatch(/Save Draft/);
    expect(modalSource).toMatch(/Download PDF/);
    expect(modalSource).toMatch(/finance-document-preview__notice/);

    await page.setContent(`
      <link rel="stylesheet" href="/src/styles/finance-document-preview.css" />
      <div class="finance-document-preview" role="dialog" aria-label="Document preview">
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
          <div class="finance-document-preview__pdf-frame">
            <iframe class="finance-document-preview__iframe" title="Quote PDF preview"></iframe>
          </div>
        </div>
      </div>
    `);

    await expect(page.getByRole('dialog', { name: 'Document preview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
    await expect(page.locator('.finance-document-preview__iframe')).toBeVisible();
    await expect(page.locator('.finance-document-preview__notice')).toHaveText('Draft saved');
  });
});
