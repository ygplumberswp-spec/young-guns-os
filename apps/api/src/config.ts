import { z } from 'zod';
import { loadAuraConfigFromEnv } from '@titan/aura';
import { parseBoolFlag } from './lib/env-flags.js';
import { isPlaceholderPublicUrl, normalizePublicOrigin } from './lib/public-url.js';

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
  /** Google OAuth (Business Gmail) — official OAuth 2.0 client. */
  GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  /** Google Calendar reuses the Google OAuth client but needs its own redirect URI. */
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().url().optional(),
  /** Meta app for the Facebook Business integration (Page publishing, leads, insights). */
  META_APP_ID: z.string().trim().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_REDIRECT_URI: z.string().url().optional(),
  /** Facebook Login for Business configuration ID (Meta App Dashboard). */
  META_LOGIN_CONFIG_ID: z.string().trim().min(1).optional(),
  /** Echoed back during Meta's webhook subscription handshake. */
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
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
  /** Platform-level Xero webhook signing key (never exposed to clients). */
  XERO_WEBHOOK_KEY: z.string().min(1).optional(),
  WHATSAPP_ENABLED: z.string().optional(),
  /** Meta App Secret for X-Hub-Signature-256 verification (optional soft gate). */
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  EMAIL_SENDING_ENABLED: z.string().optional(),
  READY_REQUIRE_REDIS: z.string().optional(),
  /** Optional comma-separated extra browser origins allowed for credentialed CORS. */
  CORS_ORIGINS: z.string().optional(),
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

  // API_PUBLIC_URL may default to this API service's Railway domain.
  // APP_URL must NOT — on the API service RAILWAY_PUBLIC_DOMAIN is the API host,
  // and using it as APP_URL breaks browser CORS for the separate web service.
  if (!process.env.API_PUBLIC_URL && httpsPublic) {
    process.env.API_PUBLIC_URL = httpsPublic;
  }

  // Private-only staging: placeholders satisfy production URL validation until a real web origin is set.
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
    // Schedulers (Xero/import ticks) are independent of automation queue workers.
    // Coupling them forced a 5s automation poll whenever SCHEDULERS_ENABLED=true,
    // multiplying DB session usage against Supabase session-mode pool_size (~15).
    startInProcessAutomationWorkers: workersEnabled || automationsEnabled,
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

  // Canonical browser origins — trailing slashes/paths break credentialed CORS.
  data.APP_URL = normalizePublicOrigin(data.APP_URL);
  if (data.API_PUBLIC_URL) {
    data.API_PUBLIC_URL = normalizePublicOrigin(data.API_PUBLIC_URL);
  }

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
          ? 'APP_URL must not be localhost in staging production mode (set APP_URL to the public web origin)'
          : 'APP_URL must not be localhost when NODE_ENV=production',
      );
    }
    if (isPlaceholderPublicUrl(data.APP_URL)) {
      throw new Error(
        'APP_URL is still a docs/example placeholder. Set it to the exact public web origin (scheme+host), e.g. https://<web-service>.up.railway.app — not the API URL.',
      );
    }
    const railwayPublic = process.env.RAILWAY_PUBLIC_DOMAIN?.trim().replace(/^https?:\/\//, '');
    if (railwayPublic && data.APP_URL === `https://${railwayPublic}`) {
      throw new Error(
        'APP_URL is set to this API service domain. Set APP_URL to the web frontend origin so credentialed CORS can succeed.',
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

export type GmailOAuthEnvConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  configured: true;
};

/**
 * Business Gmail OAuth. Honest not_configured when client id/secret are absent.
 * Does not invent a connected state — secrets must be set on the API host.
 */
export function resolveGmailOAuthConfig(
  env: Env,
  apiPublicUrl: string,
): GmailOAuthEnvConfig | { configured: false } {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    env.GOOGLE_REDIRECT_URI?.trim() ??
    `${apiPublicUrl.replace(/\/$/, '')}/api/v1/communications-platform/gmail/oauth/callback`;

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

export type GoogleCalendarOAuthEnvConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  configured: true;
};

/**
 * Google Calendar OAuth. Shares the Google client with Business Gmail but keeps a
 * separate redirect URI so connecting one never disturbs the other. Reports
 * not_configured honestly rather than implying a usable connection.
 */
export function resolveGoogleCalendarOAuthConfig(
  env: Env,
  apiPublicUrl: string,
): GoogleCalendarOAuthEnvConfig | { configured: false } {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ??
    `${apiPublicUrl.replace(/\/$/, '')}/api/v1/google-calendar/oauth/callback`;

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

export type FacebookAppEnvConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  webhookVerifyToken: string | null;
  loginConfigId: string | null;
  configured: true;
};

/**
 * Meta app for the Facebook Business integration.
 *
 * Returns not-configured whenever the app id or secret is absent, which is what
 * drives the honest `configuration_required` connection state rather than a UI
 * that looks connectable when it cannot reach Facebook at all.
 */
export function resolveFacebookAppConfig(
  env: Env,
  apiPublicUrl: string,
): FacebookAppEnvConfig | { configured: false } {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET;
  const redirectUri =
    env.META_REDIRECT_URI?.trim() ??
    `${apiPublicUrl.replace(/\/$/, '')}/api/v1/facebook-business/oauth/callback`;

  if (!appId || !appSecret) {
    return { configured: false };
  }

  return {
    configured: true,
    appId,
    appSecret,
    redirectUri,
    webhookVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN?.trim() ?? null,
    loginConfigId: env.META_LOGIN_CONFIG_ID?.trim() ?? null,
  };
}
