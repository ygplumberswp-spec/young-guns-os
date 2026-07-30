import { z } from 'zod';
import { loadAuraConfigFromEnv } from '@titan/aura';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  INTEGRATIONS_ENCRYPTION_KEY: z.string().min(32).optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  XERO_CLIENT_ID: z.string().trim().min(1).optional(),
  XERO_CLIENT_SECRET: z.string().min(1).optional(),
  XERO_REDIRECT_URI: z.string().url().optional(),
  SEED_DEV: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  if (result.data.SEED_DEV && result.data.NODE_ENV === 'production') {
    throw new Error('SEED_DEV must be false in production');
  }

  return result.data;
}

export function loadAuraEnvConfig() {
  return loadAuraConfigFromEnv(process.env);
}

export const API_VERSION = '0.2.0';

export type XeroOAuthEnvConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  configured: true;
};

export function resolveXeroOAuthConfig(
  env: Env,
  apiPublicUrl: string,
): XeroOAuthEnvConfig | { configured: false } {
  const clientId = env.XERO_CLIENT_ID?.trim();
  const clientSecret = env.XERO_CLIENT_SECRET;
  const redirectUri =
    env.XERO_REDIRECT_URI?.trim() ??
    `${apiPublicUrl.replace(/\/$/, '')}/api/v1/integrations/xero/oauth/callback`;

  if (!clientId || !clientSecret) {
    return { configured: false };
  }

  return {
    configured: true,
    clientId,
    clientSecret,
    redirectUri,
  };
}
