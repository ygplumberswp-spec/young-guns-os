/**
 * Department 21 — SaaS checkout amount/tax/provider capability proofs.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  YOCO_SAAS_PROVIDER_CAPABILITY,
  assertClientCheckoutAmountMatches,
  buildSaasCheckoutSummary,
  calculateSaasCheckoutAmounts,
  mapCheckoutStatusToOnboardingBillingState,
} from './saas-billing-checkout.js';
import type { SaasSubscriptionPlanSummary } from './enterprise-saas-platform.js';

const starterPlan: SaasSubscriptionPlanSummary = {
  id: '11111111-1111-1111-1111-111111111111',
  planKey: 'titan_starter',
  name: 'TITAN Starter',
  description: 'Starter',
  tier: 'starter',
  priceCents: 224_900,
  billingInterval: 'monthly',
  features: [],
  limits: {
    seats: { adminOffice: 1, technician: 1, total: null },
    extraSeatPricing: {
      technicianCents: 49_900,
      adminOfficeCents: 39_900,
      currency: 'ZAR',
      pricingConfigurable: true,
    },
  },
  isActive: true,
  currency: 'ZAR',
};

describe('SaaS billing checkout shared', () => {
  it('1–2. checkout amount comes from plan config; client cannot manipulate', () => {
    const amounts = calculateSaasCheckoutAmounts({ plan: starterPlan });
    assert.equal(amounts.totalCents, 224_900);
    assert.equal(amounts.currency, 'ZAR');
    const ok = assertClientCheckoutAmountMatches(224_900, amounts.totalCents);
    assert.equal(ok.ok, true);
    const bad = assertClientCheckoutAmountMatches(100, amounts.totalCents);
    assert.equal(bad.ok, false);
  });

  it('does not invent VAT when tax is not configured', () => {
    const amounts = calculateSaasCheckoutAmounts({ plan: starterPlan });
    assert.equal(amounts.taxStatus, 'billing_configuration_required');
    assert.equal(amounts.taxCents, 0);
    assert.equal(amounts.totalCents, amounts.subtotalCents);
  });

  it('extra seats require configured pricing — no fabricated price', () => {
    assert.throws(
      () =>
        calculateSaasCheckoutAmounts({
          plan: { ...starterPlan, limits: { seats: { adminOffice: 1, technician: 1 } } },
          extraTechnicianSeats: 1,
        }),
      /CONTACT_OR_UPGRADE_REQUIRED/,
    );
  });

  it('Yoco SaaS capability truthfully lacks recurring subscriptions', () => {
    assert.equal(YOCO_SAAS_PROVIDER_CAPABILITY.supportsRecurringSubscriptions, false);
    assert.ok(YOCO_SAAS_PROVIDER_CAPABILITY.missingCapabilities.includes('recurring_subscription_api'));
  });

  it('browser/provider states map to onboarding billing honestly', () => {
    assert.equal(
      mapCheckoutStatusToOnboardingBillingState('verifying', false),
      'verifying_payment',
    );
    assert.equal(
      mapCheckoutStatusToOnboardingBillingState('provider_unavailable', false),
      'payment_requires_attention',
    );
    assert.equal(mapCheckoutStatusToOnboardingBillingState('completed', true), 'entitled');
    assert.equal(
      mapCheckoutStatusToOnboardingBillingState(null, false),
      'plan_selected_billing_setup_required',
    );
  });

  it('enterprise / zero price requires contact sales', () => {
    const summary = buildSaasCheckoutSummary({
      plan: { ...starterPlan, tier: 'enterprise', priceCents: 0, name: 'Enterprise' },
      providerCapability: YOCO_SAAS_PROVIDER_CAPABILITY,
    });
    assert.equal(summary.contactSalesRequired, true);
    assert.equal(summary.selfServeAllowed, false);
  });
});
