export type NcAlertLevel = 'info' | 'success' | 'warning' | 'critical' | 'emergency';

export type NcAlertStatus = 'open' | 'acknowledged' | 'resolved' | 'escalated' | 'expired';

export type NcDeliveryChannel =
  | 'in_app'
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'push'
  | 'slack'
  | 'microsoft_teams'
  | 'webhook';

export type NcDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'read'
  | 'acknowledged'
  | 'dismissed'
  | 'escalated';

export type NcEscalationStatus = 'pending' | 'acknowledged' | 'resolved' | 'escalated' | 'expired';

export type NcRuleScope = 'user' | 'role' | 'department' | 'company';

export type NcDeliveryMode = 'immediate' | 'digest' | 'quiet_hours';

export type NcModuleSource =
  | 'crm'
  | 'leads'
  | 'customers'
  | 'jobs'
  | 'quotes'
  | 'scheduling'
  | 'dispatch'
  | 'fleet'
  | 'inventory'
  | 'procurement'
  | 'finance'
  | 'documents'
  | 'document_ai'
  | 'communications'
  | 'voice_reception'
  | 'ai_agents'
  | 'mission_control'
  | 'security'
  | 'saas_management'
  | 'industry_packs'
  | 'business_continuity'
  | 'data_migration';

export type NcPlatformConfigSummary = {
  deliveryPolicy: Record<string, unknown>;
  escalationPolicy: Record<string, unknown>;
  quietHoursPolicy: Record<string, unknown>;
  alertLevelConfig: Record<string, unknown>;
  auditRetentionDays: number;
};

export type NcNotificationRuleSummary = {
  id: string;
  name: string;
  scope: NcRuleScope;
  scopeRefId: string | null;
  moduleSource: NcModuleSource | null;
  eventType: string | null;
  severity: NcAlertLevel | null;
  deliveryMode: NcDeliveryMode;
  channels: NcDeliveryChannel[];
  quietHoursEnabled: boolean;
  digestEnabled: boolean;
  isActive: boolean;
  priority: number;
  createdAt: string;
};

export type NcNotificationTemplateSummary = {
  id: string;
  templateKey: string;
  name: string;
  moduleSource: NcModuleSource | null;
  eventType: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  variables: string[];
  locale: string;
  isActive: boolean;
  createdAt: string;
};

