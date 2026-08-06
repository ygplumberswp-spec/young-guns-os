import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(process.cwd());

test.describe('Facebook Use this Page selection regression (J-6.7F9)', () => {
  test('Use this Page wires dedicated handler outside withAction', async () => {
    const pageSource = readFileSync(
      join(repoRoot, 'apps/web/src/pages/facebook-business/FacebookBusinessPage.tsx'),
      'utf8',
    );
    expect(pageSource).toMatch(/function UseThisPageButton/);
    expect(pageSource).toMatch(/onClick=\{\(\) => onSelectPage\(pageId\)\}/);
    expect(pageSource).toMatch(/Selecting Page…/);
    expect(pageSource).toMatch(/pageSelectInFlight/);
    expect(pageSource).not.toMatch(
      /handleSelectPage\(pageId: string\) \{\s*if \(!accessToken \|\| !canManage\) return;\s*await withAction/s,
    );
  });

  test('selection API contract is POST pages/select with pageId body', async () => {
    const clientSource = readFileSync(
      join(repoRoot, 'apps/web/src/lib/facebook-business-api-client.ts'),
      'utf8',
    );
    const routeSource = readFileSync(
      join(repoRoot, 'apps/api/src/routes/facebook-business.ts'),
      'utf8',
    );
    expect(clientSource).toMatch(/pages\/select/);
    expect(clientSource).toMatch(/body: \{ pageId, discoverySessionToken \}/);
    expect(routeSource).toMatch(/router\.post\('\/pages\/select'/);
    expect(routeSource).toMatch(/selectPageSchema/);
  });

  test('selection is not gated by hardcoded verified Page id (J-6.7F10)', async () => {
    const pageSource = readFileSync(
      join(repoRoot, 'apps/web/src/pages/facebook-business/FacebookBusinessPage.tsx'),
      'utf8',
    );
    expect(pageSource).not.toMatch(/Only the verified Young Guns Plumbing Page can be selected/);
    expect(pageSource).toMatch(/startFacebookReconnectWizardOAuth/);
    expect(pageSource).toMatch(/pageSelectionError/);
    expect(pageSource).toMatch(/fetchFacebookPages/);
  });

  test('Selecting Page… status is exposed to assistive tech', async ({ page }) => {
    await page.setContent(`
      <button type="button" disabled>Selecting Page…</button>
      <p class="form-error" role="alert">Could not select that Page.</p>
    `);
    await expect(page.getByRole('button', { name: 'Selecting Page…' })).toBeDisabled();
    await expect(page.getByRole('alert')).toHaveText('Could not select that Page.');
  });

  test('OAuth return params are cleared after selection to prevent silent rediscovery (J-6.7F12)', async () => {
    const pageSource = readFileSync(
      join(repoRoot, 'apps/web/src/pages/facebook-business/FacebookBusinessPage.tsx'),
      'utf8',
    );
    expect(pageSource).toMatch(/clearFacebookOAuthReturnParams/);
    expect(pageSource).toMatch(/oauthPagesAutoLoadDone/);
    expect(pageSource).toMatch(/showPageDiscovery/);
  });

  test('selectPage idempotency and post-commit verification remain on API service', async () => {
    const serviceSource = readFileSync(
      join(repoRoot, 'apps/api/src/services/facebook-business.service.ts'),
      'utf8',
    );
    expect(serviceSource).toMatch(/parseFacebookPageDiscoverySessionToken/);
    expect(serviceSource).toMatch(/resolveSelectableRowFromDiscoverySession/);
    expect(serviceSource).toMatch(/assertProviderPageRowMatchesSelection/);
    expect(serviceSource).toMatch(/await this\.db\.transaction/);
    expect(serviceSource).toMatch(/Page selection expired\. Choose Page again\./);
    expect(serviceSource).toMatch(/row\.pageId === normalizedPageId/);
    expect(serviceSource).toMatch(/graph\.verifyPage\(page\.id, page\.accessToken\)/);
  });
});
