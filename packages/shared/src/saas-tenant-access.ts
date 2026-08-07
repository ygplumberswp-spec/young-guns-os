/**
 * Department 21 — SaaS tenant entitlement / paid-through access control.
 *
 * Reuses canonical saas_* lifecycle + subscription status enums.
 * paidThrough = currentPeriodEnd (or trialEndsAt for trials) from subscription truth.
 * Never invent paid-through dates. Never double-count Young Guns platform_owner tenants.
 */

import type { SaasSubscriptionStatus, SaasTenantKind, SaasTenantLifecycle } from './enterprise-saas-platform.js';

/** Operational access gate (separate from subscription commercial status). */
export type SaasAccessState = 'allowed' | 'suspended';

/**
 * Presentation / control-plane subscription state.
 * Maps from stored saas_subscription_status + entitlement timing — not a second DB enum.
 */
export type SaasSubscriptionDisplayStatus =
  | 'trial'
  | 'active'
  | 'renewal_due'
  | 'payment_failed'
  | 'expired'
  | 'cancelled'
  | 'suspended';

export type SaasAccountDisplayStatus = 'pending' | 'active' | 'suspended' | 'cancelled';

export type SaasAccessBlockReason =
  | 'platform_owner'
  | 'manual_suspension'
  | 'cancelled'
  | 'entitlement_expired'
  | 'no_subscription'
  | 'provisioning'
  | null;

export type SaasTenantAccessDecision = {
  accessState: SaasAccessState;
  allowed: boolean;
  accountStatus: SaasAccountDisplayStatus;
  subscriptionStatus: SaasSubscriptionDisplayStatus | null;
  /** Canonical paid-through timestamp (ISO) — currentPeriodEnd / trialEndsAt. */
  paidThroughAt: string | null;
  paidThroughRemaining: boolean;
  paymentFailed: boolean;
  blockReason: SaasAccessBlockReason;
  customerMessage: string;
  /** True when auto-suspend sync should flip lifecycle to suspended. */
  shouldAutoSuspend: boolean;
};

export type SaasTenantAccessInput = {
  tenantKind: SaasTenantKind;
  lifecycleStatus: SaasTenantLifecycle;
  subscriptionStatus: SaasSubscriptionStatus | null;
  /** Paid-through entitlement end (subscription.currentPeriodEnd). */
  currentPeriodEnd: string | Date | null;
  trialEndsAt?: string | Date | null;
  gracePeriodEndsAt?: string | Date | null;
  lastPaymentFailedAt?: string | Date | null;
  now?: Date;
  /** Days before period end to surface renewal_due (display only). */
  renewalDueWithinDays?: number;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isFinite(d.getTime()) ? d : null;
}

export function resolvePaidThroughAt(input: {
  subscriptionStatus: SaasSubscriptionStatus | null;
  currentPeriodEnd: string | Date | null;
  trialEndsAt?: string | Date | null;
}): Date | null {
  const periodEnd = toDate(input.currentPeriodEnd);
  if (periodEnd) return periodEnd;
  if (input.subscriptionStatus === 'trial') {
    return toDate(input.trialEndsAt ?? null);
  }
  return null;
}

export function mapAccountDisplayStatus(lifecycle: SaasTenantLifecycle): SaasAccountDisplayStatus {
  if (lifecycle === 'provisioning') return 'pending';
  if (lifecycle === 'active') return 'active';
  if (lifecycle === 'suspended') return 'suspended';
  return 'cancelled';
}

export function mapSubscriptionDisplayStatus(input: {
  storedStatus: SaasSubscriptionStatus | null;
  paidThroughAt: Date | null;
  now: Date;
  paymentFailed: boolean;
  renewalDueWithinDays: number;
}): SaasSubscriptionDisplayStatus | null {
  if (!input.storedStatus) return null;
  if (input.storedStatus === 'cancelled') return 'cancelled';
  if (input.storedStatus === 'suspended') return 'suspended';

  const paidThroughValid =
    input.paidThroughAt != null && input.paidThroughAt.getTime() > input.now.getTime();

  if (!paidThroughValid) {
    return 'expired';
  }

  if (input.paymentFailed || input.storedStatus === 'grace_period') {
    return 'payment_failed';
  }

  if (input.storedStatus === 'trial') return 'trial';

  if (input.paidThroughAt) {
    const msLeft = input.paidThroughAt.getTime() - input.now.getTime();
    const daysLeft = msLeft / (24 * 60 * 60 * 1000);
    if (daysLeft <= input.renewalDueWithinDays) return 'renewal_due';
  }

  return 'active';
}

/**
 * Canonical access decision.
 *
 * CRITICAL: renewal/payment failure before paid-through expiry does NOT lock access.
 * Access remains allowed until paidThroughAt expires with no successful renewal.
 */
