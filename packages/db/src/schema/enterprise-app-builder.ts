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

export const abWorkflowStatusEnum = pgEnum('ab_workflow_status', [
  'draft',
  'review',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
  'archived',
]);

export const abRiskLevelEnum = pgEnum('ab_risk_level', ['low', 'medium', 'high', 'critical']);

export const abFeatureRequestStatusEnum = pgEnum('ab_feature_request_status', [
  'submitted',
  'analyzing',
  'planned',
  'in_development',
  'testing',
  'preview',
  'pending_approval',
  'approved',
  'deployed',
  'rolled_back',
  'rejected',
  'archived',
]);

export const abDeploymentStatusEnum = pgEnum('ab_deployment_status', [
  'planned',
  'building',
  'deploying',
  'deployed',
  'failed',
  'rolled_back',
]);

export const abTestStatusEnum = pgEnum('ab_test_status', [
  'pending',
  'running',
  'passed',
  'failed',
  'skipped',
]);

export const abApprovalStatusEnum = pgEnum('ab_approval_status', [
  'pending',
  'approved',
  'rejected',
  'deferred',
]);

export const abAlertSeverityEnum = pgEnum('ab_alert_severity', ['info', 'warning', 'critical']);

export const abAlertStatusEnum = pgEnum('ab_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const abPlatformConfig = pgTable('ab_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  autoApproveRules: jsonb('auto_approve_rules')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  deploymentStandards: jsonb('deployment_standards')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  testingRequirements: jsonb('testing_requirements')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  documentationPolicy: jsonb('documentation_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  rollbackPolicy: jsonb('rollback_policy').$type<Record<string, unknown>>().notNull().default({}),
  ownerApprovalRequiredAreas: jsonb('owner_approval_required_areas')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abFeatureRequests = pgTable('ab_feature_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  requestKey: text('request_key').notNull(),
  title: text('title').notNull(),
  naturalLanguageRequest: text('natural_language_request'),
  requestType: text('request_type').notNull(),
  workflowStatus: abFeatureRequestStatusEnum('workflow_status').notNull().default('submitted'),
  riskLevel: abRiskLevelEnum('risk_level').notNull().default('medium'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abRequirementsAnalyses = pgTable('ab_requirements_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  functionalRequirements: jsonb('functional_requirements')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  technicalRequirements: jsonb('technical_requirements')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  acceptanceCriteria: jsonb('acceptance_criteria')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  dependencies: jsonb('dependencies').$type<Record<string, unknown>>().notNull().default({}),
  estimatedComplexity: text('estimated_complexity'),
  riskLevel: abRiskLevelEnum('risk_level').notNull().default('medium'),
  implementationPlan: text('implementation_plan'),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abArchitectureImpactAnalyses = pgTable('ab_architecture_impact_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  frontendImpact: text('frontend_impact'),
  backendImpact: text('backend_impact'),
  databaseImpact: text('database_impact'),
  apiImpact: text('api_impact'),
  sharedTypesImpact: text('shared_types_impact'),
  rbacImpact: text('rbac_impact'),
  securityImpact: text('security_impact'),
  tenantIsolationImpact: text('tenant_isolation_impact'),
  affectedModules: jsonb('affected_modules').$type<Record<string, unknown>>().notNull().default({}),
  breakingChangeRisk: text('breaking_change_risk'),
  analysis: jsonb('analysis').$type<Record<string, unknown>>().notNull().default({}),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abDevelopmentWorkspaces = pgTable('ab_development_workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  workspaceKey: text('workspace_key').notNull(),
  branchName: text('branch_name'),
  isolationMode: text('isolation_mode'),
  status: text('status').notNull().default('active'),
  filesChanged: jsonb('files_changed').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abCodeGenerationRecords = pgTable('ab_code_generation_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').references(() => abDevelopmentWorkspaces.id, {
    onDelete: 'set null',
  }),
  generationKey: text('generation_key').notNull(),
  artifactType: text('artifact_type').notNull(),
  artifactPath: text('artifact_path'),
  language: text('language'),
  workflowStatus: abWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abDatabaseChangePlans = pgTable('ab_database_change_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  migrationKey: text('migration_key').notNull(),
  description: text('description'),
  impactAnalysis: jsonb('impact_analysis').$type<Record<string, unknown>>().notNull().default({}),
  conflictDetection: jsonb('conflict_detection')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  breakingChanges: jsonb('breaking_changes').$type<Record<string, unknown>>().notNull().default({}),
  estimatedDurationMinutes: integer('estimated_duration_minutes'),
  requiresOwnerApproval: boolean('requires_owner_approval').notNull().default(false),
  workflowStatus: abWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abTestRuns = pgTable('ab_test_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  runKey: text('run_key').notNull(),
  testSuite: text('test_suite').notNull(),
  workflowStatus: abTestStatusEnum('workflow_status').notNull().default('pending'),
  passedCount: integer('passed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  results: jsonb('results').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abPreviewRecords = pgTable('ab_preview_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  previewKey: text('preview_key').notNull(),
  previewUrl: text('preview_url'),
  changeSummary: text('change_summary'),
  filesModified: jsonb('files_modified').$type<Record<string, unknown>>().notNull().default({}),
  databaseImpact: text('database_impact'),
  apiImpact: text('api_impact'),
  performanceImpact: text('performance_impact'),
  securityImpact: text('security_impact'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abApprovalRecords = pgTable('ab_approval_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  approvalType: text('approval_type').notNull(),
  workflowStatus: abApprovalStatusEnum('workflow_status').notNull().default('pending'),
  requiredAreas: jsonb('required_areas').$type<Record<string, unknown>>().notNull().default({}),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  rejectedReason: text('rejected_reason'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abDeployments = pgTable('ab_deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  deploymentKey: text('deployment_key').notNull(),
  environment: text('environment').notNull(),
  workflowStatus: abDeploymentStatusEnum('workflow_status').notNull().default('planned'),
  version: text('version'),
  deployedByUserId: uuid('deployed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  verificationStatus: text('verification_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abRollbacks = pgTable('ab_rollbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  deploymentId: uuid('deployment_id')
    .notNull()
    .references(() => abDeployments.id, { onDelete: 'cascade' }),
  rollbackKey: text('rollback_key').notNull(),
  reason: text('reason'),
  workflowStatus: abWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  executedByUserId: uuid('executed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abDocumentationUpdates = pgTable('ab_documentation_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  featureRequestId: uuid('feature_request_id')
    .notNull()
    .references(() => abFeatureRequests.id, { onDelete: 'cascade' }),
  docType: text('doc_type').notNull(),
  docPath: text('doc_path'),
  changeSummary: text('change_summary'),
  workflowStatus: abWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abFeatureRegistryEntries = pgTable('ab_feature_registry_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  registryKey: text('registry_key').notNull(),
  featureType: text('feature_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  status: text('status').notNull().default('active'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  dependencies: jsonb('dependencies').$type<Record<string, unknown>>().notNull().default({}),
  moduleKey: text('module_key'),
  routePath: text('route_path'),
  apiPath: text('api_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abAppBuilderAlerts = pgTable('ab_app_builder_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: abAlertSeverityEnum('severity').notNull().default('warning'),
  status: abAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  featureRequestId: uuid('feature_request_id').references(() => abFeatureRequests.id, {
    onDelete: 'set null',
  }),
  sourceModule: text('source_module'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abActionDrafts = pgTable('ab_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  featureRequestId: uuid('feature_request_id').references(() => abFeatureRequests.id, {
    onDelete: 'set null',
  }),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  workflowStatus: abWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abAnalyticsSnapshots = pgTable('ab_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const abAuditLogs = pgTable('ab_audit_logs', {
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

export type AbPlatformConfig = typeof abPlatformConfig.$inferSelect;
export type AbFeatureRequest = typeof abFeatureRequests.$inferSelect;
export type AbRequirementsAnalysis = typeof abRequirementsAnalyses.$inferSelect;
export type AbArchitectureImpactAnalysis = typeof abArchitectureImpactAnalyses.$inferSelect;
export type AbDevelopmentWorkspace = typeof abDevelopmentWorkspaces.$inferSelect;
export type AbCodeGenerationRecord = typeof abCodeGenerationRecords.$inferSelect;
export type AbDatabaseChangePlan = typeof abDatabaseChangePlans.$inferSelect;
export type AbTestRun = typeof abTestRuns.$inferSelect;
export type AbPreviewRecord = typeof abPreviewRecords.$inferSelect;
export type AbApprovalRecord = typeof abApprovalRecords.$inferSelect;
export type AbDeployment = typeof abDeployments.$inferSelect;
export type AbRollback = typeof abRollbacks.$inferSelect;
export type AbDocumentationUpdate = typeof abDocumentationUpdates.$inferSelect;
export type AbFeatureRegistryEntry = typeof abFeatureRegistryEntries.$inferSelect;
export type AbAppBuilderAlert = typeof abAppBuilderAlerts.$inferSelect;
export type AbActionDraft = typeof abActionDrafts.$inferSelect;
export type AbAnalyticsSnapshot = typeof abAnalyticsSnapshots.$inferSelect;
export type AbAuditLog = typeof abAuditLogs.$inferSelect;
