/**
 * Yoco SaaS adapter — truthful capability gate.
 *
 * Existing Young Guns Yoco invoice payment-link workflow is intentionally NOT reused.
 * Recurring SaaS subscription APIs are not integrated; do not fake recurring billing.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { YOCO_SAAS_PROVIDER_CAPABILITY } from '@titan/shared';
import type {
  SaasBillingNormalizedEvent,
  SaasBillingProvider,
  SaasBillingProviderCreateCheckoutInput,
  SaasBillingProviderCreateCheckoutResult,
} from './saas-billing-provider.js';

export class YocoSaasBillingAdapter implements SaasBillingProvider {
  readonly capability = YOCO_SAAS_PROVIDER_CAPABILITY;

  async createCheckoutSession(
    _input: SaasBillingProviderCreateCheckoutInput,
  ): Promise<SaasBillingProviderCreateCheckoutResult> {
    return {
      ok: false,
      code: 'PROVIDER_CAPABILITY_REQUIRED',
      message:
        'PROVIDER CAPABILITY REQUIRED — current Yoco integration supports Young Guns invoice payment-links / one-off checkouts only, not TITAN recurring SaaS subscriptions.',
      missingCapabilities: [...this.capability.missingCapabilities],
    };
  }

  verifyWebhookSignature(input: {
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
    webhookSecret: string;
  }): { ok: true } | { ok: false; code: 'INVALID_SIGNATURE' } {
    // Same Standard Webhooks shape as invoice Yoco, but on a separate SaaS route/secret.
    const signatureHeader = firstHeader(input.headers['webhook-signature']);
    const timestamp = firstHeader(input.headers['webhook-timestamp']);
    const webhookId = firstHeader(input.headers['webhook-id']);
    if (!signatureHeader || !timestamp || !webhookId || !input.webhookSecret) {
      return { ok: false, code: 'INVALID_SIGNATURE' };
    }
    const signed = `${webhookId}.${timestamp}.${input.rawBody}`;
    const expected = createHmac('sha256', input.webhookSecret).update(signed).digest('base64');
    const provided = signatureHeader
      .split(' ')
      .map((part) => part.replace(/^v1,/, '').trim())
      .find(Boolean);
    if (!provided) return { ok: false, code: 'INVALID_SIGNATURE' };
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(provided);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { ok: false, code: 'INVALID_SIGNATURE' };
      }
      return { ok: true };
    } catch {
      return { ok: false, code: 'INVALID_SIGNATURE' };
    }
  }

  parseWebhookEvent(rawBody: string): SaasBillingNormalizedEvent | null {
    // Parser exists for future recurring provider wiring; current adapter never creates sessions.
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }
    const type = typeof parsed.type === 'string' ? parsed.type : null;
    const id = typeof parsed.id === 'string' ? parsed.id : null;
    if (!type || !id) return null;
    const data = (parsed.data as Record<string, unknown> | undefined) ?? {};
    return {
      providerEventId: id,
      providerEventType: type,
      canonicalType: mapYocoType(type),
      providerSessionRef: asString(data.checkoutId) ?? asString(data.sessionId),
      providerPaymentRef: asString(data.paymentId) ?? asString(data.id),
      providerCustomerRef: asString(data.customerId),
      providerSubscriptionRef: asString(data.subscriptionId),
      amountCents: typeof data.amount === 'number' ? data.amount : null,
      currency: asString(data.currency),
      paidThroughAt: asString(data.currentPeriodEnd) ?? asString(data.paidThroughAt),
      occurredAt: asString(parsed.createdDate) ?? asString(parsed.created_at),
      paymentMethodLabel: asString(data.paymentMethodLabel),
      unverifiedCompanyIdHint: asString(data.companyId) ?? asString(data.metadata && (data.metadata as Record<string, unknown>).companyId),
      safeMetadata: {
        type,
        // Never persist raw secrets / card data.
        hasSubscriptionId: Boolean(data.subscriptionId),
      },
    };
  }
}

function mapYocoType(type: string): SaasBillingNormalizedEvent['canonicalType'] {
  const normalized = type.toLowerCase();
  if (normalized.includes('payment') && normalized.includes('fail')) return 'payment_failed';
  if (normalized.includes('payment') && normalized.includes('succeed')) return 'payment_succeeded';
  if (normalized.includes('checkout') && normalized.includes('complete')) return 'checkout_completed';
  if (normalized.includes('cancel')) return 'subscription_cancelled';
  if (normalized.includes('refund')) return 'refund';
  if (normalized.includes('dispute') || normalized.includes('chargeback')) return 'payment_disputed';
  if (normalized.includes('subscription') && normalized.includes('active')) return 'subscription_active';
  if (normalized.includes('subscription')) return 'subscription_updated';
  return 'payment_succeeded';
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
