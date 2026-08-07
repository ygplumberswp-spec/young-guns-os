import { z } from 'zod';

/**
 * WhatsApp Business Cloud API connect/reconnect body.
 * Meta access tokens are opaque and variable-length — do not use a tight max.
 * Webhook verify token is optional; empty string must not fail validation.
 */
export const WHATSAPP_ACCESS_TOKEN_MAX_CHARS = 8192;

export const saveWhatsappConnectionSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object') return raw;
  const body = raw as Record<string, unknown>;

  const accessTokenRaw = body.accessToken ?? body.access_token;
  let accessToken: unknown = accessTokenRaw;
  if (typeof accessTokenRaw === 'string') {
    const trimmed = accessTokenRaw.replace(/^Bearer\s+/i, '').trim();
    accessToken = trimmed.length > 0 ? trimmed : undefined;
  }

  const phoneNumberId = body.phoneNumberId ?? body.phone_number_id;
  const businessAccountId =
    body.businessAccountId ?? body.business_account_id ?? body.wabaId ?? body.waba_id;

  let webhookVerifyToken = body.webhookVerifyToken ?? body.webhook_verify_token;
  // Optional field: blank/null → omit (undefined). Service keeps existing or generates.
  if (typeof webhookVerifyToken === 'string') {
    const trimmed = webhookVerifyToken.trim();
    webhookVerifyToken = trimmed.length > 0 ? trimmed : undefined;
  } else if (webhookVerifyToken === null) {
    webhookVerifyToken = undefined;
  }

  return {
    accessToken,
    phoneNumberId,
    businessAccountId,
    webhookVerifyToken,
  };
}, z.object({
  accessToken: z.string().min(1).max(WHATSAPP_ACCESS_TOKEN_MAX_CHARS).optional(),
  phoneNumberId: z.string().trim().min(1).max(200),
  businessAccountId: z.string().trim().min(1).max(200),
  webhookVerifyToken: z.string().trim().min(1).max(500).optional(),
}));

export type SaveWhatsappConnectionBody = z.infer<typeof saveWhatsappConnectionSchema>;
