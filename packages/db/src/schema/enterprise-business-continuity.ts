import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  bigint,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const bcWorkflowStatusEnum = pgEnum('bc_workflow_status', [
  'draft',
  'review',
  'published',
  'deprecated',
  'archived',
]);

export const bcAlertSeverityEnum = pgEnum('bc_alert_severity', ['info', 'warning', 'critical']);

export const bcAlertStatusEnum = pgEnum('bc_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const bcBackupScheduleTypeEnum = pgEnum('bc_backup_schedule_type', [
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'manual',
]);

export const bcBackupJobStatusEnum = pgEnum('bc_backup_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'verified',
  'cancelled',
]);

export const bcRestoreScopeEnum = pgEnum('bc_restore_scope', [
  'point_in_time',
  'full_tenant',
  'module',
  'document',
  'configuration',
]);

export const bcRestoreStatusEnum = pgEnum('bc_restore_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);

export const bcRecoveryScenarioEnum = pgEnum('bc_recovery_scenario', [
  'database_failure',
  'storage_failure',
  'ai_provider_outage',
  'communication_provider_outage',
  'payment_provider_outage',
  'integration_failure',
  'infrastructure_outage',
]);

export const bcVerificationStatusEnum = pgEnum('bc_verification_status', [
  'pending',
  'passed',
  'failed',
]);

export const bcRecoveryTestStatusEnum = pgEnum('bc_recovery_test_status', [
  'scheduled',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);

export const bcPlatformConfig = pgTable('bc_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  backupPolicy: jsonb('backup_policy').$type<Record<string, unknown>>().notNull().default({}),
  restorePolicy: jsonb('restore_policy').$type<Record<string, unknown>>().notNull().default({}),
  verificationPolicy: jsonb('verification_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  drPolicy: jsonb('dr_policy').$type<Record<string, unknown>>().notNull().default({}),
  compliancePolicy: jsonb('compliance_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  encryptionRequired: boolean('encryption_required').notNull().default(true),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcBackupPolicies = pgTable('bc_backup_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyKey: text('policy_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  scheduleType: bcBackupScheduleTypeEnum('schedule_type').notNull().default('daily'),
  scheduleCron: text('schedule_cron'),
  retentionDays: integer('retention_days').notNull().default(30),
  backupScope: jsonb('backup_scope').$type<Record<string, unknown>>().notNull().default({}),
  isEnabled: boolean('is_enabled').notNull().default(false),
  workflowStatus: bcWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcBackupJobs = pgTable('bc_backup_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyId: uuid('policy_id').references(() => bcBackupPolicies.id, { onDelete: 'set null' }),
  scheduleType: bcBackupScheduleTypeEnum('schedule_type').notNull().default('manual'),
  backupScope: jsonb('backup_scope').$type<Record<string, unknown>>().notNull().default({}),
  status: bcBackupJobStatusEnum('status').notNull().default('pending'),
  encrypted: boolean('encrypted').notNull().default(true),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  verificationStatus: bcVerificationStatusEnum('verification_status'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const bcRestoreRequests = pgTable('bc_restore_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  restoreScope: bcRestoreScopeEnum('restore_scope').notNull(),
  targetModule: text('target_module'),
  targetEntityId: uuid('target_entity_id'),
  pointInTime: timestamp('point_in_time', { withTimezone: true }),
  status: bcRestoreStatusEnum('status').notNull().default('draft'),
  requiresOwnerApproval: boolean('requires_owner_approval').notNull().default(true),
  title: text('title').notNull(),
  description: text('description'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcRecoveryPlans = pgTable('bc_recovery_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  scenarioKey: bcRecoveryScenarioEnum('scenario_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  recoverySteps: jsonb('recovery_steps')
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default([]),
  estimatedRecoveryTimeMinutes: integer('estimated_recovery_time_minutes'),
  dependencies: jsonb('dependencies').$type<Array<Record<string, unknown>>>().notNull().default([]),
  validationChecklist: jsonb('validation_checklist')
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default([]),
  workflowStatus: bcWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcRecoveryTests = pgTable('bc_recovery_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recoveryPlanId: uuid('recovery_plan_id').references(() => bcRecoveryPlans.id, {
    onDelete: 'set null',
  }),
  backupJobId: uuid('backup_job_id').references(() => bcBackupJobs.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  status: bcRecoveryTestStatusEnum('status').notNull().default('scheduled'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes'),
  success: boolean('success'),
  failures: jsonb('failures').$type<Array<Record<string, unknown>>>().notNull().default([]),
  recoveryTimeMinutes: integer('recovery_time_minutes'),
  lessonsLearned: text('lessons_learned'),
  isProductionSafe: boolean('is_production_safe').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcVerificationRecords = pgTable('bc_verification_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  backupJobId: uuid('backup_job_id').references(() => bcBackupJobs.id, { onDelete: 'set null' }),
  verificationType: text('verification_type').notNull(),
  status: bcVerificationStatusEnum('status').notNull().default('pending'),
  passed: boolean('passed'),
  findings: jsonb('findings').$type<Record<string, unknown>>().notNull().default({}),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcStorageHealthSnapshots = pgTable('bc_storage_health_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  storageType: text('storage_type').notNull(),
  healthStatus: text('health_status').notNull().default('unknown'),
  usageBytes: bigint('usage_bytes', { mode: 'number' }),
  capacityBytes: bigint('capacity_bytes', { mode: 'number' }),
  redundancyLevel: text('redundancy_level'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcComplianceRecords = pgTable('bc_compliance_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  complianceType: text('compliance_type').notNull(),
  status: text('status').notNull().default('unknown'),
  rpoMinutes: integer('rpo_minutes'),
  rtoMinutes: integer('rto_minutes'),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcContinuityAlerts = pgTable('bc_continuity_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: bcAlertSeverityEnum('severity').notNull().default('warning'),
  status: bcAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcAnalyticsSnapshots = pgTable('bc_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcActionDrafts = pgTable('bc_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  workflowStatus: bcWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bcAuditLogs = pgTable('bc_audit_logs', {
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

export type BcPlatformConfig = typeof bcPlatformConfig.$inferSelect;
export type BcContinuityAlert = typeof bcContinuityAlerts.$inferSelect;
