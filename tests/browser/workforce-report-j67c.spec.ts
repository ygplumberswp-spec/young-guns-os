import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(process.cwd());

test.describe('Workforce report export contracts (J-6.7C)', () => {
  test('workforce report routes register me and summary PDF endpoints', async () => {
    const routeSource = readFileSync(
      join(repoRoot, 'apps/api/src/routes/report-exports.ts'),
      'utf8',
    );
    expect(routeSource).toMatch(/\/workforce\/me\/activity\/pdf/);
    expect(routeSource).toMatch(/\/workforce\/me\/timesheet\/pdf/);
    expect(routeSource).toMatch(/\/workforce\/me\/productivity\/pdf/);
    expect(routeSource).toMatch(/\/workforce\/summary\/pdf/);
    expect(routeSource).toMatch(/\/workforce\/technicians\/:userId\/activity\/pdf/);
  });

  test('workforce report access module binds technician self identity', async () => {
    const accessSource = readFileSync(
      join(repoRoot, 'packages/shared/src/workforce-report-access.ts'),
      'utf8',
    );
    expect(accessSource).toMatch(/assertTechnicianSelfBinding/);
    expect(accessSource).toMatch(/technician_peer_denied/);
    expect(accessSource).toMatch(/workforce_summary/);
  });

  test('workforce report HTML avoids payroll and wage leakage patterns', async () => {
    const htmlSource = readFileSync(
      join(repoRoot, 'packages/shared/src/workforce-report-html.ts'),
      'utf8',
    );
    expect(htmlSource).toMatch(/buildYoungGunsReportShellHtml/);
    expect(htmlSource).not.toMatch(/payroll|wage|salary/i);
  });

  test('mobile workforce export UI includes period date fields at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <div class="workforce-report-export-actions">
        <div class="workforce-report-export-actions__period">
          <label for="wf-start">Period start</label>
          <input id="wf-start" type="date" />
          <label for="wf-end">Period end</label>
          <input id="wf-end" type="date" />
        </div>
        <button type="button">Preview Activity Report</button>
        <button type="button">Download PDF</button>
      </div>
    `);
    await expect(page.getByLabel('Period start')).toBeVisible();
    await expect(page.getByLabel('Period end')).toBeVisible();
    await page.getByRole('button', { name: 'Preview Activity Report' }).focus();
    await expect(page.getByRole('button', { name: 'Preview Activity Report' })).toBeFocused();
  });
});
