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
import { voiceSessions } from './voice';

export const vrWorkflowStatusEnum = pgEnum('vr_workflow_status', [
  'draft',
  'review',
  'published',
  'deprecated',
  'archived',
]);

export const vrAlertSeverityEnum = pgEnum('vr_alert_severity', ['info', 'warning', 'critical']);

export const vrAlertStatusEnum = pgEnum('vr_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const vrPlatformConfig = pgTable('vr_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  telephonyPolicy: jsonb('telephony_policy').$type<Record<string, unknown>>().notNull().default({}),
  receptionistPolicy: jsonb('receptionist_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  routingPolicy: jsonb('routing_policy').$type<Record<string, unknown>>().notNull().default({}),
  recordingPolicy: jsonb('recording_policy').$type<Record<string, unknown>>().notNull().default({}),
  languagePolicy: jsonb('language_policy').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrTelephonyProviderConfigs = pgTable('vr_telephony_provider_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerKey: text('provider_key').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrExtensions = pgTable('vr_extensions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  extensionKey: text('extension_key').notNull(),
  name: text('name').notNull(),
  destinationType: text('destination_type').notNull(),
  destinationRef: text('destination_ref'),
  locationKey: text('location_key'),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrRingGroups = pgTable('vr_ring_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  groupKey: text('group_key').notNull(),
  name: text('name').notNull(),
  extensionIds: jsonb('extension_ids').$type<string[]>().notNull().default([]),
  strategy: text('strategy').notNull().default('simultaneous'),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrCallQueues = pgTable('vr_call_queues', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  queueKey: text('queue_key').notNull(),
  name: text('name').notNull(),
  maxWaitSeconds: integer('max_wait_seconds'),
  overflowDestination: text('overflow_destination'),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrRoutingRules = pgTable('vr_routing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ruleKey: text('rule_key').notNull(),
  name: text('name').notNull(),
  priority: integer('priority').notNull().default(100),
  matchCriteria: jsonb('match_criteria').$type<Record<string, unknown>>().notNull().default({}),
  destinationType: text('destination_type').notNull(),
  destinationRef: text('destination_ref'),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrBusinessHours = pgTable('vr_business_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  scheduleKey: text('schedule_key').notNull(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  weeklySchedule: jsonb('weekly_schedule').$type<Record<string, unknown>>().notNull().default({}),
  holidayOverrides: jsonb('holiday_overrides')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  afterHoursDestination: text('after_hours_destination'),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrEmergencyRules = pgTable('vr_emergency_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ruleKey: text('rule_key').notNull(),
  name: text('name').notNull(),
  triggerKeywords: jsonb('trigger_keywords').$type<string[]>().notNull().default([]),
  escalationWorkflow: jsonb('escalation_workflow')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  priority: integer('priority').notNull().default(1),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrVoicemailPolicies = pgTable('vr_voicemail_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyKey: text('policy_key').notNull(),
  name: text('name').notNull(),
  greetingText: text('greeting_text'),
  retentionDays: integer('retention_days').notNull().default(30),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrAiReceptionistConfig = pgTable('vr_ai_receptionist_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  welcomeMessage: text('welcome_message'),
  confidenceThreshold: integer('confidence_threshold').notNull().default(70),
  escalationPolicy: jsonb('escalation_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  knowledgePolicy: jsonb('knowledge_policy').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrLanguageConfigs = pgTable('vr_language_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  languageCode: text('language_code').notNull(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrLocationConfigs = pgTable('vr_location_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  locationKey: text('location_key').notNull(),
  name: text('name').notNull(),
  routingConfig: jsonb('routing_config').$type<Record<string, unknown>>().notNull().default({}),
  businessHoursId: uuid('business_hours_id').references(() => vrBusinessHours.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrCallIntelligenceRecords = pgTable('vr_call_intelligence_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, {
    onDelete: 'set null',
  }),
  durationSeconds: integer('duration_seconds'),
  queueTimeSeconds: integer('queue_time_seconds'),
  holdTimeSeconds: integer('hold_time_seconds'),
  transferCount: integer('transfer_count').notNull().default(0),
  outcome: text('outcome'),
  sentiment: text('sentiment'),
  intent: text('intent'),
  category: text('category'),
  actionItems: jsonb('action_items').$type<string[]>().notNull().default([]),
  followUps: jsonb('follow_ups').$type<string[]>().notNull().default([]),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrConversationDrafts = pgTable('vr_conversation_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, {
    onDelete: 'set null',
  }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  approvalRequired: boolean('approval_required').notNull().default(true),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrRecordingPolicies = pgTable('vr_recording_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyKey: text('policy_key').notNull(),
  name: text('name').notNull(),
  consentRequired: boolean('consent_required').notNull().default(true),
  retentionDays: integer('retention_days').notNull().default(90),
  regionalRules: jsonb('regional_rules').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrQualitySnapshots = pgTable('vr_quality_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrVoiceAlerts = pgTable('vr_voice_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: vrAlertSeverityEnum('severity').notNull().default('warning'),
  status: vrAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrActionDrafts = pgTable('vr_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  workflowStatus: vrWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrAnalyticsSnapshots = pgTable('vr_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vrAuditLogs = pgTable('vr_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type VrPlatformConfig = typeof vrPlatformConfig.$inferSelect;
export type VrVoiceAlert = typeof vrVoiceAlerts.$inferSelect;
