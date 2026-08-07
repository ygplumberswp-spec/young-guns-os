import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Resend webhooks are delivered via Svix (Standard Webhooks v1).
 * Headers: svix-id, svix-timestamp, svix-signature. Secret: whsec_…
 * @see https://resend.com/docs/webhooks/verify-webhooks-requests
 */
const DEFAULT_TOLERANCE_SECONDS = 300;
const MAX_BODY_BYTES = 1_048_576;

export type ResendWebhookHeaders = {
  svixId: string | null | undefined;
  svixTimestamp: string | null | undefined;
  svixSignature: string | null | undefined;
};

export type ResendSignatureVerifyResult =
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

export function signResendWebhookPayload(input: {
  webhookSecret: string;
  svixId: string;
  svixTimestamp: string;
  rawBody: string;
}): string {
  const secretBytes = decodeWebhookSecret(input.webhookSecret);
  const signedContent = `${input.svixId}.${input.svixTimestamp}.${input.rawBody}`;
  return createHmac('sha256', secretBytes).update(signedContent, 'utf8').digest('base64');
}

export function verifyResendWebhookSignature(input: {
  webhookSecret: string;
  rawBody: string;
  headers: ResendWebhookHeaders;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): ResendSignatureVerifyResult {
  const svixId = input.headers.svixId?.trim() ?? '';
  const svixTimestamp = input.headers.svixTimestamp?.trim() ?? '';
  const svixSignature = input.headers.svixSignature?.trim() ?? '';

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: 'missing_headers' };
  }

  if (Buffer.byteLength(input.rawBody, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, reason: 'body_too_large' };
  }

  if (!/^\d+$/.test(svixTimestamp)) {
    return { ok: false, reason: 'bad_timestamp' };
  }

  const ts = Number(svixTimestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  let expected: string;
  try {
    expected = signResendWebhookPayload({
      webhookSecret: input.webhookSecret,
      svixId,
      svixTimestamp,
      rawBody: input.rawBody,
    });
  } catch {
    return { ok: false, reason: 'bad_secret' };
  }

  const candidates = parseV1Signatures(svixSignature);
  if (candidates.length === 0) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const expectedBuf = Buffer.from(expected, 'utf8');
  for (const candidate of candidates) {
    const providedBuf = Buffer.from(candidate, 'utf8');
    if (
      expectedBuf.length === providedBuf.length &&
      timingSafeEqual(expectedBuf, providedBuf)
    ) {
      return { ok: true };
    }
  }

  return { ok: false, reason: 'invalid_signature' };
}

export function extractResendWebhookHeaders(
  headers: Record<string, string | string[] | undefined>,
): ResendWebhookHeaders {
  return {
    svixId: headerValue(headers, 'svix-id'),
    svixTimestamp: headerValue(headers, 'svix-timestamp'),
    svixSignature: headerValue(headers, 'svix-signature'),
  };
}

function parseV1Signatures(header: string): string[] {
  const out: string[] = [];
  for (const part of header.split(/\s+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const comma = trimmed.indexOf(',');
    if (comma <= 0) continue;
    const version = trimmed.slice(0, comma);
    const sig = trimmed.slice(comma + 1);
    if (version === 'v1' && sig) {
      out.push(sig);
    }
  }
  return out;
}

function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  if (!trimmed.startsWith('whsec_')) {
    throw new Error('Webhook secret must start with whsec_');
  }
  const encoded = trimmed.slice('whsec_'.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0) {
    throw new Error('Webhook secret is empty after decode');
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
