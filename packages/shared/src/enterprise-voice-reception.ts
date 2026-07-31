import type {
  CommIntelRecordingSummary,
  CommIntelUnifiedDashboard,
} from './communications-intelligence.js';
import type { VoiceSessionSummary, VoiceStats } from './voice.js';
import type {
  UcProviderAdapterSummary,
  UcVoiceReceptionistSummary,
} from './enterprise-unified-communications.js';

export type VrPlatformConfigSummary = {
  telephonyPolicy: Record<string, unknown>;
  receptionistPolicy: Record<string, unknown>;
  routingPolicy: Record<string, unknown>;
  recordingPolicy: Record<string, unknown>;
  languagePolicy: Record<string, unknown>;
  auditRetentionDays: number;
};

export type VrTelephonyProviderSummary = {
  id: string;
  providerKey: string;
  name: string;
  enabled: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type VrExtensionSummary = {
  id: string;
  extensionKey: string;
  name: string;
  destinationType: string;
  destinationRef: string | null;
  locationKey: string | null;
  workflowStatus: string;
};

export type VrRingGroupSummary = {
  id: string;
  groupKey: string;
  name: string;
  extensionIds: string[];
  strategy: string;
  workflowStatus: string;
};

export type VrCallQueueSummary = {
  id: string;
  queueKey: string;
  name: string;
  maxWaitSeconds: number | null;
  overflowDestination: string | null;
  workflowStatus: string;
};

export type VrRoutingRuleSummary = {
  id: string;
  ruleKey: string;
  name: string;
  priority: number;
  destinationType: string;
  destinationRef: string | null;
  workflowStatus: string;
};

export type VrBusinessHoursSummary = {
  id: string;
  scheduleKey: string;
  name: string;
  timezone: string;
  afterHoursDestination: string | null;
  workflowStatus: string;
};

export type VrEmergencyRuleSummary = {
  id: string;
  ruleKey: string;
  name: string;
  triggerKeywords: string[];
  priority: number;
  workflowStatus: string;
};

export type VrVoicemailPolicySummary = {
  id: string;
  policyKey: string;
  name: string;
  greetingText: string | null;
  retentionDays: number;
  workflowStatus: string;
};

export type VrAiReceptionistConfigSummary = {
  enabled: boolean;
  welcomeMessage: string | null;
  confidenceThreshold: number;
  escalationPolicy: Record<string, unknown>;
  knowledgePolicy: Record<string, unknown>;
};

export type VrLanguageConfigSummary = {
  id: string;
  languageCode: string;
  name: string;
  isDefault: boolean;
};

export type VrLocationConfigSummary = {
  id: string;
  locationKey: string;
  name: string;
  businessHoursId: string | null;
};

export type VrCallIntelligenceSummary = {
  id: string;
  voiceSessionId: string | null;
  durationSeconds: number | null;
  queueTimeSeconds: number | null;
  holdTimeSeconds: number | null;
  transferCount: number;
  outcome: string | null;
  sentiment: string | null;
  intent: string | null;
  category: string | null;
  actionItems: string[];
  followUps: string[];
  capturedAt: string;
};

export type VrConversationDraftSummary = {
  id: string;
  voiceSessionId: string | null;
  draftType: string;
  title: string;
  content: string;
  approvalRequired: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type VrRecordingPolicySummary = {
  id: string;
  policyKey: string;
  name: string;
  consentRequired: boolean;
  retentionDays: number;
  workflowStatus: string;
};

export type VrQualitySummary = {
  callQualityScore: number | null;
  responseQualityScore: number | null;
  transferRate: number;
  escalationRate: number;
  bookingSuccessRate: number;
  customerSatisfactionScore: number | null;
  resolutionRate: number;
  capturedAt: string | null;
};

export type VrVoiceAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  createdAt: string;
};

export type VrActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  workflowStatus: string;
  createdAt: string;
};

export type VrAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type VrAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type VrLiveCallSummary = VoiceSessionSummary & {
  queuePosition: number | null;
  isEmergency: boolean;
};

