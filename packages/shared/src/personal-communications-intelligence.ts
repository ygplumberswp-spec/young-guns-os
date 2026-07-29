export type PersonalCommAccountType = 'personal' | 'business';

export type PersonalCommClassification =
  | 'business_customer'
  | 'existing_customer'
  | 'new_lead'
  | 'supplier'
  | 'employee'
  | 'personal'
  | 'family'
  | 'friend'
  | 'marketing'
  | 'spam'
  | 'unknown';

export type PersonalCommMediaType = 'voice' | 'image' | 'video' | 'document';

export type PersonalCommSignalType =
  | 'new_lead'
  | 'quote_request'
  | 'emergency_request'
  | 'payment_confirmation'
  | 'invoice_request'
  | 'booking_request'
  | 'support_request'
  | 'complaint'
  | 'compliment';

export type PersonalCommActionType = 'customer_reply' | 'business_action';
export type PersonalCommActionStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export type PersonalCommFollowUpType =
  | 'unread_business'
  | 'awaiting_reply'
  | 'quote_request'
  | 'overdue_follow_up'
  | 'missed_whatsapp_call'
  | 'missed_voice_call';

export type PersonalCommAnalysisStatus = 'pending' | 'completed' | 'unavailable' | 'failed';

export type PersonalCommAccountSummary = {
  id: string;
  accountType: PersonalCommAccountType;
  label: string;
  phoneNumber: string | null;
  whatsappConnectionId: string | null;
  isActive: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
};

export type PersonalCommConversationSummary = {
  id: string;
  accountId: string | null;
  accountLabel: string | null;
  customerId: string | null;
  customerName: string | null;
  contactPhone: string | null;
  contactName: string | null;
  threadKey: string;
  lastMessageAt: string | null;
  messageCount: number;
  classification: PersonalCommClassification;
  classificationConfidence: number;
  manualClassificationOverride: PersonalCommClassification | null;
  privacyMode: 'business' | 'personal' | 'hidden';
  isHidden: boolean;
  isLocked: boolean;
  excludedFromReports: boolean;
};

export type PersonalCommMediaItemSummary = {
  id: string;
  conversationId: string | null;
  whatsappMessageId: string | null;
  mediaType: PersonalCommMediaType;
  mimeType: string | null;
  fileName: string | null;
  excluded: boolean;
  indexedAt: string;
};

export type PersonalCommVoiceAnalysisSummary = {
  id: string;
  mediaItemId: string | null;
  whatsappMessageId: string | null;
  transcription: string | null;
  summary: string | null;
  keyPoints: string[];
  actionItems: string[];
  customerIntent: string | null;
  urgencyScore: number | null;
  sentiment: string | null;
  languageDetected: string | null;
  routingProviderKey: string | null;
  routingModelKey: string | null;
  status: PersonalCommAnalysisStatus;
};

export type PersonalCommMediaAnalysisSummary = {
  id: string;
  mediaItemId: string;
  issueSummary: string | null;
  confidenceScore: number | null;
  recommendedServiceCategory: string | null;
  detectedIssues: string[];
  routingProviderKey: string | null;
  routingModelKey: string | null;
  status: PersonalCommAnalysisStatus;
};

export type PersonalCommDocumentAnalysisSummary = {
  id: string;
  mediaItemId: string;
  documentType: string | null;
  extractedData: Record<string, unknown>;
  routingProviderKey: string | null;
  routingModelKey: string | null;
  status: PersonalCommAnalysisStatus;
};

export type PersonalCommLeadSignalSummary = {
  id: string;
  conversationId: string | null;
  signalType: PersonalCommSignalType;
  subject: string;
  recommendation: string;
  customerId: string | null;
  draftType: string | null;
  confidence: number;
  createdAt: string;
};

export type PersonalCommFollowUpSummary = {
  id: string;
  conversationId: string | null;
  followUpType: PersonalCommFollowUpType;
  status: string;
  subject: string;
  recommendation: string;
  waitingSince: string | null;
  priority: number;
};

export type PersonalCommPrivacySettings = {
  businessOnlyMode: boolean;
  personalOnlyMode: boolean;
  excludedContacts: string[];
  excludedGroups: string[];
  excludedMediaTypes: string[];
};

export type PersonalCommActionSummary = {
  id: string;
  actionType: PersonalCommActionType;
  status: PersonalCommActionStatus;
  subject: string;
  recommendation: string;
  conversationId: string | null;
  payload: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
};

export type PersonalCommExecutiveDashboard = {
  summary: string;
  totalBusinessConversations: number;
  totalPersonalConversations: number;
  personalVsBusinessRatio: number | null;
  newLeadsDetected: number;
  averageResponseMinutes: number | null;
  missedOpportunityCount: number;
  pendingFollowUpCount: number;
  pendingActionCount: number;
  voiceNotesProcessed: number;
  documentsAnalysed: number;
  mediaReceivedCount: number;
  busiestHours: Array<{ hour: number; count: number }>;
  languageUsage: Array<{ language: string; count: number }>;
  whatsappConnected: boolean;
  recentLeadSignals: PersonalCommLeadSignalSummary[];
};

export type PersonalCommAuraContext = {
  summary: string;
  totalBusinessConversations: number;
  pendingFollowUpCount: number;
  pendingActionCount: number;
  newLeadsDetected: number;
  whatsappConnected: boolean;
};

export type CreatePersonalCommAccountRequest = {
  accountType: PersonalCommAccountType;
  label: string;
  phoneNumber?: string;
  whatsappConnectionId?: string;
  syncEnabled?: boolean;
};

export type OverridePersonalCommClassificationRequest = {
  classification: PersonalCommClassification;
  notes?: string;
};

export type CreatePersonalCommActionRequest = {
  actionType: PersonalCommActionType;
  subject: string;
  recommendation: string;
  conversationId?: string;
  payload?: Record<string, unknown>;
};

export type UpdatePersonalCommPrivacyRequest = Partial<PersonalCommPrivacySettings>;

export type AnalyzePersonalCommMediaRequest = {
  mediaItemId: string;
};

export type AnalyzePersonalCommVoiceRequest = {
  whatsappMessageId?: string;
  mediaItemId?: string;
};
