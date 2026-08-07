/**
 * Department 21 — SaaS checkout + billing-provider abstraction (types + pure calc).
 *
 * Provider adapters live in apps/api. This module never stores cards and never
 * invents paid-through periods. Amounts must be server-calculated from plan config.
 */

import type { SaasBillingInterval, SaasSubscriptionPlanSummary } from './enterprise-saas-platform.js';

export type SaasBillingProviderKey = 'yoco_saas' | 'manual' | 'unavailable';

export type SaasBillingProviderCapability = {
  providerKey: SaasBillingProviderKey;
  label: string;
  /** Hosted/tokenised checkout for first payment. */
  supportsHostedCheckout: boolean;
  /** True recurring subscription / mandate billing. */
  supportsRecurringSubscriptions: boolean;
  supportsCancelAtPeriodEnd: boolean;
  supportsProration: boolean;
  supportsCustomerPortal: boolean;
  supportsWebhookSignatureVerification: boolean;
  /** Young Guns invoice payment-links are NOT SaaS recurring. */
  notes: string[];
  missingCapabilities: string[];
};

export const YOCO_SAAS_PROVIDER_CAPABILITY: SaasBillingProviderCapability = {
  providerKey: 'yoco_saas',
  label: 'Yoco (SaaS recurring)',
  supportsHostedCheckout: false,
  supportsRecurringSubscriptions: false,
  supportsCancelAtPeriodEnd: false,
  supportsProration: false,
  supportsCustomerPortal: false,
  supportsWebhookSignatureVerification: true,
  notes: [
    'Existing Young Guns Yoco integration is invoice payment-link / one-off checkout only.',
    'It must not be mixed with TITAN SaaS subscription billing.',
  ],
  missingCapabilities: [
    'recurring_subscription_api',
    'saas_customer_mandate',
    'provider_period_entitlement_truth',
    'platform_owned_saas_billing_credentials',
  ],
};

export const MANUAL_SAAS_PROVIDER_CAPABILITY: SaasBillingProviderCapability = {
  providerKey: 'manual',
  label: 'Manual / invoice / enterprise agreement',
  supportsHostedCheckout: false,
  supportsRecurringSubscriptions: false,
  supportsCancelAtPeriodEnd: true,
  supportsProration: false,
  supportsCustomerPortal: false,
  supportsWebhookSignatureVerification: false,
  notes: [
    'Requires authorised Platform Owner / Finance verification with evidence.',
    'Tenant Owner cannot self-mark PAID.',
  ],
  missingCapabilities: [],
};

export type SaasCanonicalBillingEventType =
  | 'checkout_completed'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'subscription_active'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'subscription_expired'
  | 'refund'
  | 'payment_disputed'
  | 'checkout_cancelled'
  | 'provider_timeout';

export type SaasCheckoutSessionStatus =
  | 'created'
  | 'awaiting_provider'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'provider_unavailable'
  | 'expired';

export type SaasOnboardingPlanBillingState =
  | 'not_selected'
  | 'plan_selected_billing_setup_required'
  | 'checkout_in_progress'
  | 'verifying_payment'
  | 'payment_requires_attention'
  | 'entitled';

export type SaasCheckoutTaxConfig = {
  /** When false/null, tax is not fabricated — taxCents stays 0 and taxStatus explains. */
  taxConfigured: boolean;
  taxEnabled: boolean;
  taxRateBps: number | null;
  taxLabel: string | null;
};

export type SaasCheckoutAmountBreakdown = {
  currency: string;
  billingInterval: SaasBillingInterval;
  planPriceCents: number;
  extraSeatCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxStatus: 'included_none' | 'configured' | 'billing_configuration_required';
  taxLabel: string | null;
};

export type SaasCheckoutSummary = {
  planId: string;
  planName: string;
  planKey: string;
  billingInterval: SaasBillingInterval;
  includedSeats: {
    adminOffice: number | null;
    technician: number | null;
  };
  extraSeats: {
    adminOffice: number;
    technician: number;
  };
  amounts: SaasCheckoutAmountBreakdown;
  renewalCadenceLabel: string;
  cancellationPolicyLabel: string;
  selfServeAllowed: boolean;
  contactSalesRequired: boolean;
  providerCapability: SaasBillingProviderCapability;
};

