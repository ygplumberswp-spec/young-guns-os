export type AuraMessageRole = 'user' | 'assistant' | 'system';

export type AuraMessage = {
  id: string;
  conversationId: string;
  role: AuraMessageRole;
  content: string;
  createdAt: string;
};

export type AuraConversation = {
  id: string;
  companyId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AuraConversationSummary = AuraConversation & {
  messageCount: number;
  lastMessageAt: string | null;
};

export type AuraConversationDetail = AuraConversation & {
  messages: AuraMessage[];
};

export type SendAuraMessageRequest = {
  content: string;
  pageContext?: {
    customerId?: string;
    jobId?: string;
    schedulingView?: boolean;
  };
};

export type SendAuraMessageResponse = {
  conversation: AuraConversation;
  userMessage: AuraMessage;
  assistantMessage: AuraMessage;
  diagnostics?: AuraSendDiagnostics;
};

export type AuraSendDiagnostics = {
  totalApiMs: number;
  conversationHistoryMs: number;
  contextBuildMs: number;
  capabilityRoutingMs: number;
  contextDomainsLoaded: string[];
  contextDomainsSkipped: string[];
  providerMs: number;
  databaseMs: number;
  /** @deprecated Use providerRoutingMs */
  agentRoutingMs: number;
  providerRoutingMs: number;
  specialistAgentsInvoked: number;
  providerAttempts: number;
  failoverCount: number;
  retryCount: number;
  promptTokens: number;
  completionTokens: number;
  estimatedInputChars: number;
  agentsMinimalContext: boolean;
  deferredAudit: boolean;
  /** Development-only provider routing breakdown; omitted in production. */
  routing?: import('./aura-routing-diagnostics.js').ProviderRoutingDiagnostics;
};
