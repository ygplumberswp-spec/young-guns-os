import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { jobs } from './jobs';
import { users } from './users';

export const ucProviderChannelEnum = pgEnum('uc_provider_channel', [
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
]);

export const ucProviderAdapterStatusEnum = pgEnum('uc_provider_adapter_status', [
  'active',
  'inactive',
  'testing',
  'error',
]);

export const ucOutboundCallTypeEnum = pgEnum('uc_outbound_call_type', [
  'appointment_confirmation',
  'reminder',
  'missed_appointment',
  'satisfaction',
  'payment_reminder',
  'maintenance_reminder',
  'quote_followup',
  'lead_qualification',
]);

export const ucOutboundCampaignStatusEnum = pgEnum('uc_outbound_campaign_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const ucDispatchNotificationTypeEnum = pgEnum('uc_dispatch_notification_type', [
  'appointment_confirmation',
  'technician_en_route',
  'eta',
  'tracking_link',
  'arrival',
  'completion',
  'invoice',
]);

export const ucDispatchNotificationStatusEnum = pgEnum('uc_dispatch_notification_status', [
  'pending',
  'sent',
  'failed',
  'skipped',
]);

export const ucTimelineEntryTypeEnum = pgEnum('uc_timeline_entry_type', [
  'call',
  'whatsapp',
  'sms',
  'email',
  'live_chat',
  'internal_note',
  'ai_summary',
  'attachment',
  'portal_message',
]);

export const ucPlatformConfig = pgTable('uc_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  globalPolicies: jsonb('global_policies').$type<Record<string, unknown>>().notNull().default({}),
  aiVoiceSettings: jsonb('ai_voice_settings')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  recordingPolicy: jsonb('recording_policy').$type<Record<string, unknown>>().notNull().default({}),
  retentionDays: integer('retention_days').notNull().default(365),
  consentRequired: boolean('consent_required').notNull().default(true),
  routingRules: jsonb('routing_rules').$type<Record<string, unknown>>().notNull().default({}),
  notificationTemplates: jsonb('notification_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ucProviderAdapters = pgTable('uc_provider_adapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  channel: ucProviderChannelEnum('channel').notNull(),
  providerKey: text('provider_key').notNull(),
  name: text('name').notNull(),
  status: ucProviderAdapterStatusEnum('status').notNull().default('inactive'),
  credentialsVaultKey: text('credentials_vault_key'),
  endpointUrl: text('endpoint_url'),
  isPrimary: boolean('is_primary').notNull().default(false),
  lastTestAt: timestamp('last_test_at', { withTimezone: true }),
  lastTestStatus: text('last_test_status'),
  lastTestMessage: text('last_test_message'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ucOutboundCallCampaigns = pgTable('uc_outbound_call_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  campaignType: ucOutboundCallTypeEnum('campaign_type').notNull(),
  status: ucOutboundCampaignStatusEnum('status').notNull().default('draft'),
  subject: text('subject').notNull(),
  scriptTemplate: text('script_template'),
  targetFilter: jsonb('target_filter').$type<Record<string, unknown>>().notNull().default({}),
  consentRequired: boolean('consent_required').notNull().default(true),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ucDispatchNotifications = pgTable('uc_dispatch_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  notificationType: ucDispatchNotificationTypeEnum('notification_type').notNull(),
  channel: ucProviderChannelEnum('channel'),
  providerAdapterId: uuid('provider_adapter_id').references(() => ucProviderAdapters.id, {
    onDelete: 'set null',
  }),
  status: ucDispatchNotificationStatusEnum('status').notNull().default('pending'),
  recipientAddress: text('recipient_address'),
  messageBody: text('message_body'),
  trackingLink: text('tracking_link'),
  etaMinutes: integer('eta_minutes'),
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ucTimelineIndex = pgTable('uc_timeline_index', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  entryType: ucTimelineEntryTypeEnum('entry_type').notNull(),
  channel: ucProviderChannelEnum('channel'),
  title: text('title').notNull(),
  summary: text('summary'),
  sourceModule: text('source_module').notNull(),
  sourceEntityId: uuid('source_entity_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ucAnalyticsSnapshots = pgTable('uc_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  callsAnswered: integer('calls_answered').notNull().default(0),
  callsMissed: integer('calls_missed').notNull().default(0),
  avgResponseTimeSeconds: numeric('avg_response_time_seconds', { precision: 10, scale: 2 }),
  aiResolutionRate: numeric('ai_resolution_rate', { precision: 5, scale: 2 }),
  humanTransferRate: numeric('human_transfer_rate', { precision: 5, scale: 2 }),
  bookingConversionRate: numeric('booking_conversion_rate', { precision: 5, scale: 2 }),
  leadConversionRate: numeric('lead_conversion_rate', { precision: 5, scale: 2 }),
  customerSatisfactionScore: numeric('customer_satisfaction_score', { precision: 5, scale: 2 }),
  channelUsage: jsonb('channel_usage').$type<Record<string, unknown>>().notNull().default({}),
  providerPerformance: jsonb('provider_performance')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ucAuditLogs = pgTable('uc_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  channel: ucProviderChannelEnum('channel'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UcPlatformConfig = typeof ucPlatformConfig.$inferSelect;
export type UcProviderAdapter = typeof ucProviderAdapters.$inferSelect;
export type UcOutboundCallCampaign = typeof ucOutboundCallCampaigns.$inferSelect;
export type UcDispatchNotification = typeof ucDispatchNotifications.$inferSelect;
export type UcTimelineIndexEntry = typeof ucTimelineIndex.$inferSelect;
export type UcAnalyticsSnapshot = typeof ucAnalyticsSnapshots.$inferSelect;
export type UcAuditLog = typeof ucAuditLogs.$inferSelect;
