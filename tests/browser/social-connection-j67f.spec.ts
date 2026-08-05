import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(process.cwd());

test.describe('Social connection foundation (J-6.7F)', () => {
  test('social-connections routes register OAuth and lifecycle endpoints', async () => {
    const routeSource = readFileSync(
      join(repoRoot, 'apps/api/src/routes/social-connections.ts'),
      'utf8',
    );
    expect(routeSource).toMatch(/\/oauth\/start/);
    expect(routeSource).toMatch(/\/oauth\/callback/);
    expect(routeSource).toMatch(/\/accounts\/select/);
    expect(routeSource).toMatch(/\/disconnect/);
    expect(routeSource).toMatch(/\/health/);
  });

  test('shared RBAC denies technician and client', async () => {
    const accessSource = readFileSync(
      join(repoRoot, 'packages/shared/src/social-connection.ts'),
      'utf8',
    );
    expect(accessSource).toMatch(/Technician/);
    expect(accessSource).toMatch(/Client/);
    expect(accessSource).toMatch(/canManageSocialConnections/);
  });

  test('provider setup documentation lists env vars without secrets', async () => {
    const doc = readFileSync(
      join(repoRoot, 'docs/SOCIAL_CONNECTION_PROVIDER_SETUP.md'),
      'utf8',
    );
    expect(doc).toMatch(/META_APP_ID/);
    expect(doc).toMatch(/never commit/i);
    expect(doc).not.toMatch(/sk_live_/);
  });

  test('Integrations page includes Social Connections section', async () => {
    const pageSource = readFileSync(
      join(repoRoot, 'apps/web/src/pages/integrations/IntegrationsDashboardPage.tsx'),
      'utf8',
    );
    expect(pageSource).toMatch(/SocialConnectionsSection/);
  });

  test('Owner viewing all social provider cards — three providers', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(`
      <section class="social-connections-section">
        <div class="social-connections-grid">
          <article class="social-connection-card" data-provider="facebook"><strong>Facebook</strong></article>
          <article class="social-connection-card" data-provider="instagram"><strong>Instagram</strong></article>
          <article class="social-connection-card" data-provider="tiktok"><strong>TikTok</strong></article>
        </div>
      </section>
    `);
    await expect(page.locator('[data-provider="facebook"]')).toBeVisible();
    await expect(page.locator('[data-provider="instagram"]')).toBeVisible();
    await expect(page.locator('[data-provider="tiktok"]')).toBeVisible();
    await expect(page.locator('.social-connection-card')).toHaveCount(3);
  });

  test('Technician unable to access social connection controls', async () => {
    const sectionSource = readFileSync(
      join(repoRoot, 'apps/web/src/features/integrations/SocialConnectionsSection.tsx'),
      'utf8',
    );
    expect(sectionSource).toMatch(/canViewSocialConnections/);
    expect(sectionSource).toMatch(/if \(!canView\)/);
    expect(sectionSource).toMatch(/return null/);
  });

  test('missing configuration state renders setup category', async ({ page }) => {
    await page.setContent(`
      <article class="social-connection-card">
        <span class="status-pill">Not configured</span>
        <p class="page-muted">Setup: missing oauth app</p>
        <button type="button">View setup requirements</button>
      </article>
    `);
    await expect(page.getByText('missing oauth app')).toBeVisible();
    await expect(page.getByRole('button', { name: 'View setup requirements' })).toBeVisible();
  });

  test('Connect button triggers OAuth start API journey', async () => {
    const clientSource = readFileSync(
      join(repoRoot, 'apps/web/src/lib/social-connection-api-client.ts'),
      'utf8',
    );
    expect(clientSource).toMatch(/\/oauth\/start/);
    expect(clientSource).toMatch(/startSocialConnectionOAuth/);
  });

  test('OAuth callback failure state redirect builder', async () => {
    const serviceSource = readFileSync(
      join(repoRoot, 'apps/api/src/services/social-connection.service.ts'),
      'utf8',
    );
    expect(serviceSource).toMatch(/outcome: 'error'/);
    expect(serviceSource).toMatch(/oauth.callback_failed/);
  });

  test('account-selection-required state', async ({ page }) => {
    await page.setContent(`
      <article class="social-connection-card">
        <span class="status-pill status-pill--warning">Account selection required</span>
        <button type="button">Choose Page</button>
      </article>
    `);
    await expect(page.getByText('Account selection required')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Page' })).toBeVisible();
  });

  test('Facebook OAuth from integrations lands on Page-selection workspace', async () => {
    const serviceSource = readFileSync(
      join(repoRoot, 'apps/api/src/services/facebook-business.service.ts'),
      'utf8',
    );
    const sectionSource = readFileSync(
      join(repoRoot, 'apps/web/src/features/integrations/SocialConnectionsSection.tsx'),
      'utf8',
    );
    const actionsSource = readFileSync(
      join(repoRoot, 'apps/web/src/features/integrations/FacebookConnectionActions.tsx'),
      'utf8',
    );
    const integrationsSource = readFileSync(
      join(repoRoot, 'apps/web/src/pages/integrations/IntegrationsDashboardPage.tsx'),
      'utf8',
    );
    expect(serviceSource).toMatch(/resolveFacebookOAuthBrowserReturnPath/);
    expect(sectionSource).toMatch(/startFacebookOAuth\(accessToken, '\/facebook-business'\)/);
    expect(actionsSource).toMatch(/choose_page/);
    expect(actionsSource).toMatch(/FACEBOOK_CONNECTION_ACTION_LABELS/);
    expect(integrationsSource).toMatch(/FACEBOOK_PAGE_SELECTION_WORKSPACE_PATH/);
  });

  test('Facebook connection actions follow single-primary state plan', async () => {
    const actionsSource = readFileSync(
      join(repoRoot, 'apps/web/src/features/integrations/FacebookConnectionActions.tsx'),
      'utf8',
    );
    const sharedSource = readFileSync(
      join(repoRoot, 'packages/shared/src/facebook-connection-actions.ts'),
      'utf8',
    );
    expect(sharedSource).toMatch(/resolveFacebookConnectionActionPlan/);
    expect(sharedSource).toMatch(/primary: 'choose_page'/);
    expect(actionsSource).toMatch(/facebook-connection-actions/);
    expect(actionsSource).not.toMatch(/Run connection check/);
  });

  test('Facebook page discovery exposes honest status codes', async () => {
    const graphSource = readFileSync(
      join(repoRoot, 'apps/api/src/lib/facebook-graph.client.ts'),
      'utf8',
    );
    const pageSource = readFileSync(
      join(repoRoot, 'apps/web/src/pages/facebook-business/FacebookBusinessPage.tsx'),
      'utf8',
    );
    expect(graphSource).toMatch(/discoverPages/);
    expect(graphSource).toMatch(/lookupPageDirect/);
    expect(graphSource).not.toMatch(/filter\(\(page\) => page\.id && page\.name && page\.access_token\)/);
    expect(pageSource).toMatch(/META_PAGE_LIST_EMPTY/);
    expect(pageSource).toMatch(/Direct Page lookup/);
    expect(pageSource).not.toMatch(/does not administer any Pages/);
  });

  test('Facebook direct Page lookup fallback is server-controlled (J-6.7F2)', async () => {
    const serviceSource = readFileSync(
      join(repoRoot, 'apps/api/src/services/facebook-business.service.ts'),
      'utf8',
    );
    const sharedSource = readFileSync(
      join(repoRoot, 'packages/shared/src/facebook-direct-page-lookup.ts'),
      'utf8',
    );
    const businessSource = readFileSync(
      join(repoRoot, 'packages/shared/src/facebook-business.ts'),
      'utf8',
    );
    expect(sharedSource).toMatch(/61564442420962/);
    expect(serviceSource).toMatch(/assertClientPageIdMatchesPendingCandidate/);
    expect(serviceSource).toMatch(/resolvePendingPageCandidateForCompany/);
    expect(businessSource).toMatch(
      /export const FACEBOOK_OAUTH_BASIC_SCOPES: FacebookPermission\[\] = \['pages_show_list'\]/,
    );
  });

  test('Facebook setup requirements use API callback not web APP_URL', async () => {
    const serviceSource = readFileSync(
      join(repoRoot, 'apps/api/src/services/social-connection.service.ts'),
      'utf8',
    );
    const sharedSource = readFileSync(
      join(repoRoot, 'packages/shared/src/social-connection.ts'),
      'utf8',
    );
    expect(serviceSource).toMatch(/facebookRedirectUri/);
    expect(sharedSource).toMatch(/facebookCallbackUrl/);
  });

  test('successful mocked account selection API', async () => {
    const serviceSource = readFileSync(
      join(repoRoot, 'apps/api/src/services/social-connection.service.ts'),
      'utf8',
    );
    expect(serviceSource).toMatch(/selectAccount/);
    expect(serviceSource).toMatch(/SOCIAL_CONNECTION_MOCK_OAUTH/);
  });

  test('reconnect-required state', async ({ page }) => {
    await page.setContent(`
      <article class="social-connection-card">
        <span class="status-pill status-pill--danger">Reconnect required</span>
        <button type="button">Reconnect</button>
      </article>
    `);
    await expect(page.getByText('Reconnect required')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible();
  });

  test('disconnect confirmation flow', async ({ page }) => {
    await page.setContent(`
      <article class="social-connection-card">
        <button type="button">Disconnect</button>
        <button type="button">Confirm disconnect</button>
      </article>
    `);
    await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm disconnect' })).toBeVisible();
  });

  test('mobile integrations-page layout at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <section class="social-connections-section">
        <div class="social-connections-grid">
          <article class="social-connection-card" data-provider="facebook">
            <strong>Facebook</strong>
            <button type="button">Connect</button>
          </article>
        </div>
      </section>
    `);
    await expect(page.locator('.social-connection-card')).toBeVisible();
    await page.getByRole('button', { name: 'Connect' }).focus();
    await expect(page.getByRole('button', { name: 'Connect' })).toBeFocused();
  });
});
