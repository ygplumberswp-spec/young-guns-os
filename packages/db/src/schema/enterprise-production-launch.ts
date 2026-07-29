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

export const plValidationStatusEnum = pgEnum('pl_validation_status', [
  'pending',
  'running',
  'passed',
  'failed',
  'warning',
  'skipped',
]);
export const plLaunchStatusEnum = pgEnum('pl_launch_status', [
  'not_ready',
  'blocked',
  'warning',
  'ready',
  'launched',
  'unknown',
]);
export const plProviderCategoryEnum = pgEnum('pl_provider_category', [
  'xero',
  'email',
  'whatsapp',
  'sms',
  'payments',
  'cartrack',
  'ai',
  'storage',
  'connectors',
]);
export const plDeploymentStatusEnum = pgEnum('pl_deployment_status', [
  'draft',
  'pending_approval',
  'approved',
  'deploying',
  'deployed',
  'failed',
  'rolled_back',
  'cancelled',
]);
export const plWizardStatusEnum = pgEnum('pl_wizard_status', [
  'draft',
  'in_progress',
  'pending_approval',
  'approved',
  'launched',
  'blocked',
  'cancelled',
]);
export const plWizardStepStatusEnum = pgEnum('pl_wizard_step_status', [
  'pending',
  'in_progress',
  'passed',
  'failed',
  'blocked',
  'skipped',
]);
export const plInsightSeverityEnum = pgEnum('pl_insight_severity', ['info', 'warning', 'high', 'critical']);
export const plPlatformAlertSeverityEnum = pgEnum('pl_platform_alert_severity', ['info', 'warning', 'critical']);
export const plPlatformAlertStatusEnum = pgEnum('pl_platform_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const plPlatformConfig = pgTable('pl_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  deploymentPolicy: jsonb('deployment_policy').$type<Record<string, unknown>>().notNull().default({}),
  providerPolicy: jsonb('provider_policy').$type<Record<string, unknown>>().notNull().default({}),
  launchPolicy: jsonb('launch_policy').$type<Record<string, unknown>>().notNull().default({}),
  alertLevelConfig: jsonb('alert_level_config').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plEnvironmentReviews = pgTable('pl_environment_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewKey: text('review_key').notNull(),
  status: plValidationStatusEnum('status').notNull().default('pending'),
  missingConfigCount: integer('missing_config_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  passedCount: integer('passed_count').notNull().default(0),
  findings: jsonb('findings').$type<Array<Record<string, unknown>>>().notNull().default([]),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plDomainSecurityReviews = pgTable('pl_domain_security_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewKey: text('review_key').notNull(),
  status: plValidationStatusEnum('status').notNull().default('pending'),
  findingCount: integer('finding_count').notNull().default(0),
  criticalCount: integer('critical_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  findings: jsonb('findings').$type<Array<Record<string, unknown>>>().notNull().default([]),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plLiveIntegrationVerificationRuns = pgTable('pl_live_integration_verification_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  runKey: text('run_key').notNull(),
  status: plValidationStatusEnum('status').notNull().default('pending'),
  providerCount: integer('provider_count').notNull().default(0),
  connectedCount: integer('connected_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plLiveIntegrationVerificationResults = pgTable('pl_live_integration_verification_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  verificationRunId: uuid('verification_run_id')
    .notNull()
    .references(() => plLiveIntegrationVerificationRuns.id, { onDelete: 'cascade' }),
  providerKey: text('provider_key').notNull(),
  providerName: text('provider_name').notNull(),
  category: plProviderCategoryEnum('category'),
  status: plValidationStatusEnum('status').notNull().default('pending'),
  severity: plInsightSeverityEnum('severity').notNull().default('info'),
  message: text('message'),
  recommendation: text('recommendation'),
  durationMs: integer('duration_ms'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plDeploymentPipelineRuns = pgTable('pl_deployment_pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  runKey: text('run_key').notNull(),
  status: plDeploymentStatusEnum('status').notNull().default('draft'),
  environment: text('environment').notNull().default('production'),
  healthVerified: boolean('health_verified').notNull().default(false),
  smokeTestPassed: boolean('smoke_test_passed').notNull().default(false),
  ownerApproved: boolean('owner_approved').notNull().default(false),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  deployedAt: timestamp('deployed_at', { withTimezone: true }),
  rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
  smokeTests: jsonb('smoke_tests').$type<Array<Record<string, unknown>>>().notNull().default([]),
  deploymentReport: jsonb('deployment_report').$type<Record<string, unknown>>().notNull().default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plCommercialReadinessReviews = pgTable('pl_commercial_readiness_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewKey: text('review_key').notNull(),
  status: plValidationStatusEnum('status').notNull().default('pending'),
  findingCount: integer('finding_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  report: jsonb('report').$type<Record<string, unknown>>().notNull().default({}),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plMobileProductionReviews = pgTable('pl_mobile_production_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewKey: text('review_key').notNull(),
  status: plValidationStatusEnum('status').notNull().default('pending'),
  findingCount: integer('finding_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  report: jsonb('report').$type<Record<string, unknown>>().notNull().default({}),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plGoLiveWizards = pgTable('pl_go_live_wizards', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  wizardKey: text('wizard_key').notNull(),
  title: text('title').notNull(),
  status: plWizardStatusEnum('status').notNull().default('draft'),
  currentStepKey: text('current_step_key'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  launchedAt: timestamp('launched_at', { withTimezone: true }),
  launchConfirmed: boolean('launch_confirmed').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plGoLiveWizardSteps = pgTable('pl_go_live_wizard_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  goLiveWizardId: uuid('go_live_wizard_id')
    .notNull()
    .references(() => plGoLiveWizards.id, { onDelete: 'cascade' }),
  stepKey: text('step_key').notNull(),
  stepName: text('step_name').notNull(),
  stepOrder: integer('step_order').notNull().default(0),
  status: plWizardStepStatusEnum('status').notNull().default('pending'),
  notes: text('notes'),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plPlatformAlerts = pgTable('pl_platform_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: plPlatformAlertSeverityEnum('severity').notNull().default('info'),
  status: plPlatformAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plAnalyticsSnapshots = pgTable('pl_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plActionDrafts = pgTable('pl_action_drafts', {
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

export const plAuditLogs = pgTable('pl_audit_logs', {
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

export type PlPlatformConfig = typeof plPlatformConfig.$inferSelect;
export type PlGoLiveWizard = typeof plGoLiveWizards.$inferSelect;
export type PlDeploymentPipelineRun = typeof plDeploymentPipelineRuns.$inferSelect;
