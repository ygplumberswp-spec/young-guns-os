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

export const lncCheckStatusEnum = pgEnum('lnc_check_status', [
  'pending',
  'running',
  'passed',
  'failed',
  'warning',
  'skipped',
  'blocked',
]);
export const lncReadinessStatusEnum = pgEnum('lnc_readiness_status', [
  'not_ready',
  'blocked',
  'warning',
  'ready',
  'unknown',
]);
export const lncCheckCategoryEnum = pgEnum('lnc_check_category', [
  'platform',
  'tenant',
  'feature',
  'integration',
  'infrastructure',
  'security',
  'mobile',
  'saas',
  'authentication',
  'rbac',
  'database',
  'api',
  'workers',
  'scheduler',
  'ai',
  'connectors',
  'payments',
  'accounting',
  'fleet',
  'communications',
  'notifications',
  'document_ai',
  'backup',
  'disaster_recovery',
  'monitoring',
  'audit',
]);
export const lncWizardStatusEnum = pgEnum('lnc_wizard_status', [
  'draft',
  'in_progress',
  'pending_approval',
  'approved',
  'completed',
  'cancelled',
]);
export const lncWizardStepStatusEnum = pgEnum('lnc_wizard_step_status', [
  'pending',
  'in_progress',
  'passed',
  'failed',
  'blocked',
  'skipped',
]);
export const lncDeploymentStatusEnum = pgEnum('lnc_deployment_status', [
  'planned',
  'pending_validation',
  'validated',
  'failed',
  'cancelled',
]);
export const lncPlatformAlertSeverityEnum = pgEnum('lnc_platform_alert_severity', [
  'info',
  'warning',
  'critical',
]);
export const lncPlatformAlertStatusEnum = pgEnum('lnc_platform_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);
export const lncIssueSeverityEnum = pgEnum('lnc_issue_severity', [
  'info',
  'warning',
  'high',
  'critical',
]);

export const lncPlatformConfig = pgTable('lnc_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  readinessPolicy: jsonb('readiness_policy').$type<Record<string, unknown>>().notNull().default({}),
  scoringWeights: jsonb('scoring_weights').$type<Record<string, unknown>>().notNull().default({}),
  acceptancePolicy: jsonb('acceptance_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  goLivePolicy: jsonb('go_live_policy').$type<Record<string, unknown>>().notNull().default({}),
  rollbackPolicy: jsonb('rollback_policy').$type<Record<string, unknown>>().notNull().default({}),
  alertLevelConfig: jsonb('alert_level_config')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncReadinessScans = pgTable('lnc_readiness_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  scanKey: text('scan_key').notNull(),
  status: lncCheckStatusEnum('status').notNull().default('pending'),
  overallStatus: lncReadinessStatusEnum('overall_status').notNull().default('unknown'),
  checkCount: integer('check_count').notNull().default(0),
  passedCount: integer('passed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  criticalBlockerCount: integer('critical_blocker_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncReadinessCheckResults = pgTable('lnc_readiness_check_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  readinessScanId: uuid('readiness_scan_id')
    .notNull()
    .references(() => lncReadinessScans.id, { onDelete: 'cascade' }),
  checkKey: text('check_key').notNull(),
  checkName: text('check_name').notNull(),
  category: lncCheckCategoryEnum('category'),
  status: lncCheckStatusEnum('status').notNull().default('pending'),
  severity: lncIssueSeverityEnum('severity').notNull().default('info'),
  message: text('message'),
  recommendation: text('recommendation'),
  durationMs: integer('duration_ms'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncAcceptanceTestSuites = pgTable('lnc_acceptance_test_suites', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  suiteKey: text('suite_key').notNull(),
  suiteName: text('suite_name').notNull(),
  description: text('description'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  testKeys: jsonb('test_keys').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncAcceptanceTestRuns = pgTable('lnc_acceptance_test_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  suiteId: uuid('suite_id').references(() => lncAcceptanceTestSuites.id, { onDelete: 'set null' }),
  runKey: text('run_key').notNull(),
  status: lncCheckStatusEnum('status').notNull().default('pending'),
  testCount: integer('test_count').notNull().default(0),
  passedCount: integer('passed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncAcceptanceTestResults = pgTable('lnc_acceptance_test_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  acceptanceTestRunId: uuid('acceptance_test_run_id')
    .notNull()
    .references(() => lncAcceptanceTestRuns.id, { onDelete: 'cascade' }),
  testKey: text('test_key').notNull(),
  testName: text('test_name').notNull(),
  status: lncCheckStatusEnum('status').notNull().default('pending'),
  message: text('message'),
  durationMs: integer('duration_ms'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncReadinessScores = pgTable('lnc_readiness_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  readinessScanId: uuid('readiness_scan_id').references(() => lncReadinessScans.id, {
    onDelete: 'set null',
  }),
  overallScore: integer('overall_score'),
  overallStatus: lncReadinessStatusEnum('overall_status').notNull().default('unknown'),
  criticalBlockerCount: integer('critical_blocker_count').notNull().default(0),
  highPriorityCount: integer('high_priority_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  passedCount: integer('passed_count').notNull().default(0),
  recommendations: jsonb('recommendations')
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default([]),
  scoreBreakdown: jsonb('score_breakdown').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncGoLiveWizards = pgTable('lnc_go_live_wizards', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  wizardKey: text('wizard_key').notNull(),
  title: text('title').notNull(),
  status: lncWizardStatusEnum('status').notNull().default('draft'),
  currentStepKey: text('current_step_key'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncGoLiveWizardSteps = pgTable('lnc_go_live_wizard_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  goLiveWizardId: uuid('go_live_wizard_id')
    .notNull()
    .references(() => lncGoLiveWizards.id, { onDelete: 'cascade' }),
  stepKey: text('step_key').notNull(),
  stepName: text('step_name').notNull(),
  stepOrder: integer('step_order').notNull().default(0),
  status: lncWizardStepStatusEnum('status').notNull().default('pending'),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncRollbackPlanLinks = pgTable('lnc_rollback_plan_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  goLiveWizardId: uuid('go_live_wizard_id').references(() => lncGoLiveWizards.id, {
    onDelete: 'set null',
  }),
  recoveryPlanId: uuid('recovery_plan_id'),
  planName: text('plan_name').notNull(),
  planDescription: text('plan_description'),
  isSelected: boolean('is_selected').notNull().default(false),
  validationStatus: lncCheckStatusEnum('validation_status').notNull().default('pending'),
  validationReport: jsonb('validation_report')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncDeploymentValidations = pgTable('lnc_deployment_validations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  goLiveWizardId: uuid('go_live_wizard_id').references(() => lncGoLiveWizards.id, {
    onDelete: 'set null',
  }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  validationKey: text('validation_key').notNull(),
  status: lncDeploymentStatusEnum('status').notNull().default('planned'),
  deploymentRecordId: uuid('deployment_record_id'),
  passedCheckCount: integer('passed_check_count').notNull().default(0),
  failedCheckCount: integer('failed_check_count').notNull().default(0),
  report: jsonb('report').$type<Record<string, unknown>>().notNull().default({}),
  validatedAt: timestamp('validated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncPlatformAlerts = pgTable('lnc_platform_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: lncPlatformAlertSeverityEnum('severity').notNull().default('info'),
  status: lncPlatformAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncAnalyticsSnapshots = pgTable('lnc_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lncActionDrafts = pgTable('lnc_action_drafts', {
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

export const lncAuditLogs = pgTable('lnc_audit_logs', {
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

export type LncPlatformConfig = typeof lncPlatformConfig.$inferSelect;
export type LncReadinessScan = typeof lncReadinessScans.$inferSelect;
export type LncReadinessCheckResult = typeof lncReadinessCheckResults.$inferSelect;
export type LncAcceptanceTestSuite = typeof lncAcceptanceTestSuites.$inferSelect;
export type LncAcceptanceTestRun = typeof lncAcceptanceTestRuns.$inferSelect;
export type LncAcceptanceTestResult = typeof lncAcceptanceTestResults.$inferSelect;
export type LncReadinessScore = typeof lncReadinessScores.$inferSelect;
export type LncGoLiveWizard = typeof lncGoLiveWizards.$inferSelect;
export type LncGoLiveWizardStep = typeof lncGoLiveWizardSteps.$inferSelect;
export type LncRollbackPlanLink = typeof lncRollbackPlanLinks.$inferSelect;
export type LncDeploymentValidation = typeof lncDeploymentValidations.$inferSelect;
export type LncPlatformAlert = typeof lncPlatformAlerts.$inferSelect;
export type LncAnalyticsSnapshot = typeof lncAnalyticsSnapshots.$inferSelect;
export type LncActionDraft = typeof lncActionDrafts.$inferSelect;
export type LncAuditLog = typeof lncAuditLogs.$inferSelect;
