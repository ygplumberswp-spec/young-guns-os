import type { CommIntelUnifiedDashboard } from './communications-intelligence.js';

export type UcProviderChannel =
  | 'voice'
  | 'whatsapp'
  | 'sms'
  | 'email'
  | 'live_chat'
  | 'website_chat'
  | 'facebook_messenger'
  | 'instagram'
  | 'microsoft_teams'
  | 'slack'
  | 'custom';

export const UC_PROVIDER_CHANNELS: UcProviderChannel[] = [
  'voice',
  'whatsapp',
  'sms',
  'email',
  'live_chat',
  'website_chat',
  'facebook_messenger',
  'instagram',
  'microsoft_teams',
  'slack',
  'custom',
];

export type UcProviderAdapterStatus = 'active' | 'inactive' | 'testing' | 'error';

export type UcOutboundCallType =
  | 'appointment_confirmation'
  | 'reminder'
  | 'missed_appointment'
  | 'satisfaction'
  | 'payment_reminder'
  | 'maintenance_reminder'
  | 'quote_followup'
  | 'lead_qualification';

export type UcDispatchNotificationType =
  | 'appointment_confirmation'
  | 'technician_en_route'
  | 'eta'
  | 'tracking_link'
  | 'arrival'
  | 'completion'
  | 'invoice';

export type UcPlatformConfigSummary = {
  globalPolicies: Record<string, unknown>;
  aiVoiceSettings: Record<string, unknown>;
  recordingPolicy: Record<string, unknown>;
  retentionDays: number;
  consentRequired: boolean;
  routingRules: Record<string, unknown>;
  notificationTemplates: Record<string, unknown>;
};

export type UcProviderAdapterSummary = {
  id: string;
  channel: UcProviderChannel;
  providerKey: string;
  name: string;
  status: UcProviderAdapterStatus;
  endpointUrl: string | null;
  isPrimary: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  /** Communications Platform–backed adapters (e.g. gmail) — Google OAuth app secrets present. */
  oauthConfigured?: boolean;
  /** Connected mailbox address when known. */
  emailAddress?: string | null;
  /** In-app path for Connect / Channel Settings (no fake deep links). */
  connectPath?: string | null;
};

export type UcTimelineEntrySummary = {
  id: string;
  customerId: string | null;
  jobId?: string | null;
  entryType: string;
  channel: UcProviderChannel | null;
  title: string;
  summary: string | null;
  sourceModule: string;
  sourceEntityId: string | null;
  occurredAt: string;
};

export type UcAnalyticsSummary = {
  callsAnswered: number;
  callsMissed: number;
  avgResponseTimeSeconds: number | null;
  aiResolutionRate: number | null;
  humanTransferRate: number | null;
  bookingConversionRate: number | null;
  leadConversionRate: number | null;
  customerSatisfactionScore: number | null;
  channelUsage: Record<string, unknown>;
  providerPerformance: Record<string, unknown>;
  capturedAt: string | null;
};

export type UcOutboundCampaignSummary = {
  id: string;
  campaignType: UcOutboundCallType;
  status: string;
  subject: string;
  consentRequired: boolean;
  scheduledAt: string | null;
  createdAt: string;
};

export type UcDispatchNotificationSummary = {
  id: string;
  jobId: string | null;
  customerId: string | null;
  notificationType: UcDispatchNotificationType;
  channel: UcProviderChannel | null;
  status: string;
  sentAt: string | null;
  createdAt: string;
};

export type UcVoiceReceptionistSummary = {
  activeSessionCount: number;
  totalSessionCount: number;
  missedCallCount: number;
  pendingFollowUpCount: number;
  aiVoiceEnabled: boolean;
};

export type UcCustomerCommunicationCenter = {
  customerId: string;
  customerName: string;
  timeline: UcTimelineEntrySummary[];
  recentCalls: number;
  recentWhatsapp: number;
  recentEmail: number;
  pendingDraftCount: number;
};

export type EnterpriseUnifiedCommunicationsDashboard = {
  summary: string;
  isPlatformOwner: boolean;
  platformConfig: UcPlatformConfigSummary;
  providerAdapters: UcProviderAdapterSummary[];
  activeProviderCount: number;
  voiceReceptionist: UcVoiceReceptionistSummary;
  intelligence: CommIntelUnifiedDashboard;
  analytics: UcAnalyticsSummary | null;
  recentTimeline: UcTimelineEntrySummary[];
  outboundCampaigns: UcOutboundCampaignSummary[];
  dispatchNotifications: UcDispatchNotificationSummary[];
  supportedChannels: UcProviderChannel[];
  whatsappConnected: boolean;
  cartrackConnected: boolean;
};

export type EnterpriseUnifiedCommunicationsAuraContext = {
  summary: string;
  activeProviderCount: number;
  pendingDraftCount: number;
  missedCallCount: number;
  totalCommunications: number;
  whatsappConnected: boolean;
};

export type CreateUcProviderAdapterRequest = {
  channel: UcProviderChannel;
  providerKey: string;
  name: string;
  endpointUrl?: string;
  credentialsVaultKey?: string;
  isPrimary?: boolean;
  config?: Record<string, unknown>;
};

export type CreateUcOutboundCampaignRequest = {
  campaignType: UcOutboundCallType;
  subject: string;
  scriptTemplate?: string;
  targetFilter?: Record<string, unknown>;
  consentRequired?: boolean;
  scheduledAt?: string;
};

export type UpdateUcPlatformConfigRequest = {
  globalPolicies?: Record<string, unknown>;
  aiVoiceSettings?: Record<string, unknown>;
  recordingPolicy?: Record<string, unknown>;
  retentionDays?: number;
  consentRequired?: boolean;
  routingRules?: Record<string, unknown>;
  notificationTemplates?: Record<string, unknown>;
};

export type CreateUcDispatchNotificationRequest = {
  jobId: string;
  customerId: string;
  notificationType: UcDispatchNotificationType;
  channel?: UcProviderChannel;
  recipientAddress?: string;
  messageBody?: string;
  etaMinutes?: number;
};