export type SaasCheckoutSessionView = {
  id: string;
  companyId: string;
  status: SaasCheckoutSessionStatus;
  summary: SaasCheckoutSummary;
  /** Browser redirect never activates — this is the honest interim state. */
  browserReturnState: 'payment_verification_in_progress' | 'provider_unavailable' | 'cancelled' | null;
  providerCheckoutUrl: string | null;
  providerSessionRef: string | null;
  attentionMessage: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

export type CreateSaasCheckoutRequest = {
  planId: string;
  extraAdminOfficeSeats?: number;
  extraTechnicianSeats?: number;
  /** Ignored for pricing — server recalculates. Present only for tamper detection. */
  clientQuotedTotalCents?: number;
};

export type ManualSaasBillingActivationRequest = {
  targetCompanyId: string;
  planId: string;
  amountCents: number;
  currency: string;
  paidThroughAt: string;
  method: 'eft' | 'invoice' | 'enterprise_contract' | 'other';
  externalReference: string;
  periodStartAt?: string | null;
  notes?: string | null;
};

export type SaasBillingHistoryItem = {
  id: string;
  recordType: string;
  status: string;
  amountCents: number;
  taxCents: number | null;
  totalCents: number;
  currency: string;
  description: string;
  reference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string;
  receiptUrl: string | null;
};

/** Server-side amount calculation — never trust client totals. */
export function calculateSaasCheckoutAmounts(input: {
  plan: Pick<
    SaasSubscriptionPlanSummary,
    'priceCents' | 'currency' | 'billingInterval' | 'limits' | 'tier' | 'name'
  >;
  extraAdminOfficeSeats?: number;
  extraTechnicianSeats?: number;
  tax?: SaasCheckoutTaxConfig | null;
}): SaasCheckoutAmountBreakdown {
  const extraAdmin = Math.max(0, Math.floor(input.extraAdminOfficeSeats ?? 0));
  const extraTech = Math.max(0, Math.floor(input.extraTechnicianSeats ?? 0));
  const seatPricing = input.plan.limits?.extraSeatPricing;
  const adminUnit = seatPricing?.adminOfficeCents ?? null;
  const techUnit = seatPricing?.technicianCents ?? null;

  let extraSeatCents = 0;
  if (extraAdmin > 0) {
    if (adminUnit == null) {
      throw new Error('CONTACT_OR_UPGRADE_REQUIRED: Admin/office extra-seat pricing is not configured');
    }
    extraSeatCents += extraAdmin * adminUnit;
  }
  if (extraTech > 0) {
    if (techUnit == null) {
      throw new Error('CONTACT_OR_UPGRADE_REQUIRED: Technician extra-seat pricing is not configured');
    }
    extraSeatCents += extraTech * techUnit;
  }

  const planPriceCents = Math.max(0, Math.floor(input.plan.priceCents ?? 0));
  const subtotalCents = planPriceCents + extraSeatCents;
  const currency = (input.plan.currency || seatPricing?.currency || 'ZAR').toUpperCase();

  const tax = input.tax;
  if (!tax || !tax.taxConfigured) {
    return {
      currency,
      billingInterval: input.plan.billingInterval,
      planPriceCents,
      extraSeatCents,
      subtotalCents,
      taxCents: 0,
      totalCents: subtotalCents,
      taxStatus: 'billing_configuration_required',
      taxLabel: null,
    };
  }

  if (!tax.taxEnabled || tax.taxRateBps == null) {
    return {
      currency,
      billingInterval: input.plan.billingInterval,
      planPriceCents,
      extraSeatCents,
      subtotalCents,
      taxCents: 0,
      totalCents: subtotalCents,
      taxStatus: 'included_none',
      taxLabel: tax.taxLabel,
    };
  }

  const taxCents = Math.round((subtotalCents * tax.taxRateBps) / 10_000);
  return {
    currency,
    billingInterval: input.plan.billingInterval,
    planPriceCents,
    extraSeatCents,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    taxStatus: 'configured',
    taxLabel: tax.taxLabel,
  };
}

export function buildSaasCheckoutSummary(input: {
  plan: SaasSubscriptionPlanSummary;
  extraAdminOfficeSeats?: number;
  extraTechnicianSeats?: number;
  tax?: SaasCheckoutTaxConfig | null;
  providerCapability: SaasBillingProviderCapability;
}): SaasCheckoutSummary {
  const amounts = calculateSaasCheckoutAmounts(input);
  const contactSalesRequired =
    input.plan.tier === 'enterprise' || input.plan.priceCents <= 0;
  return {
    planId: input.plan.id,
    planName: input.plan.name,
    planKey: input.plan.planKey,
    billingInterval: input.plan.billingInterval,
    includedSeats: {
      adminOffice: input.plan.limits?.seats?.adminOffice ?? null,
      technician: input.plan.limits?.seats?.technician ?? null,
    },
    extraSeats: {
      adminOffice: Math.max(0, Math.floor(input.extraAdminOfficeSeats ?? 0)),
      technician: Math.max(0, Math.floor(input.extraTechnicianSeats ?? 0)),
    },
    amounts,
    renewalCadenceLabel:
      input.plan.billingInterval === 'annual' ? 'Renews annually' : 'Renews monthly',
    cancellationPolicyLabel: 'Cancel at period end — access remains through paid-through date',
    selfServeAllowed: !contactSalesRequired && input.providerCapability.supportsRecurringSubscriptions,
    contactSalesRequired,
    providerCapability: input.providerCapability,
  };
}

/** Reject client amount tampering when a quoted total is supplied. */
export function assertClientCheckoutAmountMatches(
  clientQuotedTotalCents: number | null | undefined,
  serverTotalCents: number,
): { ok: true } | { ok: false; code: 'AMOUNT_TAMPER_REJECTED' } {
  if (clientQuotedTotalCents == null) return { ok: true };
  if (!Number.isFinite(clientQuotedTotalCents)) {
    return { ok: false, code: 'AMOUNT_TAMPER_REJECTED' };
  }
  if (Math.floor(clientQuotedTotalCents) !== serverTotalCents) {
    return { ok: false, code: 'AMOUNT_TAMPER_REJECTED' };
  }
  return { ok: true };
}

export function mapCheckoutStatusToOnboardingBillingState(
  status: SaasCheckoutSessionStatus | null,
  entitled: boolean,
): SaasOnboardingPlanBillingState {
  if (entitled) return 'entitled';
  if (!status) return 'plan_selected_billing_setup_required';
  if (status === 'verifying' || status === 'awaiting_provider') return 'verifying_payment';
  if (status === 'created') return 'checkout_in_progress';
  if (status === 'failed' || status === 'provider_unavailable' || status === 'expired') {
    return 'payment_requires_attention';
  }
  if (status === 'cancelled') return 'plan_selected_billing_setup_required';
  if (status === 'completed') return 'entitled';
  return 'plan_selected_billing_setup_required';
}
