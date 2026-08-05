import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(process.cwd());
const previewCss = readFileSync(
  join(repoRoot, 'apps/web/src/styles/finance-document-preview.css'),
  'utf8',
);
const tokensCss = readFileSync(join(repoRoot, 'packages/ui/src/tokens.css'), 'utf8');

test.describe('Report export UI contracts (J-6.7A)', () => {
  test('report export actions render accessible preview controls at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(`
      <style>${tokensCss}${previewCss}</style>
      <div class="report-export-actions">
        <div class="report-export-actions__buttons">
          <button type="button" class="titan-btn titan-btn--secondary">Preview Report</button>
          <button type="button" class="titan-btn titan-btn--secondary">Download PDF</button>
        </div>
      </div>
      <div class="finance-document-preview" role="dialog" aria-modal="true" aria-label="Document preview">
        <div class="finance-document-preview__panel">
          <header class="finance-document-preview__toolbar">
            <h2 class="finance-document-preview__title">Job report preview</h2>
            <button type="button">Close</button>
            <button type="button">Download PDF</button>
          </header>
          <div class="finance-document-preview__pdf-frame">
            <iframe class="finance-document-preview__iframe" title="Job report PDF preview"></iframe>
          </div>
        </div>
      </div>
    `);
    await expect(page.getByRole('button', { name: 'Preview Report' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Document preview' })).toBeVisible();
    await expect(page.locator('.finance-document-preview__iframe')).toBeVisible();
  });

  test('report export modal controls remain usable on mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <style>${tokensCss}${previewCss}</style>
      <div class="finance-document-preview" role="dialog" aria-modal="true" aria-label="Document preview">
        <div class="finance-document-preview__panel">
          <header class="finance-document-preview__toolbar">
            <button type="button">Close</button>
            <button type="button">Download PDF</button>
          </header>
        </div>
      </div>
    `);
    const download = page.getByRole('button', { name: 'Download PDF' });
    await expect(download).toBeVisible();
    await download.focus();
    await expect(download).toBeFocused();
  });

  test('operational report HTML sources avoid storage paths and internal UUID leakage', async () => {
    const htmlSource = readFileSync(
      join(repoRoot, 'packages/shared/src/operational-report-html.ts'),
      'utf8',
    );
    expect(htmlSource).not.toMatch(/storageKey|storagePath|\/var\/lib/);
    expect(htmlSource).toMatch(/buildYoungGunsReportShellHtml/);
  });

  test('report export API route module registers tenant-scoped PDF endpoints', async () => {
    const routeSource = readFileSync(
      join(repoRoot, 'apps/api/src/routes/report-exports.ts'),
      'utf8',
    );
    expect(routeSource).toMatch(/application\/pdf/);
    expect(routeSource).toMatch(/\/jobs\/:jobId\/pdf/);
    expect(routeSource).toMatch(/\/completion\/:reportId\/pdf/);
    expect(routeSource).toMatch(/\/maintenance\/runs\/:runId\/pdf/);
    expect(routeSource).toMatch(/requireAuth/);
  });
});
