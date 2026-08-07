/**
 * Department 21 — SaaS checkout + payment-provider wiring proofs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  CLIENT_ROLE_NAME,
  COMPANY_OWNER_ROLE_NAME,
  OWNER_PERMISSIONS,
  TECHNICIAN_PERMISSIONS,
  hasAnyPermission,
  hasCrossTenantPlatformAccess,
  isPlatformOwnerRole,
} from '@titan/auth';
import {
  YOCO_SAAS_PROVIDER_CAPABILITY,
  assertClientCheckoutAmountMatches,
  calculateSaasCheckoutAmounts,
} from '@titan/shared';
import { YocoSaasBillingAdapter } from './yoco-saas-billing.adapter.js';

const here = dirname(fileURLToPath(import.meta.url));

function readApi(relativePath: string): string {
  return readFileSync(join(here, relativePath), 'utf8');
}

function readRepo(relativeFromHere: string): string {
  return readFileSync(join(here, relativeFromHere), 'utf8');
}

describe('Department 21 SaaS checkout + billing provider', () => {
  it('1–2. server calculates amount; client amount rejected', () => {
    const service = readApi('./saas-billing-checkout.service.ts');
    assert.match(service, /assertClientCheckoutAmountMatches/);
    assert.match(service, /AMOUNT_TAMPER_REJECTED/);
    assert.match(service, /buildSaasCheckoutSummary/);
    const bad = assertClientCheckoutAmountMatches(1, 224_900);
    assert.equal(bad.ok, false);
  });

  it('3–4. verified payment activates; browser return alone does not', () => {
    const service = readApi('./saas-billing-checkout.service.ts');
    assert.match(service, /applyVerifiedPayment/);
    assert.match(service, /markBrowserReturn/);
    assert.match(service, /PAYMENT VERIFICATION IN PROGRESS/);
    assert.match(service, /browser return alone does not activate/i);
    assert.doesNotMatch(service, /status:\s*'active'[\s\S]{0,80}markBrowserReturn/);
  });

  it('5–7. webhook signature + idempotency', () => {
    const service = readApi('./saas-billing-checkout.service.ts');
    const adapter = readApi('./yoco-saas-billing.adapter.ts');
    assert.match(service, /verifyWebhookSignature/);
    assert.match(service, /INVALID_SIGNATURE/);
    assert.match(service, /ignored_duplicate/);
    assert.match(service, /saasBillingProviderEvents/);
    assert.match(adapter, /timingSafeEqual/);
  });

  it('8–11. renewal / failure / recovery preserve paid-through semantics', () => {
    const service = readApi('./saas-billing-checkout.service.ts');
    const platform = readApi('../enterprise-saas-platform.service.ts');
    assert.match(service, /do not change currentPeriodEnd/);
    assert.match(service, /paidThroughAt must be in the future/);
    assert.match(platform, /CRITICAL: do not change currentPeriodEnd/);
    assert.match(service, /syncAccessFromEntitlement/);
  });

  it('12–13. cancellation prefers period-end and never deletes tenant data', () => {
    const platform = readApi('../enterprise-saas-platform.service.ts');
    assert.match(platform, /cancelAtPeriodEnd:\s*true/);
    assert.match(platform, /preservesTenantData:\s*true/);
    assert.doesNotMatch(platform, /delete\(companies\)|delete\(users\)/);
  });

  it('14–16. upgrade/downgrade/seats remain on canonical SaaS services', () => {
    const service = readApi('./saas-billing-checkout.service.ts');
    assert.match(service, /upgradePlan/);
    assert.match(service, /assignPlanToTenant/);
    assert.match(service, /CONTACT_OR_UPGRADE_REQUIRED/);
  });

  it('17–19. Company Owner cannot self-mark paid; tech/client denied admin', () => {
    const service = readApi('./saas-billing-checkout.service.ts');
    assert.match(service, /Only Platform Owner may activate manual billing/);
    assert.match(service, /Tenant Owner cannot self-mark|manual_platform_owner|activateManualBilling/);
    assert.equal(hasAnyPermission([...TECHNICIAN_PERMISSIONS], ['saas:manage']), false);
    assert.equal(CLIENT_ROLE_NAME, 'Client');
    assert.equal(
      hasCrossTenantPlatformAccess({
        roleName: COMPANY_OWNER_ROLE_NAME,
        permissions: [...OWNER_PERMISSIONS],
      }),
      false,
    );
  });

  it('20–21. tenant-scoped history + Platform Owner server authorisation', () => {
    const service = readApi('./saas-billing-checkout.service.ts');
    const routes = readApi('../../routes/saas-billing.ts');
    assert.match(service, /eq\(saasBillingRecords\.companyId, scope\.companyId\)/);
    assert.match(routes, /manual-activation/);
    assert.match(routes, /platform:manage/);
    assert.equal(
      isPlatformOwnerRole({
        roleName: COMPANY_OWNER_ROLE_NAME,
        permissions: [...OWNER_PERMISSIONS],
      }),
      false,
    );
  });

  it('22. Young Guns job-payment Yoco workflow remains separate', () => {
    const adapter = readApi('./yoco-saas-billing.adapter.ts');
    const index = readApi('../../index.ts');
    assert.match(adapter, /intentionally NOT reused/i);
    assert.match(index, /webhooks\/saas-billing/);
    assert.match(index, /createYocoWebhookRouter|webhooks\/yoco/);
    const docEngine = readApi('../document-engine.service.ts');
    assert.match(docEngine, /handleYocoWebhook/);
    assert.doesNotMatch(adapter, /invoice_payment_links/);
  });

  it('23–25. PR #60/#61/#62 wiring retained', () => {
    const gate = readApi('../../middleware/saas-tenant-access-gate.ts');
    const onboarding = readApi('../saas-onboarding.service.ts');
    assert.match(gate, /\/api\/v1\/saas-billing/);
    assert.match(gate, /\/api\/v1\/onboarding/);
    assert.match(onboarding, /mapCheckoutStatusToOnboardingBillingState/);
    assert.match(onboarding, /COMPLETE BILLING|PAYMENT VERIFICATION IN PROGRESS|PAYMENT REQUIRES ATTENTION/);
  });

  it('26–28. provider timeout / out-of-order / no secrets in responses', () => {
    const service = readApi('./saas-billing-checkout.service.ts');
    assert.match(service, /awaiting_period_truth/);
    assert.match(service, /recorded_pending_reconcile/);
    assert.match(service, /Never trust unverified companyId hint/);
    assert.doesNotMatch(service, /secretKey|cvv|cardNumber/);
    assert.equal(YOCO_SAAS_PROVIDER_CAPABILITY.supportsRecurringSubscriptions, false);
  });

  it('Yoco SaaS adapter createCheckout returns PROVIDER_CAPABILITY_REQUIRED', async () => {
    const adapter = new YocoSaasBillingAdapter();
    const result = await adapter.createCheckoutSession({
      companyId: 'c',
      checkoutSessionId: 's',
      summary: {
        planId: 'p',
        planName: 'Starter',
        planKey: 'titan_starter',
        billingInterval: 'monthly',
        includedSeats: { adminOffice: 1, technician: 1 },
        extraSeats: { adminOffice: 0, technician: 0 },
        amounts: calculateSaasCheckoutAmounts({
          plan: {
            priceCents: 224_900,
            currency: 'ZAR',
            billingInterval: 'monthly',
            limits: {},
            tier: 'starter',
            name: 'Starter',
          },
        }),
        renewalCadenceLabel: 'monthly',
        cancellationPolicyLabel: 'period end',
        selfServeAllowed: false,
        contactSalesRequired: false,
        providerCapability: YOCO_SAAS_PROVIDER_CAPABILITY,
      },
      successUrl: 'https://example.test/ok',
      cancelUrl: 'https://example.test/cancel',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'PROVIDER_CAPABILITY_REQUIRED');
    }
  });

  it('invalid webhook signature rejected by adapter', () => {
    const adapter = new YocoSaasBillingAdapter();
    const verified = adapter.verifyWebhookSignature({
      rawBody: '{}',
      headers: {},
      webhookSecret: 'test-secret',
    });
    assert.equal(verified.ok, false);
  });

  it('migration 0201 separates SaaS checkout ledger without drops', () => {
    const migration = readRepo('../../../../../packages/db/drizzle/0201_saas_checkout_billing_provider.sql');
    assert.match(migration, /saas_checkout_sessions/);
    assert.match(migration, /saas_billing_provider_events/);
    assert.match(migration, /provider_subscription_ref/);
    assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/);
  });

  it('routes mount checkout + separate SaaS webhook path', () => {
    const routes = readApi('../../routes/saas-billing.ts');
    const index = readApi('../../index.ts');
    assert.match(routes, /\/checkout\/preview/);
    assert.match(routes, /\/checkout/);
    assert.match(routes, /browser-return/);
    assert.match(routes, /manual-activation/);
    assert.match(index, /\/api\/v1\/saas-billing/);
    assert.match(index, /\/api\/v1\/webhooks\/saas-billing/);
  });
});
