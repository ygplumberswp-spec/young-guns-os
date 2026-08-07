/**
 * Department 21 — Web SaaS checkout / billing UI wiring proofs.
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

describe('SaaS billing checkout web wiring', () => {
  it('billing page exposes checkout summary, history, cancel-at-period-end', () => {
    const page = readWeb('../pages/settings/OwnerBillingPage.tsx');
    assert.match(page, /COMPLETE BILLING/);
    assert.match(page, /PROVIDER CAPABILITY REQUIRED/);
    assert.match(page, /PAYMENT VERIFICATION IN PROGRESS/);
    assert.match(page, /createSaasCheckout/);
    assert.match(page, /Cancel at period end/);
    assert.match(page, /Billing history/);
  });

  it('onboarding links COMPLETE BILLING and truthful states', () => {
    const page = readWeb('../pages/onboarding/SaasOnboardingWizardPage.tsx');
    assert.match(page, /COMPLETE BILLING/);
    assert.match(page, /PAYMENT VERIFICATION IN PROGRESS/);
    assert.match(page, /PAYMENT REQUIRES ATTENTION/);
    assert.match(page, /SUBSCRIPTION ACTIVE/);
    assert.match(page, /\/settings\/billing/);
  });

  it('API client uses /saas-billing/* and never posts client-authoritative paid', () => {
    const client = readWeb('./saas-billing-api-client.ts');
    assert.match(client, /\/saas-billing\/checkout/);
    assert.match(client, /\/saas-billing\/history/);
    assert.match(client, /manual-activation/);
    assert.doesNotMatch(client, /markPaid|selfMarkPaid/);
  });

  it('PR #62 onboarding route and PR #60 gate remain', () => {
    const app = readWeb('../App.tsx');
    assert.match(app, /path="\/onboarding"/);
    assert.match(app, /SaasAccessGate/);
  });
});
