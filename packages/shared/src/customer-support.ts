export type CustomerSupportConversationStatus =
  'open' | 'in_progress' | 'waiting_customer' | 'escalated' | 'resolved' | 'closed';

export type CustomerSupportChannel = 'portal' | 'email' | 'phone' | 'chat' | 'other';

export type CustomerSupportMessageRole = 'customer' | 'agent' | 'system' | 'ai_draft';

export type CustomerSupportEscalationStatus =
  'pending' | 'assigned' | 'in_progress' | 'resolved' | 'dismissed';

export type CustomerSupportEscalationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type CustomerSupportSentiment = 'positive' | 'neutral' | 'negative';

export const CUSTOMER_SUPPORT_CONVERSATION_STATUS_OPTIONS: Array<{
  value: CustomerSupportConversationStatus;
  label: string;
}> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_customer', label: 'Waiting on customer' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export type CustomerSupportConversationSummary = {
  id: string;
  customerId: string;
  customerName: string | null;
  portalUserId: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  channel: CustomerSupportChannel;
  status: CustomerSupportConversationStatus;
  subject: string;
  outcome: string | null;
  resolutionStatus: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type CustomerSupportMessageSummary = {
  id: string;
  conversationId: string;
  role: CustomerSupportMessageRole;
  content: string;
  authorUserId: string | null;
  authorName: string | null;
  occurredAt: string;
  createdAt: string;
};

export type CustomerSupportEscalationSummary = {
  id: string;
  conversationId: string;
  customerId: string;
  customerName: string | null;
  reason: string;
  priority: CustomerSupportEscalationPriority;
  status: CustomerSupportEscalationStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  resolution: string | null;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type CustomerSupportFeedbackSummary = {
  id: string;
  conversationId: string;
  customerId: string;
  customerName: string | null;
  sentiment: CustomerSupportSentiment;
  rating: number | null;
  comment: string | null;
  context: Record<string, unknown>;
  createdAt: string;
};

export type CustomerSupportStats = {
  openConversationCount: number;
  escalatedConversationCount: number;
  pendingEscalationCount: number;
  unresolvedConversationCount: number;
  averageSentimentScore: number | null;
  feedbackCount: number;
};

export type CustomerJobStatusSummary = {
  customerId: string;
  customerName: string;
  jobs: Array<{
    id: string;
    title: string;
    status: string;
    scheduledAt: string | null;
    completedAt: string | null;
  }>;
  openInvoiceCount: number;
  openQuoteCount: number;
  summary: string;
};

export type CustomerSupportInsight = {
  insightType: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  context: Record<string, unknown>;
};

export type CustomerSupportAuraContext = {
  openConversationCount: number;
  pendingEscalationCount: number;
  unresolvedConversationCount: number;
  recentConversations: Array<{
    id: string;
    customerName: string | null;
    subject: string;
    status: CustomerSupportConversationStatus;
    channel: CustomerSupportChannel;
  }>;
  attentionInsights: CustomerSupportInsight[];
  summary: string;
};

export type CreateCustomerSupportConversationRequest = {
  customerId: string;
  portalUserId?: string | null;
  assignedUserId?: string | null;
  channel?: CustomerSupportChannel;
  status?: CustomerSupportConversationStatus;
  subject: string;
  outcome?: string | null;
  resolutionStatus?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateCustomerSupportConversationRequest = {
  assignedUserId?: string | null;
  status?: CustomerSupportConversationStatus;
  subject?: string;
  outcome?: string | null;
  resolutionStatus?: string;
  metadata?: Record<string, unknown>;
  resolvedAt?: string | null;
};

export type CreateCustomerSupportMessageRequest = {
  role: CustomerSupportMessageRole;
  content: string;
  occurredAt?: string;
};

export type CreateCustomerSupportEscalationRequest = {
  reason: string;
  priority?: CustomerSupportEscalationPriority;
  assignedUserId?: string | null;
  context?: Record<string, unknown>;
};

export type UpdateCustomerSupportEscalationRequest = {
  status?: CustomerSupportEscalationStatus;
  priority?: CustomerSupportEscalationPriority;
  assignedUserId?: string | null;
  resolution?: string | null;
  context?: Record<string, unknown>;
  resolvedAt?: string | null;
};

export type CreateCustomerSupportFeedbackRequest = {
  sentiment?: CustomerSupportSentiment;
  rating?: number | null;
  comment?: string | null;
  context?: Record<string, unknown>;
};
