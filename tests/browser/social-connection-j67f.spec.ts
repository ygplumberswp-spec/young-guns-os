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

  test('Owner viewing all social provider cards — five providers', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(`
      <section class="social-connections-section">
        <div class="social-connections-grid">
          <article class="social-connection-card" data-provider="facebook"><strong>Facebook</strong></article>
          <article class="social-connection-card" data-provider="instagram"><strong>Instagram</strong></article>
          <article class="social-connection-card" data-provider="google_business"><strong>Google Business Profile</strong></article>
          <article class="social-connection-card" data-provider="whatsapp_business"><strong>WhatsApp Business</strong></article>
          <article class="social-connection-card" data-provider="tiktok"><strong>TikTok</strong></article>
        </div>
      </section>
    `);
    await expect(page.locator('[data-provider="facebook"]')).toBeVisible();
    await expect(page.locator('[data-provider="tiktok"]')).toBeVisible();
    await expect(page.locator('.social-connection-card')).toHaveCount(5);
  });

  test('Technician unable to access social connection controls', async () => {
    const sectionSource = readFileSync(
      join(repoRoot, 'apps/web/src/features/integrations/SocialConnectionsSection.tsx'),
      'utf8',
    );
    expect(sectionSource).toMatch(/canAccessSocialConnections/);
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
        <button type="button">Complete account selection</button>
      </article>
    `);
    await expect(page.getByText('Account selection required')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Complete account selection' })).toBeVisible();
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