export function evaluateSaasTenantAccess(input: SaasTenantAccessInput): SaasTenantAccessDecision {
  const now = input.now ?? new Date();
  const renewalDueWithinDays =
    typeof input.renewalDueWithinDays === 'number' && input.renewalDueWithinDays >= 0
      ? input.renewalDueWithinDays
      : 7;

  const accountStatus = mapAccountDisplayStatus(input.lifecycleStatus);
  const paidThroughAt = resolvePaidThroughAt({
    subscriptionStatus: input.subscriptionStatus,
    currentPeriodEnd: input.currentPeriodEnd,
    trialEndsAt: input.trialEndsAt,
  });
  const paidThroughRemaining =
    paidThroughAt != null && paidThroughAt.getTime() > now.getTime();
  const paymentFailed =
    input.lastPaymentFailedAt != null || input.subscriptionStatus === 'grace_period';

  const subscriptionStatus = mapSubscriptionDisplayStatus({
    storedStatus: input.subscriptionStatus,
    paidThroughAt,
    now,
    paymentFailed,
    renewalDueWithinDays,
  });

  // Platform / Young Guns internal tenant — never subscription-gated.
  if (input.tenantKind === 'platform_owner') {
    return {
      accessState: 'allowed',
      allowed: true,
      accountStatus: 'active',
      subscriptionStatus: null,
      paidThroughAt: null,
      paidThroughRemaining: true,
      paymentFailed: false,
      blockReason: 'platform_owner',
      customerMessage: 'Platform owner tenant — subscription enforcement bypassed.',
      shouldAutoSuspend: false,
    };
  }

  if (input.lifecycleStatus === 'cancelled' || input.subscriptionStatus === 'cancelled') {
    return {
      accessState: 'suspended',
      allowed: false,
      accountStatus: 'cancelled',
      subscriptionStatus: 'cancelled',
      paidThroughAt: paidThroughAt?.toISOString() ?? null,
      paidThroughRemaining,
      paymentFailed,
      blockReason: 'cancelled',
      customerMessage: 'TITAN subscription requires attention.',
      shouldAutoSuspend: false,
    };
  }

  // Manual Platform Owner suspension always blocks (even with remaining paid-through).
  if (input.lifecycleStatus === 'suspended') {
    return {
      accessState: 'suspended',
      allowed: false,
      accountStatus: 'suspended',
      subscriptionStatus,
      paidThroughAt: paidThroughAt?.toISOString() ?? null,
      paidThroughRemaining,
      paymentFailed,
      blockReason: 'manual_suspension',
      customerMessage: 'TITAN subscription requires attention.',
      shouldAutoSuspend: false,
    };
  }

  if (input.lifecycleStatus === 'provisioning') {
    return {
      accessState: 'suspended',
      allowed: false,
      accountStatus: 'pending',
      subscriptionStatus,
      paidThroughAt: paidThroughAt?.toISOString() ?? null,
      paidThroughRemaining,
      paymentFailed,
      blockReason: 'provisioning',
      customerMessage: 'TITAN subscription requires attention.',
      shouldAutoSuspend: false,
    };
  }

  if (!input.subscriptionStatus) {
    return {
      accessState: 'suspended',
      allowed: false,
      accountStatus,
      subscriptionStatus: null,
      paidThroughAt: null,
      paidThroughRemaining: false,
      paymentFailed: false,
      blockReason: 'no_subscription',
      customerMessage: 'TITAN subscription requires attention.',
      shouldAutoSuspend: true,
    };
  }

  // Paid-through still valid → allow, even if renewal already failed.
  if (paidThroughRemaining) {
    return {
      accessState: 'allowed',
      allowed: true,
      accountStatus: 'active',
      subscriptionStatus,
      paidThroughAt: paidThroughAt!.toISOString(),
      paidThroughRemaining: true,
      paymentFailed,
      blockReason: null,
      customerMessage: paymentFailed
        ? 'Access continues through your paid period. Please update billing before it ends.'
        : 'Subscription active.',
      shouldAutoSuspend: false,
    };
  }

  // Paid-through expired (or missing) with no renewal → suspend.
  return {
    accessState: 'suspended',
    allowed: false,
    accountStatus: 'suspended',
    subscriptionStatus: subscriptionStatus ?? 'expired',
    paidThroughAt: paidThroughAt?.toISOString() ?? null,
    paidThroughRemaining: false,
    paymentFailed,
    blockReason: 'entitlement_expired',
    customerMessage: 'TITAN subscription requires attention.',
    shouldAutoSuspend: true,
  };
}

export function saasAccessStatusChip(
  decision: SaasTenantAccessDecision,
): 'ACTIVE' | 'PAYMENT FAILED' | 'PAID THROUGH' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED' | 'TRIAL' {
  if (decision.accountStatus === 'cancelled' || decision.subscriptionStatus === 'cancelled') {
    return 'CANCELLED';
  }
  if (!decision.allowed) {
    if (decision.subscriptionStatus === 'expired') return 'EXPIRED';
    return 'SUSPENDED';
  }
  if (decision.subscriptionStatus === 'trial') return 'TRIAL';
  if (decision.paymentFailed && decision.paidThroughRemaining) return 'PAYMENT FAILED';
  if (decision.subscriptionStatus === 'renewal_due') return 'PAID THROUGH';
  return 'ACTIVE';
}
