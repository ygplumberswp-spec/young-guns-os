/**
 * Manual / enterprise SaaS billing path.
 * Activation is performed by Platform Owner with evidence — never by tenant self-mark.
 */
import { MANUAL_SAAS_PROVIDER_CAPABILITY } from '@titan/shared';
import type {
  SaasBillingProvider,
  SaasBillingProviderCreateCheckoutInput,
  SaasBillingProviderCreateCheckoutResult,
} from './saas-billing-provider.js';

export class ManualSaasBillingAdapter implements SaasBillingProvider {
  readonly capability = MANUAL_SAAS_PROVIDER_CAPABILITY;

  async createCheckoutSession(
    _input: SaasBillingProviderCreateCheckoutInput,
  ): Promise<SaasBillingProviderCreateCheckoutResult> {
    return {
      ok: false,
      code: 'CONTACT_SALES_REQUIRED',
      message:
        'Self-serve card checkout is not used for manual/enterprise agreements. Platform Owner must verify payment evidence.',
      missingCapabilities: [],
    };
  }

  verifyWebhookSignature(): { ok: true } | { ok: false; code: 'INVALID_SIGNATURE' } {
    return { ok: false, code: 'INVALID_SIGNATURE' };
  }

  parseWebhookEvent(): null {
    return null;
  }
}
