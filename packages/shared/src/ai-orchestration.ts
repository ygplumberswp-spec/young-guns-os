export type AiProviderKey =
  | 'openai'
  | 'google_gemini'
  | 'anthropic_claude'
  | 'ollama'
  | 'azure_openai'
  | 'openrouter'
  | 'groq'
  | 'mistral'
  | 'custom';

export type AiProviderStatus = 'active' | 'inactive' | 'degraded';
export type AiProviderHealthStatus = 'unknown' | 'healthy' | 'unhealthy' | 'degraded';

export type AiRoutingCategory =
  | 'reasoning'
  | 'coding'
  | 'business_analysis'
  | 'finance'
  | 'legal'
  | 'marketing'
  | 'image_understanding'
  | 'document_analysis'
  | 'long_context_analysis'
  | 'speech'
  | 'translation'
  | 'summarization';

export type AiRoutingMode = 'automatic' | 'manual';

export type AiCapabilityFlag =
  | 'max_context'
  | 'multimodal'
  | 'structured_output'
  | 'function_calling'
  | 'streaming'
  | 'reasoning'
  | 'vision'
  | 'speech'
  | 'embeddings'
  | 'ocr'
  | 'document_parsing';

export type AiPromptCategory = 'system' | 'department' | 'agent';
export type AiPromptVersionStatus = 'draft' | 'pending_approval' | 'published' | 'archived';

export type AiConfigurationActionType = 'prompt_update' | 'provider_configuration';
export type AiConfigurationActionStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type AiFailoverReason =
  | 'provider_unavailable'
  | 'timeout'
  | 'rate_limit'
  | 'degraded_performance'
  | 'credit_exhausted'
  | 'context_window_exceeded';

export type AiAccessMode = 'platform_managed' | 'tenant_credentials' | 'hybrid';

export type AiMemoryContextType =
  'business' | 'customer' | 'job' | 'finance' | 'executive' | 'workflow';

export type AiProviderRegistryEntry = {
  providerKey: AiProviderKey;
  name: string;
  description: string;
  supportedModels: Array<{
    modelKey: string;
    displayName: string;
    contextWindow: number;
    capabilities: AiCapabilityFlag[];
    multimodal: boolean;
  }>;
  defaultCapabilities: AiCapabilityFlag[];
  supportsMultimodal: boolean;
  apiVersion: string | null;
};

export const AI_PROVIDER_REGISTRY: AiProviderRegistryEntry[] = [
  {
    providerKey: 'openai',
    name: 'OpenAI',
    description: 'GPT models via OpenAI API.',
    supportedModels: [
      {
        modelKey: 'gpt-4o',
        displayName: 'GPT-4o',
        contextWindow: 128000,
        capabilities: [
          'max_context',
          'multimodal',
          'structured_output',
          'function_calling',
          'streaming',
          'vision',
        ],
        multimodal: true,
      },
      {
        modelKey: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        contextWindow: 128000,
        capabilities: [
          'max_context',
          'structured_output',
          'function_calling',
          'streaming',
          'vision',
        ],
        multimodal: true,
      },
    ],
    defaultCapabilities: ['function_calling', 'streaming', 'structured_output'],
    supportsMultimodal: true,
    apiVersion: 'v1',
  },
  {
    providerKey: 'google_gemini',
    name: 'Google Gemini',
    description: 'Gemini models via Google AI.',
    supportedModels: [
      {
        modelKey: 'gemini-2.0-flash',
        displayName: 'Gemini 2.0 Flash',
        contextWindow: 1048576,
        capabilities: [
          'max_context',
          'multimodal',
          'structured_output',
          'function_calling',
          'streaming',
          'vision',
        ],
        multimodal: true,
      },
    ],
    defaultCapabilities: ['function_calling', 'streaming', 'multimodal'],
    supportsMultimodal: true,
    apiVersion: 'v1beta',
  },
  {
    providerKey: 'anthropic_claude',
    name: 'Anthropic Claude',
    description: 'Claude models via Anthropic API.',
    supportedModels: [
      {
        modelKey: 'claude-3-5-sonnet-latest',
        displayName: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        capabilities: [
          'max_context',
          'structured_output',
          'function_calling',
          'streaming',
          'reasoning',
          'vision',
        ],
        multimodal: true,
      },
    ],
    defaultCapabilities: ['function_calling', 'streaming', 'reasoning'],
    supportsMultimodal: true,
    apiVersion: 'v1',
  },
  {
    providerKey: 'ollama',
    name: 'Ollama',
    description: 'Local models via Ollama runtime.',
    supportedModels: [
      {
        modelKey: 'llama3',
        displayName: 'Llama 3',
        contextWindow: 8192,
        capabilities: ['max_context', 'streaming'],
        multimodal: false,
      },
    ],
    defaultCapabilities: ['streaming'],
    supportsMultimodal: false,
    apiVersion: null,
  },
  {
    providerKey: 'azure_openai',
    name: 'Azure OpenAI',
    description: 'OpenAI models deployed on Azure.',
    supportedModels: [
      {
        modelKey: 'gpt-4o',
        displayName: 'Azure GPT-4o',
        contextWindow: 128000,
        capabilities: [
          'max_context',
          'structured_output',
          'function_calling',
          'streaming',
          'vision',
        ],
        multimodal: true,
      },
    ],
    defaultCapabilities: ['function_calling', 'streaming'],
    supportsMultimodal: true,
    apiVersion: '2024-02-15-preview',
  },
  {
    providerKey: 'openrouter',
    name: 'OpenRouter',
    description: 'Multi-model gateway via OpenRouter.',
    supportedModels: [],
    defaultCapabilities: ['function_calling', 'streaming'],
    supportsMultimodal: true,
    apiVersion: 'v1',
  },
  {
    providerKey: 'groq',
    name: 'Groq',
    description: 'Fast inference via Groq OpenAI-compatible API.',
    supportedModels: [
      {
        modelKey: 'llama-3.3-70b-versatile',
        displayName: 'Llama 3.3 70B',
        contextWindow: 128000,
        capabilities: ['max_context', 'streaming', 'reasoning'],
        multimodal: false,
      },
      {
        modelKey: 'llama-3.1-8b-instant',
        displayName: 'Llama 3.1 8B Instant',
        contextWindow: 128000,
        capabilities: ['streaming'],
        multimodal: false,
      },
    ],
    defaultCapabilities: ['streaming'],
    supportsMultimodal: false,
    apiVersion: 'v1',
  },
  {
    providerKey: 'mistral',
    name: 'Mistral AI',
    description: 'Mistral models via OpenAI-compatible API.',
    supportedModels: [
      {
        modelKey: 'mistral-large-latest',
        displayName: 'Mistral Large',
        contextWindow: 128000,
        capabilities: [
          'max_context',
          'structured_output',
          'function_calling',
          'streaming',
          'reasoning',
        ],
        multimodal: false,
      },
      {
        modelKey: 'mistral-small-latest',
        displayName: 'Mistral Small',
        contextWindow: 32000,
        capabilities: ['streaming', 'structured_output'],
        multimodal: false,
      },
    ],
    defaultCapabilities: ['streaming', 'structured_output'],
    supportsMultimodal: false,
    apiVersion: 'v1',
  },
  {
    providerKey: 'custom',
    name: 'Custom Provider',
    description: 'Custom OpenAI-compatible API endpoint.',
    supportedModels: [],
    defaultCapabilities: ['streaming'],
    supportsMultimodal: false,
    apiVersion: null,
  },
];