export type NcDeliveryJobSummary = {
  id: string;
  alertId: string | null;
  notificationId: string | null;
  recipientUserId: string | null;
  channel: NcDeliveryChannel;
  status: NcDeliveryStatus;
  moduleSource: NcModuleSource | null;
  eventType: string | null;
  title: string;
  scheduledFor: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type NcDeliveryEventSummary = {
  id: string;
  deliveryJobId: string;
  eventType: string;
  status: NcDeliveryStatus;
  occurredAt: string;
};

export type NcAlertSummary = {
  id: string;
  title: string;
  description: string | null;
  alertLevel: NcAlertLevel;
  status: NcAlertStatus;
  moduleSource: NcModuleSource | null;
  eventType: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  assignedUserId: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type NcEscalationSummary = {
  id: string;
  alertId: string;
  escalationStep: number;
  status: NcEscalationStatus;
  escalateToType: string;
  escalateToRef: string | null;
  escalateAfterMinutes: number;
  escalatedAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type NcInboxItemSummary = {
  id: string;
  notificationType: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  isPinned: boolean;
  isArchived: boolean;
  snoozedUntil: string | null;
  createdAt: string;
};

export type NcUserPreferenceSummary = {
  id: string;
  channel: NcDeliveryChannel;
  moduleSource: NcModuleSource | null;
  eventType: string | null;
  enabled: boolean;
  deliveryMode: NcDeliveryMode;
  quietHoursEnabled: boolean;
};

export type NcPlatformAlertSummary = {
  id: string;
  alertType: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  deliveryJobId: string | null;
  alertId: string | null;
  createdAt: string;
};

export type NcAnalyticsSummary = {
  id: string;
  metrics: Record<string, unknown>;
  capturedAt: string;
};

export type NcAuditLogSummary = {
  id: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
};

export type NcActionDraftSummary = {
  id: string;
  draftType: string;
  title: string;
  content: string;
  aiGenerated: boolean;
  createdAt: string;
};

export type NcNotificationHealthSummary = {
  activeAlertCount: number;
  criticalAlertCount: number;
  failedDeliveryCount: number;
  queuedDeliveryCount: number;
  pendingEscalationCount: number;
  openPlatformAlertCount: number;
};

export type EnterpriseNotificationsDashboard = {
  summary: string;
  platformConfig: NcPlatformConfigSummary;
  notificationHealth: NcNotificationHealthSummary;
  inboxItems: NcInboxItemSummary[];
  alerts: NcAlertSummary[];
  escalations: NcEscalationSummary[];
  templates: NcNotificationTemplateSummary[];
  deliveryJobs: NcDeliveryJobSummary[];
  rules: NcNotificationRuleSummary[];
  userPreferences: NcUserPreferenceSummary[];
  analytics: NcAnalyticsSummary | null;
  recentAlerts: NcPlatformAlertSummary[];
  openAlertCount: number;
  overallNotificationHealthStatus: 'healthy' | 'degraded' | 'critical';
};

export type EnterpriseNotificationsAuraContext = {
  summary: string;
  activeAlertCount: number;
  failedDeliveryCount: number;
  pendingEscalationCount: number;
  openAlertCount: number;
  overallNotificationHealthStatus: 'healthy' | 'degraded' | 'critical';
};

export type CreateNcNotificationRuleRequest = {
  name: string;
  scope?: NcRuleScope;
  scopeRefId?: string;
  moduleSource?: NcModuleSource;
  eventType?: string;
  severity?: NcAlertLevel;
  deliveryMode?: NcDeliveryMode;
  channels?: NcDeliveryChannel[];
  quietHoursEnabled?: boolean;
  digestEnabled?: boolean;
  priority?: number;
  conditions?: Record<string, unknown>;
};

export type UpdateNcPlatformConfigRequest = {
  deliveryPolicy?: Record<string, unknown>;
  escalationPolicy?: Record<string, unknown>;
  quietHoursPolicy?: Record<string, unknown>;
  alertLevelConfig?: Record<string, unknown>;
  auditRetentionDays?: number;
};

export type CreateNcNotificationTemplateRequest = {
  templateKey: string;
  name: string;
  moduleSource?: NcModuleSource;
  eventType?: string;
  subjectTemplate: string;
  bodyTemplate: string;
  variables?: string[];
  locale?: string;
  branding?: Record<string, unknown>;
};

export type CreateNcAlertRequest = {
  title: string;
  description?: string;
  alertLevel?: NcAlertLevel;
  moduleSource?: NcModuleSource;
  eventType?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  assignedUserId?: string;
  expiresAt?: string;
};

export type DispatchNcNotificationRequest = {
  moduleSource: NcModuleSource;
  eventType: string;
  title: string;
  body: string;
  alertLevel?: NcAlertLevel;
  recipientUserId: string;
  channels?: NcDeliveryChannel[];
  sourceEntityType?: string;
  sourceEntityId?: string;
  templateKey?: string;
  templateVariables?: Record<string, string>;
};

export type UpdateNcInboxStateRequest = {
  notificationId: string;
  isPinned?: boolean;
  isArchived?: boolean;
  snoozedUntil?: string | null;
};

export type UpdateNcUserPreferenceRequest = {
  channel: NcDeliveryChannel;
  moduleSource?: NcModuleSource;
  eventType?: string;
  enabled?: boolean;
  deliveryMode?: NcDeliveryMode;
  quietHoursEnabled?: boolean;
};

export type CreateNcActionDraftRequest = {
  draftType: string;
  title: string;
  content: string;
  sourceRecords?: Record<string, unknown>;
  aiGenerated?: boolean;
};

export type PreviewNcTemplateRequest = {
  templateId: string;
  variables?: Record<string, string>;
};

export type NcTemplatePreview = {
  subject: string;
  body: string;
};
