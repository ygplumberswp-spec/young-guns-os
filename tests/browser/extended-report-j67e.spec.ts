import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(process.cwd());

test.describe('Extended report export contracts (J-6.7E)', () => {
  test('extended report routes register inspection, fleet and compliance exports', async () => {
    const routeSource = readFileSync(
      join(repoRoot, 'apps/api/src/routes/report-exports.ts'),
      'utf8',
    );
    expect(routeSource).toMatch(/\/jobs\/:jobId\/inspection\/pdf/);
    expect(routeSource).toMatch(/\/jobs\/:jobId\/compliance-support\/pdf/);
    expect(routeSource).toMatch(/\/fleet\/vehicles\/:vehicleId\/activity\/pdf/);
    expect(routeSource).toMatch(/\/fleet\/operations\/pdf/);
    expect(routeSource).toMatch(/\/compliance\/coc-register\/pdf/);
  });

  test('extended report access module denies technician fleet exports', async () => {
    const accessSource = readFileSync(
      join(repoRoot, 'packages/shared/src/extended-report-access.ts'),
      'utf8',
    );
    expect(accessSource).toMatch(/technician_fleet_denied/);
    expect(accessSource).toMatch(/technician_compliance_register_denied/);
    expect(accessSource).toMatch(/portal_extended_denied/);
  });

  test('extended source policy requires genuine COC linkage', async () => {
    const policySource = readFileSync(
      join(repoRoot, 'packages/shared/src/extended-report-source-policy.ts'),
      'utf8',
    );
    expect(policySource).toMatch(/COMPLIANCE_COC_LEGAL_NOTICE/);
    expect(policySource).toMatch(/resolveCocAttachmentState/);
    expect(policySource).toMatch(/FLEET_STORED_DATA_NOTE/);
  });

  test('extended export UI includes period date fields at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <div class="extended-report-export-actions">
        <div class="extended-report-export-actions__period">
          <label for="ext-start">Period start</label>
          <input id="ext-start" type="date" />
          <label for="ext-end">Period end</label>
          <input id="ext-end" type="date" />
        </div>
        <button type="button">Preview Fleet Operations Summary</button>
        <button type="button">Download PDF</button>
      </div>
    `);
    await expect(page.getByLabel('Period start')).toBeVisible();
    await expect(page.getByLabel('Period end')).toBeVisible();
    await page.getByRole('button', { name: 'Preview Fleet Operations Summary' }).focus();
    await expect(page.getByRole('button', { name: 'Preview Fleet Operations Summary' })).toBeFocused();
  });
});
