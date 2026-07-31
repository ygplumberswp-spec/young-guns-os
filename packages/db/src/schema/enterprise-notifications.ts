import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const ncAlertLevelEnum = pgEnum('nc_alert_level', [
  'info',
  'success',
  'warning',
  'critical',
  'emergency',
]);
export const ncAlertStatusEnum = pgEnum('nc_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'escalated',
  'expired',
]);
export const ncDeliveryChannelEnum = pgEnum('nc_delivery_channel', [
  'in_app',
  'email',
  'sms',
  'whatsapp',
  'push',
  'slack',
  'microsoft_teams',
  'webhook',
]);
export const ncDeliveryStatusEnum = pgEnum('nc_delivery_status', [
  'queued',
  'sent',
  'delivered',
  'failed',
  'read',
  'acknowledged',
  'dismissed',
  'escalated',
]);
export const ncEscalationStatusEnum = pgEnum('nc_escalation_status', [
  'pending',
  'acknowledged',
  'resolved',
  'escalated',
  'expired',
]);
export const ncRuleScopeEnum = pgEnum('nc_rule_scope', ['user', 'role', 'department', 'company']);
export const ncModuleSourceEnum = pgEnum('nc_module_source', [
  'crm',
  'leads',
  'customers',
  'jobs',
  'quotes',
  'scheduling',
  'dispatch',
  'fleet',
  'inventory',
  'procurement',
  'finance',
  'documents',
  'document_ai',
  'communications',
  'voice_reception',
  'ai_agents',
  'mission_control',
  'security',
  'saas_management',
  'industry_packs',
  'business_continuity',
  'data_migration',
]);
export const ncPlatformAlertSeverityEnum = pgEnum('nc_platform_alert_severity', [
  'info',
  'warning',
  'critical',
]);
export const ncPlatformAlertStatusEnum = pgEnum('nc_platform_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);
export const ncDeliveryModeEnum = pgEnum('nc_delivery_mode', [
  'immediate',
  'digest',
  'quiet_hours',
]);

export const ncPlatformConfig = pgTable('nc_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  deliveryPolicy: jsonb('delivery_policy').$type<Record<string, unknown>>().notNull().default({}),
  escalationPolicy: jsonb('escalation_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  quietHoursPolicy: jsonb('quiet_hours_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  alertLevelConfig: jsonb('alert_level_config')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncNotificationRules = pgTable('nc_notification_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  scope: ncRuleScopeEnum('scope').notNull().default('company'),
  scopeRefId: uuid('scope_ref_id'),
  moduleSource: ncModuleSourceEnum('module_source'),
  eventType: text('event_type'),
  severity: ncAlertLevelEnum('severity'),
  deliveryMode: ncDeliveryModeEnum('delivery_mode').notNull().default('immediate'),
  channels: jsonb('channels').$type<string[]>().notNull().default([]),
  quietHoursEnabled: boolean('quiet_hours_enabled').notNull().default(false),
  digestEnabled: boolean('digest_enabled').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(0),
  conditions: jsonb('conditions').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncNotificationTemplates = pgTable('nc_notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  templateKey: text('template_key').notNull(),
  name: text('name').notNull(),
  moduleSource: ncModuleSourceEnum('module_source'),
  eventType: text('event_type'),
  subjectTemplate: text('subject_template').notNull(),
  bodyTemplate: text('body_template').notNull(),
  variables: jsonb('variables').$type<string[]>().notNull().default([]),
  locale: text('locale').notNull().default('en'),
  branding: jsonb('branding').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncDeliveryJobs = pgTable('nc_delivery_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertId: uuid('alert_id'),
  notificationId: uuid('notification_id'),
  templateId: uuid('template_id').references(() => ncNotificationTemplates.id, {
    onDelete: 'set null',
  }),
  recipientUserId: uuid('recipient_user_id').references(() => users.id, { onDelete: 'set null' }),
  channel: ncDeliveryChannelEnum('channel').notNull(),
  status: ncDeliveryStatusEnum('status').notNull().default('queued'),
  moduleSource: ncModuleSourceEnum('module_source'),
  eventType: text('event_type'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  providerAdapterId: uuid('provider_adapter_id'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncDeliveryEvents = pgTable('nc_delivery_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  deliveryJobId: uuid('delivery_job_id')
    .notNull()
    .references(() => ncDeliveryJobs.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  status: ncDeliveryStatusEnum('status').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncAlerts = pgTable('nc_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  alertLevel: ncAlertLevelEnum('alert_level').notNull().default('info'),
  status: ncAlertStatusEnum('status').notNull().default('open'),
  moduleSource: ncModuleSourceEnum('module_source'),
  eventType: text('event_type'),
  sourceEntityType: text('source_entity_type'),
  sourceEntityId: uuid('source_entity_id'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncEscalations = pgTable('nc_escalations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertId: uuid('alert_id')
    .notNull()
    .references(() => ncAlerts.id, { onDelete: 'cascade' }),
  escalationStep: integer('escalation_step').notNull().default(1),
  status: ncEscalationStatusEnum('status').notNull().default('pending'),
  escalateToType: text('escalate_to_type').notNull().default('role'),
  escalateToRef: text('escalate_to_ref'),
  escalateAfterMinutes: integer('escalate_after_minutes').notNull().default(30),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncInboxState = pgTable('nc_inbox_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  notificationId: uuid('notification_id').notNull(),
  isPinned: boolean('is_pinned').notNull().default(false),
  isArchived: boolean('is_archived').notNull().default(false),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncUserPreferences = pgTable('nc_user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  channel: ncDeliveryChannelEnum('channel').notNull(),
  moduleSource: ncModuleSourceEnum('module_source'),
  eventType: text('event_type'),
  enabled: boolean('enabled').notNull().default(true),
  deliveryMode: ncDeliveryModeEnum('delivery_mode').notNull().default('immediate'),
  quietHoursEnabled: boolean('quiet_hours_enabled').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncPlatformAlerts = pgTable('nc_platform_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: ncPlatformAlertSeverityEnum('severity').notNull().default('info'),
  status: ncPlatformAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  deliveryJobId: uuid('delivery_job_id').references(() => ncDeliveryJobs.id, {
    onDelete: 'set null',
  }),
  alertId: uuid('alert_id').references(() => ncAlerts.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncAnalyticsSnapshots = pgTable('nc_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncActionDrafts = pgTable('nc_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ncAuditLogs = pgTable('nc_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NcPlatformConfig = typeof ncPlatformConfig.$inferSelect;
export type NcNotificationRule = typeof ncNotificationRules.$inferSelect;
export type NcNotificationTemplate = typeof ncNotificationTemplates.$inferSelect;
export type NcDeliveryJob = typeof ncDeliveryJobs.$inferSelect;
export type NcDeliveryEvent = typeof ncDeliveryEvents.$inferSelect;
export type NcAlert = typeof ncAlerts.$inferSelect;
export type NcEscalation = typeof ncEscalations.$inferSelect;
export type NcInboxState = typeof ncInboxState.$inferSelect;
export type NcUserPreference = typeof ncUserPreferences.$inferSelect;
export type NcPlatformAlert = typeof ncPlatformAlerts.$inferSelect;
export type NcAnalyticsSnapshot = typeof ncAnalyticsSnapshots.$inferSelect;
export type NcActionDraft = typeof ncActionDrafts.$inferSelect;
export type NcAuditLog = typeof ncAuditLogs.$inferSelect;
