import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_BODY_BYTES = 1_048_576;

export type XeroWebhookVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'missing_signature' | 'body_too_large' | 'bad_secret' | 'invalid_signature';
    };

/** HMAC-SHA256 of raw body, base64-encoded — per Xero webhook documentation. */
export function signXeroWebhookPayload(webhookKey: string, rawBody: string): string {
  return createHmac('sha256', webhookKey).update(rawBody, 'utf8').digest('base64');
}

export function verifyXeroWebhookSignature(input: {
  webhookKey: string;
  rawBody: string;
  signatureHeader: string | null | undefined;
}): XeroWebhookVerifyResult {
  const signature = input.signatureHeader?.trim() ?? '';
  if (!signature) {
    return { ok: false, reason: 'missing_signature' };
  }

  if (Buffer.byteLength(input.rawBody, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, reason: 'body_too_large' };
  }

  if (!input.webhookKey.trim()) {
    return { ok: false, reason: 'bad_secret' };
  }

  const expected = signXeroWebhookPayload(input.webhookKey, input.rawBody);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signature, 'utf8');

  if (
    expectedBuf.length === providedBuf.length &&
    timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return { ok: true };
  }

  return { ok: false, reason: 'invalid_signature' };
}

export function extractXeroSignatureHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const direct = headers['x-xero-signature'];
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct) && typeof direct[0] === 'string') return direct[0];

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'x-xero-signature') continue;
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }

  return undefined;
}
