import { z } from 'zod';

export const auraProviderNameSchema = z.enum(['openai']);

export const auraConfigSchema = z.object({
  provider: auraProviderNameSchema.default('openai'),
  openaiApiKey: z.string().min(1).optional(),
  openaiModel: z.string().min(1).default('gpt-4o-mini'),
  openaiBaseUrl: z.string().url().default('https://api.openai.com/v1'),
  openaiRequestTimeoutMs: z.coerce.number().int().positive().max(300_000).default(60_000),
  maxHistoryMessages: z.coerce.number().int().positive().max(100).default(20),
});

export type AuraConfig = z.infer<typeof auraConfigSchema>;

export function loadAuraConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuraConfig {
  const apiKey = env.AURA_OPENAI_API_KEY?.trim();

  return auraConfigSchema.parse({
    provider: env.AURA_DEFAULT_PROVIDER,
    openaiApiKey: apiKey || undefined,
    openaiModel: env.AURA_OPENAI_MODEL,
    openaiBaseUrl: env.AURA_OPENAI_BASE_URL,
    openaiRequestTimeoutMs: env.AURA_OPENAI_REQUEST_TIMEOUT_MS,
    maxHistoryMessages: env.AURA_MAX_HISTORY_MESSAGES,
  });
}

export function isAuraProviderConfigured(config: AuraConfig): boolean {
  if (config.provider === 'openai') {
    return Boolean(config.openaiApiKey);
  }

  return false;
}
