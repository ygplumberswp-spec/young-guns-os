import { createHmac, timingSafeEqual } from 'node:crypto';
import { buildN8nSignaturePayload, N8N_SIGNATURE_MAX_SKEW_MS } from '@titan/shared';

export function signN8nPayload(
  secret: string,
  timestamp: string,
  correlationId: string,
  body: string,
): string {
  const payload = buildN8nSignaturePayload(timestamp, correlationId, body);
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyN8nSignature(input: {
  secret: string;
  timestamp: string;
  correlationId: string;
  body: string;
  signature: string;
  nowMs?: number;
  maxSkewMs?: number;
}): { ok: true } | { ok: false; reason: 'invalid_signature' | 'stale_timestamp' | 'bad_timestamp' } {
  const now = input.nowMs ?? Date.now();
  const maxSkew = input.maxSkewMs ?? N8N_SIGNATURE_MAX_SKEW_MS;
  const ts = Date.parse(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(now - ts) > maxSkew) return { ok: false, reason: 'stale_timestamp' };

  const expected = signN8nPayload(input.secret, input.timestamp, input.correlationId, input.body);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(input.signature ?? '', 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true };
}