export type EnterpriseVoiceReceptionDashboard = {
  summary: string;
  platformConfig: VrPlatformConfigSummary;
  voiceStats: VoiceStats;
  activeCallCount: number;
  queuedCallCount: number;
  missedCallCount: number;
  aiReceptionist: VrAiReceptionistConfigSummary;
  legacyVoiceReceptionist: UcVoiceReceptionistSummary | null;
  telephonyProviders: VrTelephonyProviderSummary[];
  providerAdapters: UcProviderAdapterSummary[];
  activeProviderCount: number;
  extensions: VrExtensionSummary[];
  ringGroups: VrRingGroupSummary[];
  callQueues: VrCallQueueSummary[];
  routingRules: VrRoutingRuleSummary[];
  businessHours: VrBusinessHoursSummary[];
  emergencyRules: VrEmergencyRuleSummary[];
  voicemailPolicies: VrVoicemailPolicySummary[];
  languageConfigs: VrLanguageConfigSummary[];
  locationConfigs: VrLocationConfigSummary[];
  liveCalls: VrLiveCallSummary[];
  callHistory: VoiceSessionSummary[];
  recordings: CommIntelRecordingSummary[];
  callIntelligence: VrCallIntelligenceSummary[];
  conversationDrafts: VrConversationDraftSummary[];
  quality: VrQualitySummary;
  analytics: VrAnalyticsSummary | null;
  recentAlerts: VrVoiceAlertSummary[];
  openAlertCount: number;
  communicationsIntelligence: CommIntelUnifiedDashboard | null;
  overallVoiceHealthStatus: string;
};

export type EnterpriseVoiceReceptionAuraContext = {
  summary: string;
  activeCallCount: number;
  queuedCallCount: number;
  missedCallCount: number;
  aiReceptionistEnabled: boolean;
  openAlertCount: number;
  overallVoiceHealthStatus: string;
};

export type UpdateVrPlatformConfigRequest = {
  telephonyPolicy?: Record<string, unknown>;
  receptionistPolicy?: Record<string, unknown>;
  routingPolicy?: Record<string, unknown>;
  recordingPolicy?: Record<string, unknown>;
  languagePolicy?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateVrTelephonyProviderRequest = {
  providerKey: string;
  name: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export type CreateVrExtensionRequest = {
  extensionKey: string;
  name: string;
  destinationType: string;
  destinationRef?: string;
  locationKey?: string;
};

export type CreateVrRingGroupRequest = {
  groupKey: string;
  name: string;
  extensionIds?: string[];
  strategy?: string;
};

export type CreateVrCallQueueRequest = {
  queueKey: string;
  name: string;
  maxWaitSeconds?: number;
  overflowDestination?: string;
};

export type CreateVrRoutingRuleRequest = {
  ruleKey: string;
  name: string;
  priority?: number;
  matchCriteria?: Record<string, unknown>;
  destinationType: string;
  destinationRef?: string;
};

export type CreateVrBusinessHoursRequest = {
  scheduleKey: string;
  name: string;
  timezone?: string;
  weeklySchedule?: Record<string, unknown>;
  holidayOverrides?: Record<string, unknown>;
  afterHoursDestination?: string;
};

export type CreateVrEmergencyRuleRequest = {
  ruleKey: string;
  name: string;
  triggerKeywords?: string[];
  escalationWorkflow?: Record<string, unknown>;
  priority?: number;
};

export type CreateVrVoicemailPolicyRequest = {
  policyKey: string;
  name: string;
  greetingText?: string;
  retentionDays?: number;
  config?: Record<string, unknown>;
};

export type UpdateVrAiReceptionistConfigRequest = {
  enabled?: boolean;
  welcomeMessage?: string;
  confidenceThreshold?: number;
  escalationPolicy?: Record<string, unknown>;
  knowledgePolicy?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type CreateVrLanguageConfigRequest = {
  languageCode: string;
  name: string;
  isDefault?: boolean;
  config?: Record<string, unknown>;
};

export type CreateVrLocationConfigRequest = {
  locationKey: string;
  name: string;
  routingConfig?: Record<string, unknown>;
  businessHoursId?: string;
};

export type CreateVrCallIntelligenceRequest = {
  voiceSessionId?: string;
  durationSeconds?: number;
  queueTimeSeconds?: number;
  holdTimeSeconds?: number;
  transferCount?: number;
  outcome?: string;
  sentiment?: string;
  intent?: string;
  category?: string;
  actionItems?: string[];
  followUps?: string[];
  metrics?: Record<string, unknown>;
};

export type CreateVrConversationDraftRequest = {
  voiceSessionId?: string;
  draftType: string;
  title: string;
  content: string;
  approvalRequired?: boolean;
};

export type CreateVrActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};
