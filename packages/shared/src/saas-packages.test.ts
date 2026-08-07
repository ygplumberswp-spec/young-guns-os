import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertNoUnlimitedHighCost,
  buildMarginSnapshot,
  evaluateDowngradeSeatImpact,
  evaluateFairUse,
  evaluateSeatAvailability,
  evaluateSaasTenantAccess,
  packageKeyFromTier,
  TITAN_CANONICAL_PLANS,
} from './index.js';

describe('saas packages / entitlements', () => {
  it('1. Starter tenant catalog exposes Starter entitlements', () => {
    const starter = TITAN_CANONICAL_PLANS.find((plan) => plan.packageKey === 'starter');
    assert.ok(starter);
    assert.equal(starter!.tier, 'starter');
    assert.equal(starter!.limits.seats?.adminOffice, 1);
    assert.equal(starter!.limits.seats?.technician, 1);
    assert.ok(starter!.features.includes('core_jobs'));
    assert.ok(starter!.features.includes('core_aura_basic'));
    assert.equal(starter!.features.includes('advanced_aura'), false);
  });

  it('2. Business tenant catalog exposes Business entitlements', () => {
    const business = TITAN_CANONICAL_PLANS.find((plan) => plan.packageKey === 'business');
    assert.ok(business);
    assert.equal(business!.limits.seats?.adminOffice, 2);
    assert.equal(business!.limits.seats?.technician, 5);
    assert.ok(business!.features.includes('advanced_analytics'));
  });

  it('3. Pro tenant catalog exposes Pro entitlements', () => {
    const pro = TITAN_CANONICAL_PLANS.find((plan) => plan.packageKey === 'pro');
    assert.ok(pro);
    assert.equal(pro!.tier, 'pro');
    assert.equal(pro!.limits.seats?.technician, 10);
    assert.ok(pro!.features.includes('advanced_aura'));
    assert.ok(pro!.features.includes('advanced_finance_jpe'));
  });

  it('4. Enterprise supports configurable / null seat limits', () => {
    const enterprise = TITAN_CANONICAL_PLANS.find((plan) => plan.packageKey === 'enterprise');
    assert.ok(enterprise);
    assert.equal(enterprise!.limits.seats?.adminOffice, null);
    assert.equal(enterprise!.limits.seats?.technician, null);
    assert.ok(enterprise!.features.includes('custom_enterprise'));
    assert.equal(enterprise!.commercial.pricingConfigurable, true);
  });

  it('5. Tenant cannot exceed included seat limit without extra entitlement', () => {
    const starter = TITAN_CANONICAL_PLANS.find((plan) => plan.packageKey === 'starter')!;
    const decision = evaluateSeatAvailability({
      roleName: 'Technician',
      usage: { adminOfficeUsed: 1, technicianUsed: 1, totalUsed: 3 },
      limits: starter.limits,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'SEAT_LIMIT_REACHED');
    assert.match(decision.message, /Seat limit reached/);
  });

  it('6. Extra seat entitlement increases permitted count', () => {
    const starter = TITAN_CANONICAL_PLANS.find((plan) => plan.packageKey === 'starter')!;
    const blocked = evaluateSeatAvailability({
      roleName: 'Technician',
      usage: { adminOfficeUsed: 1, technicianUsed: 1, totalUsed: 3 },
      limits: starter.limits,
    });
    assert.equal(blocked.allowed, false);
    const allowed = evaluateSeatAvailability({
      roleName: 'Technician',
      usage: { adminOfficeUsed: 1, technicianUsed: 1, totalUsed: 3 },
      limits: starter.limits,
      extra: { technician: 1, total: 2 },
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.permitted, 2);
  });

  it('10–11. Downgrade preserves users and marks action_required when over limit', () => {
    const starter = TITAN_CANONICAL_PLANS.find((plan) => plan.packageKey === 'starter')!;
    const impact = evaluateDowngradeSeatImpact({
      usage: { adminOfficeUsed: 2, technicianUsed: 8, totalUsed: 12 },
      targetLimits: starter.limits,
    });
    assert.equal(impact.overLimit, true);
    assert.equal(impact.overLimitState, 'action_required');
    assert.equal(impact.preservesExistingUsers, true);
    assert.match(impact.message, /keeps existing users/i);
  });

  it('12. Upgrade path maps professional legacy tier to pro package', () => {
    assert.equal(packageKeyFromTier('professional'), 'pro');
    assert.equal(packageKeyFromTier('pro'), 'pro');
    assert.equal(packageKeyFromTier('business'), 'business');
  });

  it('13–14. Cancelled/expired still obeys PR #60 paid-through access rules', () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    const stillPaid = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'grace_period',
      currentPeriodEnd: '2026-08-31T23:59:59.000Z',
      lastPaymentFailedAt: '2026-08-25T10:00:00.000Z',
      now,
    });
    assert.equal(stillPaid.allowed, true);
    const expired = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'grace_period',
      currentPeriodEnd: '2026-08-20T23:59:59.000Z',
      now,
    });
    assert.equal(expired.allowed, false);
    assert.equal(expired.shouldAutoSuspend, true);
  });

  it('15. Usage allowance warning state works', () => {
    const warning = evaluateFairUse({
      metric: 'ai_tokens',
      used: 960,
      allowance: 1000,
      approachingPercent: 80,
      warningPercent: 95,
    });
    assert.equal(warning.state, 'warning');
    const approaching = evaluateFairUse({
      metric: 'ai_tokens',
      used: 850,
      allowance: 1000,
    });
    assert.equal(approaching.state, 'approaching');
  });

  it('16. No unlimited high-cost entitlement is accidentally granted', () => {
    const bad = assertNoUnlimitedHighCost({
      aiTokens: Number.POSITIVE_INFINITY,
    });
    assert.equal(bad.ok, false);
    for (const plan of TITAN_CANONICAL_PLANS) {
      const check = assertNoUnlimitedHighCost(plan.limits);
      assert.equal(check.ok, true, plan.planKey);
      assert.notEqual(plan.limits.fairUse?.aiTokensMonthly, Number.POSITIVE_INFINITY);
    }
  });

  it('margin hooks never fabricate provider costs', () => {
    const snap = buildMarginSnapshot({
      revenueCents: 224_900,
      currency: 'ZAR',
    });
    assert.equal(snap.truth, 'not_available');
    assert.equal(snap.estimatedCostCents, null);
    assert.equal(snap.estimatedGrossMarginCents, null);
  });

  it('pricing is marked configurable / not locked on canonical plans', () => {
    for (const plan of TITAN_CANONICAL_PLANS) {
      assert.equal(plan.commercial.pricingConfigurable, true);
      assert.equal(plan.commercial.pricingLocked, false);
    }
  });
});
