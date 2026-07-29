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

export const rcValidationStatusEnum = pgEnum('rc_validation_status', [
  'pending',
  'running',
  'passed',
  'failed',
  'warning',
  'skipped',
]);
export const rcReleaseStatusEnum = pgEnum('rc_release_status', [
  'not_ready',
  'blocked',
  'warning',
  'ready',
  'unknown',
]);
export const rcIntegrationCategoryEnum = pgEnum('rc_integration_category', [
  'authentication',
  'rbac',
  'multi_tenancy',
  'crm',
  'leads',
  'customers',
  'jobs',
  'scheduling',
  'dispatch',
  'fleet',
  'inventory',
  'procurement',
  'finance',
  'payments',
  'xero',
  'connectors',
  'communications',
  'whatsapp',
  'email',
  'voice_reception',
  'documents',
  'document_ai',
  'knowledge_graph',
  'ai_orchestration',
  'mission_control',
  'security',
  'saas',
  'industry_packs',
  'business_continuity',
  'launch_center',
]);
export const rcWorkflowCategoryEnum = pgEnum('rc_workflow_category', [
  'lead_to_customer',
  'quote_to_job',
  'dispatch',
  'completion',
  'invoice',
  'payment',
  'customer_history',
  'procurement',
  'inventory',
  'fleet',
  'notifications',
  'automation',
  'ai_workflow',
  'customer_portal',
  'mobile',
]);
export const rcInsightSeverityEnum = pgEnum('rc_insight_severity', ['info', 'warning', 'high', 'critical']);
export const rcPlatformAlertSeverityEnum = pgEnum('rc_platform_alert_severity', ['info', 'warning', 'critical']);
export const rcPlatformAlertStatusEnum = pgEnum('rc_platform_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);
export const rcChecklistStatusEnum = pgEnum('rc_checklist_status', ['pending', 'passed', 'failed', 'skipped', 'manual']);

export const rcPlatformConfig = pgTable('rc_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  validationPolicy: jsonb('validation_policy').$type<Record<string, unknown>>().notNull().default({}),
  performancePolicy: jsonb('performance_policy').$type<Record<string, unknown>>().notNull().default({}),
  releasePolicy: jsonb('release_policy').$type<Record<string, unknown>>().notNull().default({}),
  alertLevelConfig: jsonb('alert_level_config').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcIntegrationValidationRuns = pgTable('rc_integration_validation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  runKey: text('run_key').notNull(),
  status: rcValidationStatusEnum('status').notNull().default('pending'),
  checkCount: integer('check_count').notNull().default(0),
  passedCount: integer('passed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcIntegrationValidationResults = pgTable('rc_integration_validation_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  validationRunId: uuid('validation_run_id')
    .notNull()
    .references(() => rcIntegrationValidationRuns.id, { onDelete: 'cascade' }),
  checkKey: text('check_key').notNull(),
  checkName: text('check_name').notNull(),
  category: rcIntegrationCategoryEnum('category'),
  status: rcValidationStatusEnum('status').notNull().default('pending'),
  severity: rcInsightSeverityEnum('severity').notNull().default('info'),
  message: text('message'),
  recommendation: text('recommendation'),
  durationMs: integer('duration_ms'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcWorkflowValidationRuns = pgTable('rc_workflow_validation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  runKey: text('run_key').notNull(),
  status: rcValidationStatusEnum('status').notNull().default('pending'),
  stepCount: integer('step_count').notNull().default(0),
  passedCount: integer('passed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcWorkflowValidationResults = pgTable('rc_workflow_validation_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  workflowRunId: uuid('workflow_run_id')
    .notNull()
    .references(() => rcWorkflowValidationRuns.id, { onDelete: 'cascade' }),
  stepKey: text('step_key').notNull(),
  stepName: text('step_name').notNull(),
  category: rcWorkflowCategoryEnum('category'),
  status: rcValidationStatusEnum('status').notNull().default('pending'),
  message: text('message'),
  durationMs: integer('duration_ms'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcPerformanceSnapshots = pgTable('rc_performance_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  snapshotKey: text('snapshot_key').notNull(),
  slowEndpointCount: integer('slow_endpoint_count').notNull().default(0),
  slowQueryCount: integer('slow_query_count').notNull().default(0),
  queueDepth: integer('queue_depth').notNull().default(0),
  aiLatencyMs: integer('ai_latency_ms'),
  searchIndexCount: integer('search_index_count').notNull().default(0),
  dashboardLoadMs: integer('dashboard_load_ms'),
  optimizationOpportunities: jsonb('optimization_opportunities').$type<Array<Record<string, unknown>>>().notNull().default([]),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcSecurityVerificationRuns = pgTable('rc_security_verification_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  runKey: text('run_key').notNull(),
  status: rcValidationStatusEnum('status').notNull().default('pending'),
  findingCount: integer('finding_count').notNull().default(0),
  criticalCount: integer('critical_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  report: jsonb('report').$type<Record<string, unknown>>().notNull().default({}),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcConfigurationReviews = pgTable('rc_configuration_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewKey: text('review_key').notNull(),
  missingConfigCount: integer('missing_config_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  findings: jsonb('findings').$type<Array<Record<string, unknown>>>().notNull().default([]),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcReleaseCandidateReports = pgTable('rc_release_candidate_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reportKey: text('report_key').notNull(),
  readinessScore: integer('readiness_score'),
  overallStatus: rcReleaseStatusEnum('overall_status').notNull().default('unknown'),
  passedValidationCount: integer('passed_validation_count').notNull().default(0),
  failedValidationCount: integer('failed_validation_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  optimizationCount: integer('optimization_count').notNull().default(0),
  manualTaskCount: integer('manual_task_count').notNull().default(0),
  report: jsonb('report').$type<Record<string, unknown>>().notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcReleaseChecklistItems = pgTable('rc_release_checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  itemKey: text('item_key').notNull(),
  itemName: text('item_name').notNull(),
  category: text('category').notNull().default('release'),
  status: rcChecklistStatusEnum('status').notNull().default('pending'),
  isRequired: boolean('is_required').notNull().default(true),
  notes: text('notes'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcPlatformAlerts = pgTable('rc_platform_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: rcPlatformAlertSeverityEnum('severity').notNull().default('info'),
  status: rcPlatformAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcAnalyticsSnapshots = pgTable('rc_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rcActionDrafts = pgTable('rc_action_drafts', {
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

export const rcAuditLogs = pgTable('rc_audit_logs', {
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

export type RcPlatformConfig = typeof rcPlatformConfig.$inferSelect;
export type RcIntegrationValidationRun = typeof rcIntegrationValidationRuns.$inferSelect;
export type RcIntegrationValidationResult = typeof rcIntegrationValidationResults.$inferSelect;
export type RcWorkflowValidationRun = typeof rcWorkflowValidationRuns.$inferSelect;
export type RcWorkflowValidationResult = typeof rcWorkflowValidationResults.$inferSelect;
export type RcPerformanceSnapshot = typeof rcPerformanceSnapshots.$inferSelect;
export type RcSecurityVerificationRun = typeof rcSecurityVerificationRuns.$inferSelect;
export type RcConfigurationReview = typeof rcConfigurationReviews.$inferSelect;
export type RcReleaseCandidateReport = typeof rcReleaseCandidateReports.$inferSelect;
export type RcReleaseChecklistItem = typeof rcReleaseChecklistItems.$inferSelect;
export type RcPlatformAlert = typeof rcPlatformAlerts.$inferSelect;
export type RcAnalyticsSnapshot = typeof rcAnalyticsSnapshots.$inferSelect;
export type RcActionDraft = typeof rcActionDrafts.$inferSelect;
export type RcAuditLog = typeof rcAuditLogs.$inferSelect;
