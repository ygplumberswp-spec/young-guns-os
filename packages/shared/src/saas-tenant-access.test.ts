import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateSaasTenantAccess,
  resolvePaidThroughAt,
  saasAccessStatusChip,
} from './saas-tenant-access.js';

const now = new Date('2026-08-26T12:00:00.000Z');

describe('saas tenant access / paid-through', () => {
  it('allows active paid tenant', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-10-31T23:59:59.000Z',
      now,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.accessState, 'allowed');
    assert.equal(decision.subscriptionStatus, 'active');
    assert.equal(saasAccessStatusChip(decision), 'ACTIVE');
  });

  it('keeps access when renewal failed but paid-through is still future', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'grace_period',
      currentPeriodEnd: '2026-08-31T23:59:59.000Z',
      lastPaymentFailedAt: '2026-08-25T10:00:00.000Z',
      now,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.paymentFailed, true);
    assert.equal(decision.paidThroughRemaining, true);
    assert.equal(decision.subscriptionStatus, 'payment_failed');
    assert.equal(saasAccessStatusChip(decision), 'PAYMENT FAILED');
  });

  it('suspends when paid-through expired with no renewal', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'grace_period',
      currentPeriodEnd: '2026-08-20T23:59:59.000Z',
      lastPaymentFailedAt: '2026-08-15T10:00:00.000Z',
      now,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.blockReason, 'entitlement_expired');
    assert.equal(decision.shouldAutoSuspend, true);
    assert.equal(saasAccessStatusChip(decision), 'EXPIRED');
  });

  it('blocks manual Platform Owner suspension even with paid-through remaining', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'suspended',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-09-30T23:59:59.000Z',
      now,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.blockReason, 'manual_suspension');
  });

  it('never enforces subscription on platform_owner (Young Guns / internal)', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'platform_owner',
      lifecycleStatus: 'active',
      subscriptionStatus: null,
      currentPeriodEnd: null,
      now,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.blockReason, 'platform_owner');
  });

  it('restores allowed after valid renewal (future paid-through + active)', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-09-30T23:59:59.000Z',
      lastPaymentFailedAt: null,
      now,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.paymentFailed, false);
  });

  it('resolves paid-through from currentPeriodEnd without inventing dates', () => {
    assert.equal(
      resolvePaidThroughAt({
        subscriptionStatus: 'active',
        currentPeriodEnd: null,
        trialEndsAt: null,
      }),
      null,
    );
    const paid = resolvePaidThroughAt({
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-08-31T00:00:00.000Z',
    });
    assert.equal(paid?.toISOString(), '2026-08-31T00:00:00.000Z');
  });

  it('customer message is professional and non-technical when blocked', () => {
    const decision = evaluateSaasTenantAccess({
      tenantKind: 'customer',
      lifecycleStatus: 'active',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      now,
    });
    assert.match(decision.customerMessage, /TITAN subscription requires attention/i);
    assert.doesNotMatch(decision.customerMessage, /token|stack|sql|uuid/i);
  });
});
