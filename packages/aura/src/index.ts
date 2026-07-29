export { buildAuraCompanyContext, type CompanyContextSource } from './context.js';
export {
  auraConfigSchema,
  loadAuraConfigFromEnv,
  isAuraProviderConfigured,
  type AuraConfig,
} from './config.js';
export { buildSystemPrompt } from './prompts.js';
export {
  AURA_SYSTEM_PROMPT,
  deriveConversationTitle,
  trimConversationHistory,
} from './responder.js';
export { createAuraProvider } from './providers/factory.js';
export { OpenAiProvider } from './providers/openai.provider.js';
export {
  AuraProviderError,
  type AuraProvider,
  type AuraChatMessage,
  type AuraGenerateContext,
  type AuraGenerateRequest,
  type AuraMessageRole,
} from './types.js';
