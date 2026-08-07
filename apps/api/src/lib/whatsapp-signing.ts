import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Meta Cloud API webhook signatures: `X-Hub-Signature-256: sha256=<hex>`.
 * Dev/staging may skip when secret unset (honest degrade).
 * Production must fail closed when secret is unset (SEC-001).
 */
export function signWhatsappWebhookBody(appSecret: string, rawBody: string): string {
  return createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
}

export function verifyWhatsappWebhookSignature(input: {
  appSecret: string | null | undefined;
  rawBody: string;
  signatureHeader: string | null | undefined;
  /** When true, missing app secret rejects instead of skipping (production). */
  failClosedWithoutSecret?: boolean;
}):
  | { ok: true; mode: 'verified' | 'skipped_no_secret' }
  | {
      ok: false;
      reason: 'missing_signature' | 'invalid_signature' | 'bad_header' | 'missing_secret';
    } {
  const secret = input.appSecret?.trim();
  if (!secret) {
    if (input.failClosedWithoutSecret) {
      return { ok: false, reason: 'missing_secret' };
    }
    return { ok: true, mode: 'skipped_no_secret' };
  }

  const header = input.signatureHeader?.trim() ?? '';
  if (!header) {
    return { ok: false, reason: 'missing_signature' };
  }

  const match = /^sha256=(.+)$/i.exec(header);
  if (!match?.[1]) {
    return { ok: false, reason: 'bad_header' };
  }

  const expected = signWhatsappWebhookBody(secret, input.rawBody);
  const provided = match[1];
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  return { ok: true, mode: 'verified' };
}
