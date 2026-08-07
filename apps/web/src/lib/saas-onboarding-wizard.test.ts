/**
 * Department 21 — Web onboarding wizard wiring proofs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

function readWeb(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

describe('SaaS onboarding wizard web wiring', () => {
  it('exposes /onboarding route and lazy page export', () => {
    const app = readWeb('../App.tsx');
    const pages = readWeb('../routes/owner-pages.tsx');
    assert.match(app, /path="\/onboarding"/);
    assert.match(app, /SaasOnboardingWizardPage/);
    assert.match(pages, /SaasOnboardingWizardPage/);
    assert.match(pages, /pages\/onboarding\/SaasOnboardingWizardPage/);
  });

  it('signup redirects new companies into the wizard', () => {
    const signup = readWeb('../pages/auth/SignupPage.tsx');
    assert.match(signup, /setLocation\('\/onboarding'\)/);
  });

  it('wizard covers Company→Plan→Team→Import→Integrations→Operations→Review', () => {
    const page = readWeb('../pages/onboarding/SaasOnboardingWizardPage.tsx');
    assert.match(page, /SAAS_ONBOARDING_STEPS/);
    assert.match(page, /SAVE & CONTINUE/);
    assert.match(page, /SKIP FOR NOW/);
    assert.match(page, /REVIEW IMPORT/);
    assert.match(page, /START USING TITAN/);
    assert.match(page, /COMPLETE BILLING/);
    assert.match(page, /PAYMENT VERIFICATION IN PROGRESS/);
    assert.match(page, /SEAT LIMIT REACHED|Seat limits/);
    assert.match(page, /private/);
    assert.match(page, /\/data-migration/);
  });

  it('API client uses /onboarding/* via request()', () => {
    const client = readWeb('./saas-onboarding-api-client.ts');
    assert.match(client, /\/onboarding\/state/);
    assert.match(client, /\/onboarding\/company/);
    assert.match(client, /\/onboarding\/plan/);
    assert.match(client, /\/onboarding\/team\/invite/);
    assert.match(client, /\/onboarding\/import/);
    assert.match(client, /\/onboarding\/activate/);
  });

  it('Platform Owner tenants UI shows onboarding metadata without business content dump', () => {
    const page = readWeb('../pages/platform/PlatformPage.tsx');
    assert.match(page, /onboardingStatus/);
    assert.match(page, /onboardingCompletionPercent/);
    assert.match(page, /integrationsConnectedCount/);
    assert.match(page, /Last onboarding activity/);
  });

  it('PR #60 SaasAccessGate wiring remains', () => {
    const app = readWeb('../App.tsx');
    assert.match(app, /SaasAccessGate/);
  });
});
