import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Meta Cloud API webhook signatures: `X-Hub-Signature-256: sha256=<hex>`.
 * Soft policy: when app secret is unset, verification is skipped (honest degrade).
 * When secret is set, missing/invalid signatures are rejected.
 */
export function signWhatsappWebhookBody(appSecret: string, rawBody: string): string {
  return createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
}

export function verifyWhatsappWebhookSignature(input: {
  appSecret: string | null | undefined;
  rawBody: string;
  signatureHeader: string | null | undefined;
}):
  | { ok: true; mode: 'verified' | 'skipped_no_secret' }
  | { ok: false; reason: 'missing_signature' | 'invalid_signature' | 'bad_header' } {
  const secret = input.appSecret?.trim();
  if (!secret) {
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
