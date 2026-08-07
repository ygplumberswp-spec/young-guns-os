/**
 * Canonical SaaS billing provider interface.
 * Young Guns invoice Yoco must NOT implement this for job payments.
 */
import type {
  SaasBillingProviderCapability,
  SaasCanonicalBillingEventType,
  SaasCheckoutSummary,
} from '@titan/shared';

export type SaasBillingProviderCreateCheckoutInput = {
  companyId: string;
  checkoutSessionId: string;
  summary: SaasCheckoutSummary;
  successUrl: string;
  cancelUrl: string;
};

export type SaasBillingProviderCreateCheckoutResult =
  | {
      ok: true;
      providerSessionRef: string;
      checkoutUrl: string;
    }
  | {
      ok: false;
      code: 'PROVIDER_CAPABILITY_REQUIRED' | 'PROVIDER_UNAVAILABLE' | 'CONTACT_SALES_REQUIRED';
      message: string;
      missingCapabilities: string[];
    };

export type SaasBillingNormalizedEvent = {
  providerEventId: string;
  providerEventType: string;
  canonicalType: SaasCanonicalBillingEventType;
  providerSessionRef: string | null;
  providerPaymentRef: string | null;
  providerCustomerRef: string | null;
  providerSubscriptionRef: string | null;
  amountCents: number | null;
  currency: string | null;
  paidThroughAt: string | null;
  occurredAt: string | null;
  paymentMethodLabel: string | null;
  /** Trusted company match must come from provider refs / session ledger — not unverified metadata alone. */
  unverifiedCompanyIdHint: string | null;
  safeMetadata: Record<string, unknown>;
};

export interface SaasBillingProvider {
  readonly capability: SaasBillingProviderCapability;
  createCheckoutSession(
    input: SaasBillingProviderCreateCheckoutInput,
  ): Promise<SaasBillingProviderCreateCheckoutResult>;
  verifyWebhookSignature(input: {
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
    webhookSecret: string;
  }): { ok: true } | { ok: false; code: 'INVALID_SIGNATURE' };
  parseWebhookEvent(rawBody: string): SaasBillingNormalizedEvent | null;
}
