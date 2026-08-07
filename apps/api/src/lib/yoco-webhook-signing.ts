import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Yoco webhooks follow the Standard Webhooks specification, the same scheme the
 * Resend receiver already uses.
 *
 * Headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`.
 * Secret: `whsec_…`, stored encrypted on the integration connection.
 *
 * @see https://developer.yoco.com/online/resources/webhooks
 * @see https://www.standardwebhooks.com
 */
const DEFAULT_TOLERANCE_SECONDS = 300;
const MAX_BODY_BYTES = 1_048_576;

export type YocoWebhookHeaders = {
  webhookId: string | null | undefined;
  webhookTimestamp: string | null | undefined;
  webhookSignature: string | null | undefined;
};

export type YocoSignatureVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'missing_headers'
        | 'body_too_large'
        | 'bad_timestamp'
        | 'stale_timestamp'
        | 'bad_secret'
        | 'invalid_signature';
    };

/** Human-readable reason used in audit records and the honest 400 response. */
export function describeYocoSignatureFailure(
  reason: Exclude<YocoSignatureVerifyResult, { ok: true }>['reason'],
): string {
  switch (reason) {
    case 'missing_headers':
      return 'Webhook is missing the webhook-id, webhook-timestamp or webhook-signature header';
    case 'body_too_large':
      return 'Webhook body exceeds the accepted size';
    case 'bad_timestamp':
      return 'Webhook timestamp is not a unix timestamp';
    case 'stale_timestamp':
      return 'Webhook timestamp is outside the accepted tolerance';
    case 'bad_secret':
      return 'Stored Yoco webhook secret is unusable';
    case 'invalid_signature':
      return 'Webhook signature does not match the stored secret';
  }
}

/** Signs a payload exactly as Yoco does. Used by the receiver and by test fixtures. */
export function signYocoWebhookPayload(input: {
  webhookSecret: string;
  webhookId: string;
  webhookTimestamp: string;
  rawBody: string;
}): string {
  const secretBytes = decodeWebhookSecret(input.webhookSecret);
  const signedContent = `${input.webhookId}.${input.webhookTimestamp}.${input.rawBody}`;
  return createHmac('sha256', secretBytes).update(signedContent, 'utf8').digest('base64');
}

export function verifyYocoWebhookSignature(input: {
  webhookSecret: string;
  rawBody: string;
  headers: YocoWebhookHeaders;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): YocoSignatureVerifyResult {
  const webhookId = input.headers.webhookId?.trim() ?? '';
  const webhookTimestamp = input.headers.webhookTimestamp?.trim() ?? '';
  const webhookSignature = input.headers.webhookSignature?.trim() ?? '';

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, reason: 'missing_headers' };
  }

  if (Buffer.byteLength(input.rawBody, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, reason: 'body_too_large' };
  }

  if (!/^\d+$/.test(webhookTimestamp)) {
    return { ok: false, reason: 'bad_timestamp' };
  }

  const timestamp = Number(webhookTimestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > tolerance) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  let expected: string;
  try {
    expected = signYocoWebhookPayload({
      webhookSecret: input.webhookSecret,
      webhookId,
      webhookTimestamp,
      rawBody: input.rawBody,
    });
  } catch {
    return { ok: false, reason: 'bad_secret' };
  }

  const candidates = parseV1Signatures(webhookSignature);
  if (candidates.length === 0) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const expectedBuffer = Buffer.from(expected, 'utf8');
  for (const candidate of candidates) {
    const providedBuffer = Buffer.from(candidate, 'utf8');
    if (
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return { ok: true };
    }
  }

  return { ok: false, reason: 'invalid_signature' };
}

export function extractYocoWebhookHeaders(
  headers: Record<string, string | string[] | undefined>,
): YocoWebhookHeaders {
  return {
    webhookId: headerValue(headers, 'webhook-id'),
    webhookTimestamp: headerValue(headers, 'webhook-timestamp'),
    webhookSignature: headerValue(headers, 'webhook-signature'),
  };
}

/** A header may carry several space-separated `v1,<base64>` signatures during rotation. */
function parseV1Signatures(header: string): string[] {
  const out: string[] = [];
  for (const part of header.split(/\s+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const comma = trimmed.indexOf(',');
    if (comma <= 0) continue;
    if (trimmed.slice(0, comma) !== 'v1') continue;
    const signature = trimmed.slice(comma + 1);
    if (signature) out.push(signature);
  }
  return out;
}

function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  if (!trimmed.startsWith('whsec_')) {
    throw new Error('Yoco webhook secret must start with whsec_');
  }
  const bytes = Buffer.from(trimmed.slice('whsec_'.length), 'base64');
  if (bytes.length === 0) {
    throw new Error('Yoco webhook secret is empty after decode');
  }
  return bytes;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const direct = headers[name];
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct) && typeof direct[0] === 'string') return direct[0];

  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return undefined;
}
