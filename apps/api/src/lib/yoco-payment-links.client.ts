import {
  buildPaymentLinkRequest,
  fromYocoMinorUnits,
  requireYocoPaymentUrl,
  YOCO_PAYMENT_LINKS_ENDPOINT,
  type BuildPaymentLinkRequestInput,
} from '@titan/shared';
import {
  isTimeoutError,
  providerTimeoutSignal,
  PROVIDER_REQUEST_TIMEOUT_MS,
} from './http-timeout.js';
import { YocoError } from './yoco.client.js';

/**
 * Yoco payment-link API client.
 *
 * Separate from `YocoClient` only because payment links live on `api.yoco.com`
 * while Checkout lives on `payments.yoco.com`. Errors and timeout handling are
 * shared so callers treat all Yoco failures the same way.
 *
 * @see https://developer.yoco.com — POST /v1/payment_links/
 */
export type YocoPaymentLinkResult = {
  paymentLinkId: string;
  orderId: string | null;
  paymentUrl: string;
  amountCents: number;
  currency: string;
  status: string | null;
  raw: Record<string, unknown>;
};

type YocoPaymentLinkClientOptions = {
  secretKey: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
};

export class YocoPaymentLinkClient {
  private readonly secretKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor({ secretKey, fetchImpl, endpoint }: YocoPaymentLinkClientOptions) {
    this.secretKey = secretKey.trim().replace(/^Bearer\s+/i, '').trim();
    if (!this.secretKey) {
      throw new YocoError('AUTH_FAILED', 'Yoco secret key is missing');
    }
    this.fetchImpl = fetchImpl ?? fetch;
    this.endpoint = endpoint ?? YOCO_PAYMENT_LINKS_ENDPOINT;
  }

  /**
   * Creates one payment link. `idempotencyKey` makes a retry safe: Yoco returns
   * the original link rather than creating a second one for the same balance.
   */
  async createPaymentLink(
    input: BuildPaymentLinkRequestInput & { idempotencyKey: string },
  ): Promise<YocoPaymentLinkResult> {
    const body = buildPaymentLinkRequest(input);
    const payload = await this.post(body, input.idempotencyKey);

    const paymentLinkId = pickString(payload, ['id', 'paymentLinkId', 'payment_link_id']);
    if (!paymentLinkId) {
      throw new YocoError('API_ERROR', 'Yoco payment-link response is missing an id');
    }

    // A missing or foreign URL is a hard failure: we never print a fabricated link.
    const paymentUrl = requireYocoPaymentUrl(
      pickString(payload, ['url', 'paymentUrl', 'payment_url', 'redirectUrl']),
    );

    const amountCents = fromYocoMinorUnits(payload.amount ?? body.amount);
    if (amountCents !== body.amount) {
      throw new YocoError(
        'API_ERROR',
        `Yoco created a link for ${amountCents} cents but ${body.amount} was requested`,
      );
    }

    return {
      paymentLinkId,
      orderId: pickString(payload, ['orderId', 'order_id']),
      paymentUrl,
      amountCents,
      currency: pickString(payload, ['currency']) ?? body.currency,
      status: pickString(payload, ['status', 'state']),
      raw: payload,
    };
  }

  private async post(
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    let response: Response;

    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: providerTimeoutSignal(),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new YocoError(
          'TIMEOUT',
          `Yoco payment-link request timed out after ${PROVIDER_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw new YocoError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach the Yoco API',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new YocoError(
        'AUTH_FAILED',
        'Yoco rejected the secret key, or it lacks the business/orders:write scope',
      );
    }

    if (!response.ok) {
      const text = await safeText(response);
      throw new YocoError(
        'API_ERROR',
        `Yoco payment-link API returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      );
    }

    const text = await safeText(response);
    if (!text.trim()) {
      throw new YocoError('API_ERROR', 'Yoco payment-link API returned an empty response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new YocoError('API_ERROR', 'Yoco payment-link API returned invalid JSON');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new YocoError('API_ERROR', 'Yoco payment-link API returned an unexpected payload');
    }
    return parsed as Record<string, unknown>;
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