export type AiProviderSummary = {
  id: string | null;
  providerKey: AiProviderKey;
  name: string;
  status: AiProviderStatus;
  healthStatus: AiProviderHealthStatus;
  apiVersion: string | null;
  baseUrl: string | null;
  isEnabled: boolean;
  isConfigured: boolean;
  credentialsConfigured: boolean;
  priorityWeight: number;
  supportedModels: AiProviderRegistryEntry['supportedModels'];
  capabilities: AiCapabilityFlag[];
  multimodalSupport: boolean;
  averageLatencyMs: number | null;
  lastHealthCheckAt: string | null;
  source: 'environment' | 'tenant';
};

export type AiModelSummary = {
  id: string | null;
  providerId: string | null;
  providerKey: AiProviderKey;
  providerName: string;
  modelKey: string;
  displayName: string;
  contextWindow: number;
  capabilities: AiCapabilityFlag[];
  multimodal: boolean;
  pricingMetadata: Record<string, unknown>;
  averageLatencyMs: number | null;
  isEnabled: boolean;
};

export type AiRoutingRuleSummary = {
  id: string;
  category: AiRoutingCategory;
  routingMode: AiRoutingMode;
  primaryProviderId: string | null;
  primaryProviderKey: AiProviderKey | null;
  primaryModelId: string | null;
  primaryModelKey: string | null;
  fallbackChain: Array<{
    providerId?: string;
    modelId?: string;
    providerKey?: AiProviderKey;
    modelKey?: string;
  }>;
  priorityOrder: number;
  weight: number;
  isEnabled: boolean;
  createdAt: string;
};

export type AiPromptTemplateSummary = {
  id: string;
  templateKey: string;
  category: AiPromptCategory;
  name: string;
  description: string | null;
  agentKey: string | null;
  currentPublishedVersionId: string | null;
  createdAt: string;
};

