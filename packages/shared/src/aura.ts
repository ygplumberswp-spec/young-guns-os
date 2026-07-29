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
};
