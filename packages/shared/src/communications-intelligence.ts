export type CommIntelChannel =
  'phone' | 'whatsapp' | 'email' | 'sms' | 'portal' | 'support' | 'internal';

export type CommIntelCallType =
  'inbound' | 'outbound' | 'missed' | 'transferred' | 'voicemail' | 'callback';

export type CommIntelCallOutcome =
  | 'answered'
  | 'missed'
  | 'voicemail'
  | 'transferred'
  | 'resolved'
  | 'unresolved'
  | 'callback_requested';

export type CommIntelSentiment = 'positive' | 'neutral' | 'negative' | 'mixed';

export type CommIntelSourceType =
  | 'voice_session'
  | 'whatsapp_message'
  | 'communication'
  | 'support_conversation'
  | 'portal_request';

export type CommIntelSmsStatus = 'sent' | 'delivered' | 'failed' | 'replied';

export type CommIntelDraftType = 'customer_reply' | 'follow_up';

export type CommIntelDraftStatus =
  'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';

export type CommIntelRecordingSummary = {
  id: string;
  voiceSessionId: string | null;
  storageReference: string | null;
  retentionPolicyDays: number | null;
  consentStatus: string;
  recordingStatus: string;
  transcriptionStatus: string;
  transcriptReference: string | null;
  aiSummary: string | null;
  createdAt: string;
};

export type CommIntelCallSummary = {
  id: string;
  voiceSessionId: string;
  customerId: string | null;
  customerName: string | null;
  callType: CommIntelCallType;
  queueName: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  outcome: CommIntelCallOutcome | null;
  sentiment: CommIntelSentiment | null;
  intent: string | null;
  followUpStatus: string;
  durationSeconds: number | null;
  recordingId: string | null;
  callerName: string | null;
  callerPhone: string | null;
  sessionStatus: string | null;
  sessionSummary: string | null;
  startedAt: string | null;
  createdAt: string;
};

export type CommIntelConversationInsightSummary = {
  id: string;
  sourceType: CommIntelSourceType;
  sourceId: string;
  customerId: string | null;
  customerName: string | null;
  channel: CommIntelChannel;
  sentiment: CommIntelSentiment;
  urgencyScore: number;
  hasComplaint: boolean;
  hasCompliment: boolean;
  buyingIntent: boolean;
  cancellationRisk: boolean;
  escalationRisk: boolean;
  followUpRecommendation: string | null;
  aiSummary: string | null;
  createdAt: string;
};

export type CommIntelEmailThreadSummary = {
  id: string;
  customerId: string;
  customerName: string;
  subject: string;
  threadKey: string;
  communicationIds: string[];
  sentiment: CommIntelSentiment;
  priority: string;
  aiSummary: string | null;
  lastMessageAt: string;
  createdAt: string;
};

export type CommIntelSmsRecordSummary = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  communicationId: string | null;
  templateId: string | null;
  campaignKey: string | null;
  direction: string;
  status: CommIntelSmsStatus;
  bodyPreview: string;
  createdAt: string;
};

export type CommIntelDraftActionSummary = {
  id: string;
  draftType: CommIntelDraftType;
  status: CommIntelDraftStatus;
  channel: CommIntelChannel;
  customerId: string | null;
  customerName: string | null;
  subject: string | null;
  body: string;
  sourceType: CommIntelSourceType | null;
  sourceId: string | null;
  createdAt: string;
};

export type CommIntelTimelineEntry = {
  id: string;
  channel: CommIntelChannel;
  direction: 'inbound' | 'outbound' | 'internal';
  title: string;
  preview: string;
  customerId: string | null;
  customerName: string | null;
  entityType: string | null;
  entityId: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

export type CommIntelAnalyticsDashboard = {
  totalCommunications: number;
  missedCallCount: number;
  averageResponseMinutes: number | null;
  customerSatisfactionTrend: Array<{
    period: string;
    positiveCount: number;
    negativeCount: number;
  }>;
  channelUsage: Array<{ channel: CommIntelChannel; count: number }>;
  communicationVolumeTrend: Array<{ period: string; count: number }>;
  supportResponsePerformance: {
    openConversationCount: number;
    escalatedCount: number;
    averageResolutionHours: number | null;
  };
  pendingDraftCount: number;
  whatsappUnreadCount: number;
};

export type CommIntelUnifiedDashboard = {
  summary: string;
  analytics: CommIntelAnalyticsDashboard;
  recentTimeline: CommIntelTimelineEntry[];
  pendingDrafts: CommIntelDraftActionSummary[];
};

export type CommIntelAuraContext = {
  summary: string;
  totalCommunications: number;
  missedCallCount: number;
  pendingDraftCount: number;
  openSupportCount: number;
  whatsappMessageCount: number;
  topChannel: CommIntelChannel | null;
};

export type CreateCommIntelRecordingRequest = {
  voiceSessionId?: string;
  storageReference?: string;
  retentionPolicyDays?: number;
  consentStatus?: string;
  transcriptReference?: string;
  aiSummary?: string;
};

export type CreateCommIntelCallIntelligenceRequest = {
  voiceSessionId: string;
  callType: CommIntelCallType;
  customerId?: string;
  queueName?: string;
  assignedStaffId?: string;
  outcome?: CommIntelCallOutcome;
  sentiment?: CommIntelSentiment;
  intent?: string;
  followUpStatus?: string;
  recordingId?: string;
};

export type CreateCommIntelConversationInsightRequest = {
  sourceType: CommIntelSourceType;
  sourceId: string;
  channel: CommIntelChannel;
  customerId?: string;
  sentiment?: CommIntelSentiment;
  urgencyScore?: number;
  hasComplaint?: boolean;
  hasCompliment?: boolean;
  buyingIntent?: boolean;
  cancellationRisk?: boolean;
  escalationRisk?: boolean;
  followUpRecommendation?: string;
  aiSummary?: string;
};

export type CreateCommIntelEmailThreadRequest = {
  customerId: string;
  subject: string;
  threadKey: string;
  communicationIds?: string[];
  sentiment?: CommIntelSentiment;
  priority?: string;
  aiSummary?: string;
};

export type CreateCommIntelSmsRecordRequest = {
  customerId?: string;
  communicationId?: string;
  templateId?: string;
  campaignKey?: string;
  direction: string;
  status?: CommIntelSmsStatus;
  bodyPreview: string;
};

export type CreateCommIntelDraftActionRequest = {
  draftType: CommIntelDraftType;
  channel: CommIntelChannel;
  customerId?: string;
  subject?: string;
  body: string;
  sourceType?: CommIntelSourceType;
  sourceId?: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  supportConversationId?: string;
};
