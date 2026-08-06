import { createHash } from 'node:crypto';
import {
  isTimeoutError,
  providerTimeoutSignal,
  PROVIDER_REQUEST_TIMEOUT_MS,
} from './http-timeout.js';

export class YocoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'YocoError';
  }
}

/** Checkout API has no business-profile resource — connection verify returns this shape. */
export type YocoWebhookCapability = 'available' | 'unavailable' | 'unknown';

export type YocoConnectionVerification = {
  connected: true;
  environment: 'test' | 'live';
  keyFingerprint: string;
  displayName: string;
  webhookCapability: YocoWebhookCapability;
  subscriptionCount: number | null;
  raw: Record<string, unknown>;
};

/**
 * @deprecated Prefer YocoConnectionVerification. Kept as an alias for call sites that
 * still map verification into legacy businessName/businessId UI fields.
 */
export type YocoBusinessRecord = {
  businessId: string;
  name: string;
  raw: Record<string, unknown>;
  verification: YocoConnectionVerification;
};

type YocoClientOptions = {
  secretKey: string;
  environment: 'test' | 'live';
  fetchImpl?: typeof fetch;
};

type YocoRequestOptions = {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

/** Checkout API — secret-key Bearer auth (sk_test_* / sk_live_*). */
const API_BASE_URL = 'https://payments.yoco.com/api';

/**
 * Documented secret-key operation used to verify credentials.
 * GET /webhooks is not reliable for all secret keys (can 404); create-checkout is.
 * @see https://developer.yoco.com/online/api-reference/checkout/payments/accept-payments/
 */
const CONNECTION_VERIFY_PATH = '/checkouts';

/** Optional secondary probe — only used to report webhookCapability when it succeeds. */
const WEBHOOK_LIST_PATH = '/webhooks';

/** Yoco Checkout minimum charge is R2.00 (200 cents). */
const PROBE_AMOUNT_CENTS = 200;

export class YocoClient {
  private readonly secretKey: string;
  private readonly environment: 'test' | 'live';
  private readonly fetchImpl: typeof fetch;

  constructor({ secretKey, environment, fetchImpl }: YocoClientOptions) {
    this.secretKey = secretKey.trim().replace(/^Bearer\s+/i, '').trim();
    this.environment = environment;
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async testConnection(): Promise<YocoConnectionVerification> {
    return this.verifyConnection();
  }

  async verifyConnection(): Promise<YocoConnectionVerification> {
    const keyFingerprint = accountFingerprint(this.secretKey);
    const modeFromKey = resolveEnvironment(this.secretKey, this.environment);

    const checkoutPayload = await this.createConnectionProbeCheckout(keyFingerprint);
    const webhookMeta = await this.probeWebhookCapability();

    const processingMode = pickString(checkoutPayload, ['processingMode', 'processing_mode']);
    const environment =
      processingMode === 'live' || processingMode === 'test' ? processingMode : modeFromKey;

    return {
      connected: true,
      environment,
      keyFingerprint,
      displayName: `Yoco Checkout (${environment})`,
      webhookCapability: webhookMeta.webhookCapability,
      subscriptionCount: webhookMeta.subscriptionCount,
      raw: {
        checkout: checkoutPayload,
        webhooks: webhookMeta.raw,
      },
    };
  }

  /** Legacy name — returns verification mapped onto businessId/name for older callers. */
  async fetchBusiness(): Promise<YocoBusinessRecord> {
    const verification = await this.verifyConnection();
    return {
      businessId: verification.keyFingerprint,
      name: verification.displayName,
      raw: verification.raw,
      verification,
    };
  }

  private async createConnectionProbeCheckout(
    keyFingerprint: string,
  ): Promise<Record<string, unknown>> {
    // Stable idempotency key so reconnect/sync does not create a new checkout each time.
    const idempotencyKey = `titan-yoco-verify-${keyFingerprint}`;

    const payload = await this.request(CONNECTION_VERIFY_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: {
        amount: PROBE_AMOUNT_CENTS,
        currency: 'ZAR',
        // Required by Checkout API / SDK contract; never visited for connection probes.
        successUrl: 'https://example.com/titan-yoco-connection-probe/success',
        cancelUrl: 'https://example.com/titan-yoco-connection-probe/cancel',
        metadata: {
          titan_connection_probe: '1',
        },
      },
    });

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new YocoError('API_ERROR', 'Yoco checkout probe returned an invalid payload');
    }

    const record = payload as Record<string, unknown>;
    const checkoutId = pickString(record, ['id']);
    if (!checkoutId) {
      throw new YocoError('API_ERROR', 'Yoco checkout probe response is missing checkout id');
    }

    return record;
  }

  /**
   * Best-effort webhook list. Failures must not fail connection — many accounts
   * can create checkouts while GET /webhooks returns 404/403.
   */
  private async probeWebhookCapability(): Promise<{
    webhookCapability: YocoWebhookCapability;
    subscriptionCount: number | null;
    raw: Record<string, unknown> | null;
  }> {
    try {
      const payload = await this.request(WEBHOOK_LIST_PATH, { method: 'GET' });
      if (payload == null) {
        return { webhookCapability: 'available', subscriptionCount: null, raw: {} };
      }
      if (Array.isArray(payload)) {
        return {
          webhookCapability: 'available',
          subscriptionCount: payload.length,
          raw: { subscriptions: payload },
        };
      }
      if (typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        const subscriptions = extractSubscriptions(record);
        return {
          webhookCapability: 'available',
          subscriptionCount: subscriptions?.length ?? null,
          raw: record,
        };
      }
      return { webhookCapability: 'unknown', subscriptionCount: null, raw: null };
    } catch (error) {
      if (error instanceof YocoError && error.code === 'AUTH_FAILED') {
        // Auth already succeeded on checkout create; treat webhook deny as unknown.
        return { webhookCapability: 'unknown', subscriptionCount: null, raw: null };
      }
      if (error instanceof YocoError && error.code === 'API_ERROR') {
        return { webhookCapability: 'unknown', subscriptionCount: null, raw: null };
      }
      return { webhookCapability: 'unknown', subscriptionCount: null, raw: null };
    }
  }

  private async request(path: string, options: YocoRequestOptions = {}): Promise<unknown> {
    const method = options.method ?? 'GET';
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          Accept: 'application/json',
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: providerTimeoutSignal(),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new YocoError(
          'TIMEOUT',
          `Yoco request timed out after ${PROVIDER_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw new YocoError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unable to reach Yoco API',
      );
    }

    // Yoco Checkout uses 403 for invalid secret keys (and 401 in some gateways).
    if (response.status === 401 || response.status === 403) {
      throw new YocoError('AUTH_FAILED', 'Yoco rejected the provided secret key');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new YocoError(
        'API_ERROR',
        `Yoco API returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();

    if (!text.trim()) {
      return {};
    }

    if (contentType && !contentType.includes('application/json') && !contentType.includes('+json')) {
      throw new YocoError('API_ERROR', 'Yoco API returned a non-JSON response');
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new YocoError('API_ERROR', 'Yoco API returned invalid JSON');
    }
  }
}

function extractSubscriptions(record: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(record.subscriptions)) {
    return record.subscriptions;
  }

  const nested = record.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const data = nested as Record<string, unknown>;
    if (Array.isArray(data.subscriptions)) {
      return data.subscriptions;
    }
  }

  if (Array.isArray(nested)) {
    return nested;
  }

  return null;
}

function resolveEnvironment(secretKey: string, fallback: 'test' | 'live'): 'test' | 'live' {
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('sk_test_')) return 'test';
  return fallback;
}

function accountFingerprint(secretKey: string): string {
  return createHash('sha256').update(secretKey).digest('hex').slice(0, 16);
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
