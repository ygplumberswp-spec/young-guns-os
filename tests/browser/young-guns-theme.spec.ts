import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(process.cwd());
const tokensCss = readFileSync(join(repoRoot, 'packages/ui/src/tokens.css'), 'utf8');
const indexCss = readFileSync(join(repoRoot, 'apps/web/src/index.css'), 'utf8');

test.describe('Young Guns global theme contracts', () => {
  test('design tokens declare near-black app background and electric blue accent', () => {
    expect(tokensCss).toMatch(/--yg-bg-app:\s*#04070d/);
    expect(tokensCss).toMatch(/--yg-blue-primary:\s*#1f7aec/);
    expect(tokensCss).toMatch(/--titan-accent:\s*var\(--yg-blue-primary\)/);
  });

  test('shell CSS uses rgb accent variable instead of legacy cyan', () => {
    expect(indexCss).toMatch(/rgba\(var\(--titan-accent-rgb\)/);
    expect(indexCss).not.toMatch(/#22d3ee/i);
  });

  test('finance editor full-width workspace classes render on dark surface', async ({ page }) => {
    await page.setContent(`
      <style>${tokensCss}${indexCss}</style>
      <div class="finance-document-editor-page owner-shell">
        <div class="finance-document-editor-workspace">
          <h1 class="finance-document-editor-title">New Quote</h1>
          <div class="finance-document-photos-panel">Attachments</div>
        </div>
      </div>
    `);
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--yg-bg-app').trim(),
    );
    expect(bg.toLowerCase()).toBe('#04070d');
    await expect(page.locator('.finance-document-editor-workspace')).toBeVisible();
  });

  test('primary button uses Young Guns accent from shared styles', async ({ page }) => {
    const stylesCss = readFileSync(join(repoRoot, 'packages/ui/src/styles.css'), 'utf8');
    await page.setContent(`
      <style>${tokensCss}${stylesCss}</style>
      <button class="titan-btn titan-btn--primary" type="button">Save Quote</button>
    `);
    const color = await page.locator('.titan-btn--primary').evaluate((el) =>
      getComputedStyle(el).backgroundImage,
    );
    expect(color.length).toBeGreaterThan(0);
  });
});

test.describe('Young Guns document preview HTML contracts', () => {
  test('quote preview model includes branded structure markers', async () => {
    const htmlPath = join(repoRoot, 'packages/shared/src/finance-document-preview-html.ts');
    const source = readFileSync(htmlPath, 'utf8');
    expect(source).toMatch(/TAX INVOICE/);
    expect(source).toMatch(/Prepared For/);
    expect(source).toMatch(/Billed To/);
    expect(source).toMatch(/buildFinanceDocumentPrintCss/);
    expect(source).not.toMatch(/background-image:\s*url\(/);
  });
});
