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

export const rlmValidationStatusEnum = pgEnum('rlm_validation_status', [
  'pending',
  'running',
  'passed',
  'failed',
  'warning',
  'skipped',
]);
export const rlmReleaseStatusEnum = pgEnum('rlm_release_status', [
  'not_ready',
  'blocked',
  'warning',
  'ready',
  'released',
  'unknown',
]);
export const rlmStorePlatformEnum = pgEnum('rlm_store_platform', ['apple_app_store', 'google_play_store']);
export const rlmDocCategoryEnum = pgEnum('rlm_doc_category', [
  'system_overview',
  'administrator_guide',
  'user_guide',
  'deployment_guide',
  'disaster_recovery',
  'api_guide',
  'integration_guide',
  'changelog',
  'version_history',
]);
export const rlmChecklistStatusEnum = pgEnum('rlm_checklist_status', [
  'pending',
  'passed',
  'failed',
  'skipped',
  'manual',
]);
export const rlmPlatformAlertSeverityEnum = pgEnum('rlm_platform_alert_severity', ['info', 'warning', 'critical']);
export const rlmPlatformAlertStatusEnum = pgEnum('rlm_platform_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const rlmPlatformConfig = pgTable('rlm_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  releasePolicy: jsonb('release_policy').$type<Record<string, unknown>>().notNull().default({}),
  documentationPolicy: jsonb('documentation_policy').$type<Record<string, unknown>>().notNull().default({}),
  mobilePolicy: jsonb('mobile_policy').$type<Record<string, unknown>>().notNull().default({}),
  alertLevelConfig: jsonb('alert_level_config').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmMobilePackagingReviews = pgTable('rlm_mobile_packaging_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewKey: text('review_key').notNull(),
  status: rlmValidationStatusEnum('status').notNull().default('pending'),
  iosReady: boolean('ios_ready').notNull().default(false),
  androidReady: boolean('android_ready').notNull().default(false),
  findingCount: integer('finding_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  findings: jsonb('findings').$type<Array<Record<string, unknown>>>().notNull().default([]),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmAppStoreReadiness = pgTable('rlm_app_store_readiness', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewKey: text('review_key').notNull(),
  storePlatform: rlmStorePlatformEnum('store_platform').notNull(),
  status: rlmValidationStatusEnum('status').notNull().default('pending'),
  checklistCompleteCount: integer('checklist_complete_count').notNull().default(0),
  checklistTotalCount: integer('checklist_total_count').notNull().default(0),
  storeListing: jsonb('store_listing').$type<Record<string, unknown>>().notNull().default({}),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmBrandingReviews = pgTable('rlm_branding_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewKey: text('review_key').notNull(),
  status: rlmValidationStatusEnum('status').notNull().default('pending'),
  findingCount: integer('finding_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  findings: jsonb('findings').$type<Array<Record<string, unknown>>>().notNull().default([]),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmUxReviews = pgTable('rlm_ux_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewKey: text('review_key').notNull(),
  status: rlmValidationStatusEnum('status').notNull().default('pending'),
  recommendationCount: integer('recommendation_count').notNull().default(0),
  findings: jsonb('findings').$type<Array<Record<string, unknown>>>().notNull().default([]),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmDocumentationArtifacts = pgTable('rlm_documentation_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  docKey: text('doc_key').notNull(),
  docCategory: rlmDocCategoryEnum('doc_category').notNull(),
  title: text('title').notNull(),
  status: rlmValidationStatusEnum('status').notNull().default('pending'),
  completenessPercent: integer('completeness_percent').notNull().default(0),
  contentOutline: jsonb('content_outline').$type<Record<string, unknown>>().notNull().default({}),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmVersionRecords = pgTable('rlm_version_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  versionKey: text('version_key').notNull(),
  versionNumber: text('version_number').notNull().default('1.0.0'),
  versionName: text('version_name').notNull().default('TITAN Business OS v1.0.0'),
  status: rlmReleaseStatusEnum('status').notNull().default('unknown'),
  releaseNotes: jsonb('release_notes').$type<Record<string, unknown>>().notNull().default({}),
  featureSummary: jsonb('feature_summary').$type<Array<Record<string, unknown>>>().notNull().default([]),
  breakingChanges: jsonb('breaking_changes').$type<Array<Record<string, unknown>>>().notNull().default([]),
  migrationNotes: jsonb('migration_notes').$type<Array<Record<string, unknown>>>().notNull().default([]),
  knownLimitations: jsonb('known_limitations').$type<Array<Record<string, unknown>>>().notNull().default([]),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmLaunchChecklistItems = pgTable('rlm_launch_checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  itemKey: text('item_key').notNull(),
  itemName: text('item_name').notNull(),
  category: text('category').notNull().default('release'),
  status: rlmChecklistStatusEnum('status').notNull().default('pending'),
  isRequired: boolean('is_required').notNull().default(true),
  notes: text('notes'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmPlatformAlerts = pgTable('rlm_platform_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: rlmPlatformAlertSeverityEnum('severity').notNull().default('info'),
  status: rlmPlatformAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmAnalyticsSnapshots = pgTable('rlm_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rlmActionDrafts = pgTable('rlm_action_drafts', {
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

export const rlmAuditLogs = pgTable('rlm_audit_logs', {
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
