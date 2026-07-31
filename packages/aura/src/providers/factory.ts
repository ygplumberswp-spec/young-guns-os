import type { AuraConfig } from '../config.js';
import { AuraProviderError, type AuraProvider } from '../types.js';
import { OpenAiProvider } from './openai.provider.js';

export function createAuraProvider(config: AuraConfig): AuraProvider {
  if (config.provider === 'openai') {
    if (!config.openaiApiKey) {
      throw new AuraProviderError(
        'PROVIDER_NOT_CONFIGURED',
        'AURA_OPENAI_API_KEY is not configured.',
      );
    }

    return new OpenAiProvider({
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
      baseUrl: config.openaiBaseUrl,
      requestTimeoutMs: config.openaiRequestTimeoutMs,
    });
  }

  throw new AuraProviderError(
    'PROVIDER_UNSUPPORTED',
    `Unsupported AURA provider: ${config.provider}`,
  );
}

export {
  createRuntimeAuraProvider,
  resolveDefaultBaseUrl,
  type RuntimeProviderConfig,
} from './runtime.factory.js';
