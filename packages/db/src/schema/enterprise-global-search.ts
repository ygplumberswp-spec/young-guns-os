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

export const gsAlertSeverityEnum = pgEnum('gs_alert_severity', ['info', 'warning', 'critical']);

export const gsAlertStatusEnum = pgEnum('gs_alert_status', ['open', 'acknowledged', 'resolved', 'dismissed']);

export const gsSearchModeEnum = pgEnum('gs_search_mode', ['keyword', 'fuzzy', 'natural_language', 'hybrid']);

export const gsEntityTypeEnum = pgEnum('gs_entity_type', [
  'customer',
  'lead',
  'contact',
  'job',
  'quote',
  'invoice',
  'payment',
  'purchase_order',
  'supplier',
  'inventory',
  'asset',
  'vehicle',
  'technician',
  'property',
  'document',
  'ocr_content',
  'knowledge_article',
  'communication',
  'email',
  'whatsapp',
  'note',
  'task',
  'calendar_event',
  'ai_conversation',
  'audit_log',
  'automation',
  'industry_pack',
  'other',
]);

export const gsTimelineEventTypeEnum = pgEnum('gs_timeline_event_type', [
  'lead_created',
  'quote_sent',
  'quote_accepted',
  'job_booked',
  'technician_assigned',
  'vehicle_dispatched',
  'work_completed',
  'invoice_issued',
  'payment_received',
  'whatsapp_conversation',
  'email_history',
  'document_uploaded',
  'ai_interaction',
  'note_added',
  'task_created',
  'calendar_event',
  'communication',
  'automation_run',
  'other',
]);

export const gsFeedScopeEnum = pgEnum('gs_feed_scope', [
  'personal',
  'team',
  'company',
  'department',
  'ai',
  'system',
]);

export const gsIndexStatusEnum = pgEnum('gs_index_status', ['pending', 'indexed', 'failed']);

export const gsPlatformConfig = pgTable('gs_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  searchPolicy: jsonb('search_policy').$type<Record<string, unknown>>().notNull().default({}),
  timelinePolicy: jsonb('timeline_policy').$type<Record<string, unknown>>().notNull().default({}),
  feedPolicy: jsonb('feed_policy').$type<Record<string, unknown>>().notNull().default({}),
  indexPolicy: jsonb('index_policy').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsSearchIndexEntries = pgTable('gs_search_index_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityType: gsEntityTypeEnum('entity_type').notNull(),
  sourceModule: text('source_module').notNull(),
  sourceEntityId: uuid('source_entity_id').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  searchableText: text('searchable_text').notNull(),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  requiredPermissions: jsonb('required_permissions').$type<string[]>().notNull().default([]),
  status: gsIndexStatusEnum('status').notNull().default('indexed'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsSavedSearches = pgTable('gs_saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  query: text('query').notNull(),
  searchMode: gsSearchModeEnum('search_mode').notNull().default('hybrid'),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  entityTypes: jsonb('entity_types').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsRecentSearches = pgTable('gs_recent_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  query: text('query').notNull(),
  searchMode: gsSearchModeEnum('search_mode').notNull().default('hybrid'),
  resultCount: integer('result_count').notNull().default(0),
  searchedAt: timestamp('searched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsSearchSuggestions = pgTable('gs_search_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  suggestionText: text('suggestion_text').notNull(),
  suggestionType: text('suggestion_type').notNull().default('ai_assisted'),
  entityType: gsEntityTypeEnum('entity_type'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsTimelineEntries = pgTable('gs_timeline_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  entityType: gsEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  eventType: gsTimelineEventTypeEnum('event_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module').notNull(),
  sourceEntityId: uuid('source_entity_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsRelationshipLinks = pgTable('gs_relationship_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  fromEntityType: gsEntityTypeEnum('from_entity_type').notNull(),
  fromEntityId: uuid('from_entity_id').notNull(),
  toEntityType: gsEntityTypeEnum('to_entity_type').notNull(),
  toEntityId: uuid('to_entity_id').notNull(),
  relationshipType: text('relationship_type').notNull(),
  sourceModule: text('source_module').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsActivityFeedItems = pgTable('gs_activity_feed_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  feedScope: gsFeedScopeEnum('feed_scope').notNull().default('company'),
  eventType: text('event_type').notNull(),
  moduleKey: text('module_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  entityType: gsEntityTypeEnum('entity_type'),
  entityId: uuid('entity_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsActivityFeedConfigs = pgTable('gs_activity_feed_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  feedScope: gsFeedScopeEnum('feed_scope').notNull().default('personal'),
  name: text('name').notNull(),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsSearchAlerts = pgTable('gs_search_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: gsAlertSeverityEnum('severity').notNull().default('warning'),
  status: gsAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsAnalyticsSnapshots = pgTable('gs_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gsActionDrafts = pgTable('gs_action_drafts', {
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

export const gsAuditLogs = pgTable('gs_audit_logs', {
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

export type GsPlatformConfig = typeof gsPlatformConfig.$inferSelect;
export type GsSearchAlert = typeof gsSearchAlerts.$inferSelect;
