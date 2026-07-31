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
import { users } from './users';

export const itoWorkflowStatusEnum = pgEnum('ito_workflow_status', [
  'draft',
  'review',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const itoAlertSeverityEnum = pgEnum('ito_alert_severity', ['info', 'warning', 'critical']);

export const itoAlertStatusEnum = pgEnum('ito_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const itoIncidentSeverityEnum = pgEnum('ito_incident_severity', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const itoIncidentStatusEnum = pgEnum('ito_incident_status', [
  'open',
  'investigating',
  'mitigated',
  'resolved',
  'closed',
]);

export const itoRepairRiskLevelEnum = pgEnum('ito_repair_risk_level', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const itoDeploymentStatusEnum = pgEnum('ito_deployment_status', [
  'planned',
  'in_progress',
  'completed',
  'failed',
  'rolled_back',
]);

export const itoHealthStatusEnum = pgEnum('ito_health_status', [
  'healthy',
  'degraded',
  'unhealthy',
  'unknown',
]);

export const itoPlatformConfig = pgTable('ito_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  healthThresholds: jsonb('health_thresholds')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  monitoringConfig: jsonb('monitoring_config')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  healingPolicies: jsonb('healing_policies').$type<Record<string, unknown>>().notNull().default({}),
  deploymentStandards: jsonb('deployment_standards')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  alertRouting: jsonb('alert_routing').$type<Record<string, unknown>>().notNull().default({}),
  changeManagementPolicy: jsonb('change_management_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoHealthMonitors = pgTable('ito_health_monitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  monitorKey: text('monitor_key').notNull(),
  name: text('name').notNull(),
  monitorType: text('monitor_type').notNull(),
  targetModule: text('target_module'),
  healthStatus: itoHealthStatusEnum('health_status').notNull().default('unknown'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoHealthSnapshots = pgTable('ito_health_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  monitorId: uuid('monitor_id').references(() => itoHealthMonitors.id, { onDelete: 'set null' }),
  snapshotKey: text('snapshot_key').notNull(),
  healthStatus: itoHealthStatusEnum('health_status').notNull().default('unknown'),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoSelfHealingActions = pgTable('ito_self_healing_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  monitorId: uuid('monitor_id').references(() => itoHealthMonitors.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  workflowStatus: itoWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  riskLevel: itoRepairRiskLevelEnum('risk_level').notNull().default('medium'),
  triggeredBy: text('triggered_by'),
  outcome: text('outcome'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoBugDetections = pgTable('ito_bug_detections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  detectionSource: text('detection_source').notNull(),
  severity: itoAlertSeverityEnum('severity').notNull().default('warning'),
  title: text('title').notNull(),
  description: text('description'),
  workflowStatus: itoWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  sourceModule: text('source_module'),
  sourceEntityId: uuid('source_entity_id'),
  fingerprint: text('fingerprint'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoIncidents = pgTable('ito_incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  incidentNumber: text('incident_number'),
  title: text('title').notNull(),
  description: text('description'),
  severity: itoIncidentSeverityEnum('severity').notNull().default('medium'),
  status: itoIncidentStatusEnum('status').notNull().default('open'),
  sourceModule: text('source_module'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  mitigatedAt: timestamp('mitigated_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoRootCauseAnalyses = pgTable('ito_root_cause_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  bugDetectionId: uuid('bug_detection_id').references(() => itoBugDetections.id, {
    onDelete: 'set null',
  }),
  incidentId: uuid('incident_id').references(() => itoIncidents.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  rootCause: text('root_cause'),
  analysis: jsonb('analysis').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: itoWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  analyzedByUserId: uuid('analyzed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoRepairAttempts = pgTable('ito_repair_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  bugDetectionId: uuid('bug_detection_id').references(() => itoBugDetections.id, {
    onDelete: 'set null',
  }),
  rootCauseAnalysisId: uuid('root_cause_analysis_id').references(() => itoRootCauseAnalyses.id, {
    onDelete: 'set null',
  }),
  repairType: text('repair_type').notNull(),
  workflowStatus: itoWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  riskLevel: itoRepairRiskLevelEnum('risk_level').notNull().default('medium'),
  success: boolean('success'),
  notes: text('notes'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  attemptedByUserId: uuid('attempted_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoBuildRecords = pgTable('ito_build_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  buildKey: text('build_key').notNull(),
  version: text('version'),
  branch: text('branch'),
  commitSha: text('commit_sha'),
  workflowStatus: itoWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoTestRuns = pgTable('ito_test_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  runKey: text('run_key').notNull(),
  testSuite: text('test_suite').notNull(),
  workflowStatus: itoWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  passedCount: integer('passed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  buildRecordId: uuid('build_record_id').references(() => itoBuildRecords.id, {
    onDelete: 'set null',
  }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoChangeRequests = pgTable('ito_change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  changeNumber: text('change_number'),
  title: text('title').notNull(),
  description: text('description'),
  workflowStatus: itoWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  riskLevel: itoRepairRiskLevelEnum('risk_level').notNull().default('medium'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoDeployments = pgTable('ito_deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  deploymentKey: text('deployment_key').notNull(),
  environment: text('environment').notNull(),
  deploymentStatus: itoDeploymentStatusEnum('deployment_status').notNull().default('planned'),
  version: text('version'),
  buildRecordId: uuid('build_record_id').references(() => itoBuildRecords.id, {
    onDelete: 'set null',
  }),
  changeRequestId: uuid('change_request_id').references(() => itoChangeRequests.id, {
    onDelete: 'set null',
  }),
  deployedByUserId: uuid('deployed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoDependencyRecords = pgTable('ito_dependency_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  dependencyName: text('dependency_name').notNull(),
  dependencyType: text('dependency_type').notNull(),
  version: text('version'),
  healthStatus: itoHealthStatusEnum('health_status').notNull().default('unknown'),
  isCritical: boolean('is_critical').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoDatabaseHealthSnapshots = pgTable('ito_database_health_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  healthStatus: itoHealthStatusEnum('health_status').notNull().default('unknown'),
  connectionPoolUsagePercent: numeric('connection_pool_usage_percent', { precision: 5, scale: 2 }),
  queryLatencyMs: integer('query_latency_ms'),
  slowQueryCount: integer('slow_query_count').notNull().default(0),
  replicationLagMs: integer('replication_lag_ms'),
  activeConnectionCount: integer('active_connection_count'),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoApiReliabilitySnapshots = pgTable('ito_api_reliability_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  endpointGroup: text('endpoint_group').notNull(),
  healthStatus: itoHealthStatusEnum('health_status').notNull().default('unknown'),
  availabilityPercent: numeric('availability_percent', { precision: 5, scale: 2 }),
  errorRatePercent: numeric('error_rate_percent', { precision: 5, scale: 2 }),
  p95LatencyMs: integer('p95_latency_ms'),
  requestCount: integer('request_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoAiProviderHealth = pgTable('ito_ai_provider_health', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerKey: text('provider_key').notNull(),
  healthStatus: itoHealthStatusEnum('health_status').notNull().default('unknown'),
  latencyMs: integer('latency_ms'),
  errorRatePercent: numeric('error_rate_percent', { precision: 5, scale: 2 }),
  rateLimitEvents: integer('rate_limit_events').notNull().default(0),
  failoverCount: integer('failover_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoIntegrationHealth = pgTable('ito_integration_health', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  integrationKey: text('integration_key').notNull(),
  healthStatus: itoHealthStatusEnum('health_status').notNull().default('unknown'),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  failureCount: integer('failure_count').notNull().default(0),
  latencyMs: integer('latency_ms'),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoTechnicalDebtRecords = pgTable('ito_technical_debt_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  debtKey: text('debt_key').notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  severity: itoIncidentSeverityEnum('severity').notNull().default('medium'),
  workflowStatus: itoWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  estimatedEffortHours: numeric('estimated_effort_hours', { precision: 8, scale: 2 }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoPerformanceSnapshots = pgTable('ito_performance_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  healthStatus: itoHealthStatusEnum('health_status').notNull().default('unknown'),
  cpuUsagePercent: numeric('cpu_usage_percent', { precision: 5, scale: 2 }),
  memoryUsageMb: integer('memory_usage_mb'),
  apiP95LatencyMs: integer('api_p95_latency_ms'),
  queueDepth: integer('queue_depth').notNull().default(0),
  backgroundJobFailureCount: integer('background_job_failure_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoBackupVerifications = pgTable('ito_backup_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  backupRef: text('backup_ref').notNull(),
  verificationStatus: itoWorkflowStatusEnum('verification_status').notNull().default('draft'),
  verificationPassed: boolean('verification_passed'),
  notes: text('notes'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoItAlerts = pgTable('ito_it_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: itoAlertSeverityEnum('severity').notNull().default('warning'),
  status: itoAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  sourceEntityId: uuid('source_entity_id'),
  incidentId: uuid('incident_id').references(() => itoIncidents.id, { onDelete: 'set null' }),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoItActionDrafts = pgTable('ito_it_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  workflowStatus: itoWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  requiresHumanReview: boolean('requires_human_review').notNull().default(true),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoAnalyticsSnapshots = pgTable('ito_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  openIncidentCount: integer('open_incident_count').notNull().default(0),
  openAlertCount: integer('open_alert_count').notNull().default(0),
  degradedMonitorCount: integer('degraded_monitor_count').notNull().default(0),
  openBugCount: integer('open_bug_count').notNull().default(0),
  pendingChangeRequestCount: integer('pending_change_request_count').notNull().default(0),
  failedDeploymentCount: integer('failed_deployment_count').notNull().default(0),
  technicalDebtCount: integer('technical_debt_count').notNull().default(0),
  overallHealthStatus: itoHealthStatusEnum('overall_health_status').notNull().default('unknown'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itoAuditLogs = pgTable('ito_audit_logs', {
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

export type ItoPlatformConfig = typeof itoPlatformConfig.$inferSelect;
export type ItoHealthMonitor = typeof itoHealthMonitors.$inferSelect;
export type ItoIncident = typeof itoIncidents.$inferSelect;
export type ItoItAlert = typeof itoItAlerts.$inferSelect;
export type ItoAnalyticsSnapshot = typeof itoAnalyticsSnapshots.$inferSelect;
