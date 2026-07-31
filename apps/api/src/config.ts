import { z } from 'zod';
import { loadAuraConfigFromEnv } from '@titan/aura';
import { parseBoolFlag } from './lib/env-flags.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).optional(),
  TITAN_ENV: z.enum(['development', 'staging', 'production', 'test']).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  INTEGRATIONS_ENCRYPTION_KEY: z.string().min(32).optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
  XERO_CLIENT_ID: z.string().trim().min(1).optional(),
  XERO_CLIENT_SECRET: z.string().min(1).optional(),
  XERO_REDIRECT_URI: z.string().url().optional(),
  SEED_DEV: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Operational / provider gates (string flags; resolved below)
  PROVIDERS_ENABLED: z.string().optional(),
  WEBHOOKS_ENABLED: z.string().optional(),
  AUTOMATIONS_ENABLED: z.string().optional(),
  SCHEDULERS_ENABLED: z.string().optional(),
  WORKERS_ENABLED: z.string().optional(),
  OUTBOUND_MESSAGES_ENABLED: z.string().optional(),
  PAYMENT_PROCESSING_ENABLED: z.string().optional(),
  XERO_SYNC_ENABLED: z.string().optional(),
  WHATSAPP_ENABLED: z.string().optional(),
  EMAIL_SENDING_ENABLED: z.string().optional(),
  READY_REQUIRE_REDIS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & {
  /** Resolved production-safe runtime controls */
  runtime: RuntimeControls;
};

export type RuntimeControls = {
  providersEnabled: boolean;
  webhooksEnabled: boolean;
  automationsEnabled: boolean;
  schedulersEnabled: boolean;
  workersEnabled: boolean;
  outboundMessagesEnabled: boolean;
  paymentProcessingEnabled: boolean;
  xeroSyncEnabled: boolean;
  whatsappEnabled: boolean;
  emailSendingEnabled: boolean;
  readyRequireRedis: boolean;
  /** In-process automation worker should run */
  startInProcessAutomationWorkers: boolean;
};

function isStagingLabels(appEnv?: string, titanEnv?: string): boolean {
  return appEnv === 'staging' || titanEnv === 'staging';
}

function isLocalhostUrl(value: string): boolean {
  return value.includes('localhost') || value.includes('127.0.0.1');
}

/**
 * Staging on Railway often has NODE_ENV=production (Docker) but no public domain yet.
 * Apply safe URL fallbacks before Zod validation so the process can bind and serve health.
 */
function applyStagingRuntimeFallbacks(): void {
  const staging = isStagingLabels(process.env.APP_ENV, process.env.TITAN_ENV);
  if (!staging || process.env.NODE_ENV !== 'production') return;

  const railwayPublic = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const httpsPublic = railwayPublic ? `https://${railwayPublic.replace(/^https?:\/\//, '')}` : null;

  if ((!process.env.APP_URL || isLocalhostUrl(process.env.APP_URL)) && httpsPublic) {
    process.env.APP_URL = httpsPublic;
  }
  if (!process.env.API_PUBLIC_URL && httpsPublic) {
    process.env.API_PUBLIC_URL = httpsPublic;
  }

  // Private-only staging: placeholders satisfy production URL validation; health does not need CORS.
  if (!process.env.APP_URL || isLocalhostUrl(process.env.APP_URL)) {
    process.env.APP_URL = 'https://titan-staging-web.railway.internal';
  }
  if (!process.env.API_PUBLIC_URL) {
    process.env.API_PUBLIC_URL = 'https://titan-staging-api.railway.internal';
  }

  // Staging has no Redis in this phase — never default-require it.
  if (process.env.READY_REQUIRE_REDIS === undefined || process.env.READY_REQUIRE_REDIS === '') {
    process.env.READY_REQUIRE_REDIS = 'false';
  }
}

function resolveRuntimeControls(
  nodeEnv: 'development' | 'production' | 'test',
  raw: z.infer<typeof envSchema>,
): RuntimeControls {
  const isProd = nodeEnv === 'production';
  const staging = isStagingLabels(raw.APP_ENV, raw.TITAN_ENV);
  // Production defaults: everything off. Development keeps native workers on unless explicitly disabled.
  const workersEnabled = parseBoolFlag(raw.WORKERS_ENABLED, !isProd);
  const schedulersEnabled = parseBoolFlag(raw.SCHEDULERS_ENABLED, !isProd);
  const automationsEnabled = parseBoolFlag(raw.AUTOMATIONS_ENABLED, !isProd);
  const providersEnabled = parseBoolFlag(raw.PROVIDERS_ENABLED, false);
  // Redis readiness: never default-require when Redis is absent or env is staging.
  // Production with Redis should set READY_REQUIRE_REDIS=true explicitly (see .env.production.example).
  const defaultRequireRedis = Boolean(raw.REDIS_URL) && isProd && !staging;

  return {
    providersEnabled,
    webhooksEnabled: parseBoolFlag(raw.WEBHOOKS_ENABLED, false),
    automationsEnabled,
    schedulersEnabled,
    workersEnabled,
    outboundMessagesEnabled: parseBoolFlag(raw.OUTBOUND_MESSAGES_ENABLED, false),
    paymentProcessingEnabled: parseBoolFlag(raw.PAYMENT_PROCESSING_ENABLED, false),
    xeroSyncEnabled: parseBoolFlag(raw.XERO_SYNC_ENABLED, false) && providersEnabled,
    whatsappEnabled: parseBoolFlag(raw.WHATSAPP_ENABLED, false) && providersEnabled,
    emailSendingEnabled: parseBoolFlag(raw.EMAIL_SENDING_ENABLED, false) && providersEnabled,
    readyRequireRedis: parseBoolFlag(raw.READY_REQUIRE_REDIS, defaultRequireRedis),
    startInProcessAutomationWorkers: workersEnabled || schedulersEnabled || automationsEnabled,
  };
}

export function loadEnv(): Env {
  applyStagingRuntimeFallbacks();

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  const data = result.data;
  const staging = isStagingLabels(data.APP_ENV, data.TITAN_ENV);

  if (data.SEED_DEV && data.NODE_ENV === 'production') {
    throw new Error('SEED_DEV must be false in production');
  }

  if (data.NODE_ENV === 'production') {
    if (!data.API_PUBLIC_URL) {
      throw new Error('API_PUBLIC_URL is required when NODE_ENV=production');
    }
    if (!data.INTEGRATIONS_ENCRYPTION_KEY) {
      throw new Error('INTEGRATIONS_ENCRYPTION_KEY is required when NODE_ENV=production');
    }
    if (isLocalhostUrl(data.APP_URL)) {
      throw new Error(
        staging
          ? 'APP_URL must not be localhost in staging production mode (set APP_URL or enable a Railway domain)'
          : 'APP_URL must not be localhost when NODE_ENV=production',
      );
    }
  }

  const runtime = resolveRuntimeControls(data.NODE_ENV, data);

  return {
    ...data,
    runtime,
  };
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
  // Hosting foundation: Xero OAuth client stays inert until both provider + sync flags are enabled.
  if (!env.runtime.xeroSyncEnabled) {
    return { configured: false };
  }

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
