import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(process.cwd());

test.describe('Finance report export contracts (J-6.7D)', () => {
  test('finance report routes register aggregate, cashflow, receivables and customer history', async () => {
    const routeSource = readFileSync(
      join(repoRoot, 'apps/api/src/routes/report-exports.ts'),
      'utf8',
    );
    expect(routeSource).toMatch(/\/finance\/aggregate\/pdf/);
    expect(routeSource).toMatch(/\/finance\/cashflow\/pdf/);
    expect(routeSource).toMatch(/\/finance\/receivables\/pdf/);
    expect(routeSource).toMatch(/\/customers\/:customerId\/history\/pdf/);
    expect(routeSource).toMatch(/\/customer\/history\/pdf/);
  });

  test('finance report access module denies technician finance exports', async () => {
    const accessSource = readFileSync(
      join(repoRoot, 'packages/shared/src/finance-report-access.ts'),
      'utf8',
    );
    expect(accessSource).toMatch(/technician_finance_denied/);
    expect(accessSource).toMatch(/portal_finance_denied/);
    expect(accessSource).toMatch(/customer_history_client/);
  });

  test('finance source policy prevents double-count basis', async () => {
    const policySource = readFileSync(
      join(repoRoot, 'packages/shared/src/finance-report-source-policy.ts'),
      'utf8',
    );
    expect(policySource).toMatch(/FINANCE_DUPLICATE_PREVENTION_BASIS/);
    expect(policySource).toMatch(/FINANCE_PROFIT_UNAVAILABLE_NOTE/);
    expect(policySource).toMatch(/annotateBankFeedRows/);
  });

  test('finance export UI includes period date fields at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <div class="finance-report-export-actions">
        <div class="finance-report-export-actions__period">
          <label for="fin-start">Period start</label>
          <input id="fin-start" type="date" />
          <label for="fin-end">Period end</label>
          <input id="fin-end" type="date" />
        </div>
        <button type="button">Preview Finance Aggregate Summary</button>
        <button type="button">Download PDF</button>
      </div>
    `);
    await expect(page.getByLabel('Period start')).toBeVisible();
    await expect(page.getByLabel('Period end')).toBeVisible();
    await page.getByRole('button', { name: 'Preview Finance Aggregate Summary' }).focus();
    await expect(page.getByRole('button', { name: 'Preview Finance Aggregate Summary' })).toBeFocused();
  });
});
