import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

/**
 * Mirrors apps/api/src/routes/integrations.ts saveYocoSchema so request-shape
 * regressions surface without standing up the full Express router.
 */
const saveYocoSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object') return raw;
  const body = raw as Record<string, unknown>;
  const secretKey = body.secretKey ?? body.secret_key ?? body.apiKey ?? body.api_key;
  let environment = body.environment ?? body.mode;
  if (environment === '' || environment === null) {
    environment = undefined;
  }
  return { secretKey, environment };
}, z.object({
  secretKey: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .transform((value) => value.replace(/^Bearer\s+/i, '').trim())
    .refine((value) => value.length > 0, 'Secret key is required'),
  environment: z.enum(['test', 'live']).optional(),
}));

describe('Yoco save payload schema', () => {
  it('accepts canonical secretKey + environment', () => {
    const parsed = saveYocoSchema.safeParse({
      secretKey: 'sk_test_abc',
      environment: 'test',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.secretKey, 'sk_test_abc');
      assert.equal(parsed.data.environment, 'test');
    }
  });

  it('accepts secret_key alias and strips Bearer prefix', () => {
    const parsed = saveYocoSchema.safeParse({
      secret_key: 'Bearer sk_live_abc',
      environment: '',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.secretKey, 'sk_live_abc');
      assert.equal(parsed.data.environment, undefined);
    }
  });

  it('rejects missing secret key (Invalid Yoco connection payload path)', () => {
    const parsed = saveYocoSchema.safeParse({ environment: 'test' });
    assert.equal(parsed.success, false);
  });
});