export type AiPromptVersionSummary = {
  id: string;
  templateId: string;
  templateKey: string;
  templateName: string;
  versionNumber: number;
  content: string;
  status: AiPromptVersionStatus;
  changeNotes: string | null;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type AiConfigurationActionSummary = {
  id: string;
  actionType: AiConfigurationActionType;
  status: AiConfigurationActionStatus;
  subject: string;
  recommendation: string;
  payload: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
};

export type AiUsageRecordSummary = {
  id: string;
  providerId: string | null;
  providerKey: AiProviderKey | null;
  modelId: string | null;
  modelKey: string | null;
  departmentKey: string | null;
  workflowKey: string | null;
  userId: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCents: number;
  recordedAt: string;
};

export type AiQualityEvaluationSummary = {
  id: string;
  providerId: string | null;
  providerKey: AiProviderKey | null;
  modelId: string | null;
  modelKey: string | null;
  responseQualityScore: number | null;
  success: boolean;
  correctionRate: number | null;
  hallucinationReported: boolean;
  responseTimeMs: number | null;
  confidenceScore: number | null;
  evaluatedAt: string;
};

export type AiFeedbackSummary = {
  id: string;
  userId: string | null;
  providerId: string | null;
  modelId: string | null;
  rating: number | null;
  correctionText: string | null;
  accepted: boolean;
  rejected: boolean;
  workflowOutcome: string | null;
  createdAt: string;
};

export type AiFailoverEventSummary = {
  id: string;
  fromProviderId: string | null;
  toProviderId: string | null;
  fromProviderKey: AiProviderKey | null;
  toProviderKey: AiProviderKey | null;
  reason: AiFailoverReason;
  contextPreserved: boolean;
  loggedAt: string;
};

export type AiMemorySyncSummary = {
  id: string;
  contextType: AiMemoryContextType;
  syncKey: string;
  providerId: string | null;
  providerKey: AiProviderKey | null;
  syncedAt: string;
};

export type AiCostAnalytics = {
  totalCostCents: number;
  totalTokens: number;
  costByDepartment: Array<{ departmentKey: string; costCents: number; tokenCount: number }>;
  costByProvider: Array<{ providerKey: AiProviderKey; costCents: number; tokenCount: number }>;
  modelUtilization: Array<{ modelKey: string; usageCount: number; tokenCount: number }>;
  routingEfficiency: number | null;
  recommendations: string[];
};

export type AiQualityAnalytics = {
  averageQualityScore: number | null;
  successRate: number | null;
  correctionRate: number | null;
  hallucinationReportCount: number;
  averageResponseTimeMs: number | null;
  averageConfidenceScore: number | null;
  evaluationCount: number;
};

export type AiRoutingStatistics = {
  totalRules: number;
  enabledRules: number;
  automaticRules: number;
  manualRules: number;
  categoryCoverage: AiRoutingCategory[];
  failoverEventCount: number;
};

export type AiExecutiveDashboard = {
  summary: string;
  providerCount: number;
  healthyProviderCount: number;
  configuredProviderCount: number;
  pendingActionCount: number;
  pendingPromptVersions: number;
  costAnalytics: AiCostAnalytics;
  qualityAnalytics: AiQualityAnalytics;
  routingStatistics: AiRoutingStatistics;
  recentFailovers: AiFailoverEventSummary[];
  providers: AiProviderSummary[];
};

export type AiOrchestrationAuraContext = {
  summary: string;
  providerCount: number;
  healthyProviderCount: number;
  pendingActionCount: number;
  totalCostCents: number;
  evaluationCount: number;
  routingRuleCount: number;
};

export type CreateAiProviderRequest = {
  providerKey: AiProviderKey;
  displayName?: string;
  baseUrl?: string;
  apiVersion?: string;
  apiKey?: string;
  priorityWeight?: number;
  isEnabled?: boolean;
  config?: Record<string, unknown>;
};

export type UpdateAiProviderRequest = {
  displayName?: string;
  baseUrl?: string;
  apiVersion?: string;
  apiKey?: string;
  status?: AiProviderStatus;
  isEnabled?: boolean;
  priorityWeight?: number;
  config?: Record<string, unknown>;
};

export type CreateAiRoutingRuleRequest = {
  category: AiRoutingCategory;
  routingMode?: AiRoutingMode;
  primaryProviderId?: string;
  primaryModelId?: string;
  fallbackChain?: AiRoutingRuleSummary['fallbackChain'];
  priorityOrder?: number;
  weight?: number;
  isEnabled?: boolean;
};

export type CreateAiPromptTemplateRequest = {
  templateKey: string;
  category: AiPromptCategory;
  name: string;
  description?: string;
  agentKey?: string;
  content: string;
  changeNotes?: string;
};

export type CreateAiPromptVersionRequest = {
  templateId: string;
  content: string;
  changeNotes?: string;
};

export type CreateAiConfigurationActionRequest = {
  actionType: AiConfigurationActionType;
  subject: string;
  recommendation: string;
  payload?: Record<string, unknown>;
};

export type CreateAiFeedbackRequest = {
  providerId?: string;
  modelId?: string;
  agentRunId?: string;
  conversationId?: string;
  rating?: number;
  correctionText?: string;
  accepted?: boolean;
  rejected?: boolean;
  workflowOutcome?: string;
};

export type CreateAiQualityEvaluationRequest = {
  providerId?: string;
  modelId?: string;
  agentRunId?: string;
  conversationId?: string;
  responseQualityScore?: number;
  success?: boolean;
  correctionRate?: number;
  hallucinationReported?: boolean;
  responseTimeMs?: number;
  confidenceScore?: number;
};
