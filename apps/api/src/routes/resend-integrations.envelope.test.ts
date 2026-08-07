import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

/** Mirrors saveResendSchema validation used by PUT /integrations/resend */
const saveResendSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object') return raw;
  const body = raw as Record<string, unknown>;
  const apiKey = body.apiKey ?? body.api_key;
  let webhookSecret = body.webhookSecret ?? body.webhook_secret;
  if (webhookSecret === '') webhookSecret = null;
  return {
    apiKey,
    fromEmail: body.fromEmail ?? body.from_email,
    fromName: body.fromName ?? body.from_name,
    webhookSecret,
  };
}, z.object({
  apiKey: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value.replace(/^Bearer\s+/i, '').trim())
    .optional(),
  fromEmail: z.string().trim().email(),
  fromName: z.string().trim().max(200).optional().nullable(),
  webhookSecret: z.string().trim().max(500).nullable().optional(),
}));

describe('Resend integrations API envelope', () => {
  it('accepts snake_case and Bearer-prefixed api keys', () => {
    const parsed = saveResendSchema.safeParse({
      api_key: 'Bearer re_live_example',
      from_email: 'ops@example.com',
      from_name: 'Ops',
      webhook_secret: 'whsec_abc',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.apiKey, 're_live_example');
      assert.equal(parsed.data.fromEmail, 'ops@example.com');
      assert.equal(parsed.data.webhookSecret, 'whsec_abc');
    }
  });

  it('rejects invalid from email', () => {
    const parsed = saveResendSchema.safeParse({
      apiKey: 're_x',
      fromEmail: 'not-an-email',
    });
    assert.equal(parsed.success, false);
  });

  it('allows omitting apiKey for webhook-only style updates', () => {
    const parsed = saveResendSchema.safeParse({
      fromEmail: 'ops@example.com',
      webhookSecret: 'whsec_only',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.apiKey, undefined);
    }
  });
});
