import { AnthropicProvider } from './anthropic.provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';
import { OpenAiProvider } from './openai.provider.js';
import { AuraProviderError, type AuraProvider } from '../types.js';

export type RuntimeProviderConfig = {
  providerKey: string;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  apiVersion?: string | null;
  extraConfig?: Record<string, unknown>;
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  azure_openai: 'https://example.openai.azure.com/openai/deployments',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
  custom: 'http://localhost:8080/v1',
};

const OPENAI_COMPATIBLE_KEYS = new Set([
  'openai',
  'azure_openai',
  'groq',
  'mistral',
  'openrouter',
  'ollama',
  'custom',
]);

export function resolveDefaultBaseUrl(providerKey: string): string {
  return DEFAULT_BASE_URLS[providerKey] ?? DEFAULT_BASE_URLS.custom!;
}

export function createRuntimeAuraProvider(config: RuntimeProviderConfig): AuraProvider {
  const providerKey = config.providerKey;

  if (providerKey === 'anthropic_claude') {
    return new AnthropicProvider({
      apiKey: config.apiKey,
      model: config.model,
      apiVersion: config.apiVersion ?? undefined,
    });
  }

  if (providerKey === 'google_gemini') {
    return new GeminiProvider({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl ?? undefined,
    });
  }

  if (OPENAI_COMPATIBLE_KEYS.has(providerKey)) {
    if (providerKey === 'openai' && !config.baseUrl) {
      return new OpenAiProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: resolveDefaultBaseUrl('openai'),
      });
    }

    return new OpenAiCompatibleProvider({
      providerKey,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl ?? resolveDefaultBaseUrl(providerKey),
      apiVersion: config.apiVersion,
      extraHeaders:
        providerKey === 'openrouter'
          ? {
              'HTTP-Referer': 'https://titan.app',
              'X-Title': 'TITAN AURA',
            }
          : undefined,
    });
  }

  throw new AuraProviderError('PROVIDER_UNSUPPORTED', `Unsupported runtime provider: ${providerKey}`);
}
