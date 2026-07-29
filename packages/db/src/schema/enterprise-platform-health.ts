import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const phHealthStatusEnum = pgEnum('ph_health_status', ['healthy', 'degraded', 'unhealthy', 'unknown']);
export const phDiagnosticStatusEnum = pgEnum('ph_diagnostic_status', [
  'pending',
  'running',
  'passed',
  'failed',
  'skipped',
]);
export const phIncidentSeverityEnum = pgEnum('ph_incident_severity', ['low', 'medium', 'high', 'critical']);
export const phIncidentStatusEnum = pgEnum('ph_incident_status', [
  'open',
  'investigating',
  'mitigated',
  'resolved',
  'closed',
]);
export const phServiceCategoryEnum = pgEnum('ph_service_category', [
  'backend',
  'frontend',
  'database',
  'cache',
  'storage',
  'ai_provider',
  'communication_provider',
  'accounting_provider',
  'fleet_provider',
  'connector_platform',
  'api',
  'authentication',
  'scheduler',
  'automation',
]);
export const phPlatformAlertSeverityEnum = pgEnum('ph_platform_alert_severity', ['info', 'warning', 'critical']);
export const phPlatformAlertStatusEnum = pgEnum('ph_platform_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);
export const phInsightSeverityEnum = pgEnum('ph_insight_severity', ['info', 'warning', 'critical']);

export const phPlatformConfig = pgTable('ph_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  monitoringPolicy: jsonb('monitoring_policy').$type<Record<string, unknown>>().notNull().default({}),
  diagnosticsPolicy: jsonb('diagnostics_policy').$type<Record<string, unknown>>().notNull().default({}),
  capacityPolicy: jsonb('capacity_policy').$type<Record<string, unknown>>().notNull().default({}),
  incidentPolicy: jsonb('incident_policy').$type<Record<string, unknown>>().notNull().default({}),
  alertLevelConfig: jsonb('alert_level_config').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const phHealthSnapshots = pgTable('ph_health_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  overallHealthScore: integer('overall_health_score'),
  overallHealthStatus: phHealthStatusEnum('overall_health_status').notNull().default('unknown'),
  serviceMetrics: jsonb('service_metrics').$type<Record<string, unknown>>().notNull().default({}),
  uptimePercent: real('uptime_percent'),
  availabilityPercent: real('availability_percent'),
  errorRatePercent: real('error_rate_percent'),
  apiP95LatencyMs: integer('api_p95_latency_ms'),
  queueDepth: integer('queue_depth').notNull().default(0),
  failedJobCount: integer('failed_job_count').notNull().default(0),
  activeSessionCount: integer('active_session_count').notNull().default(0),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const phDiagnosticRuns = pgTable('ph_diagnostic_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  runKey: text('run_key').notNull(),
  status: phDiagnosticStatusEnum('status').notNull().default('pending'),
  testCount: integer('test_count').notNull().default(0),
  passedCount: integer('passed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const phDiagnosticResults = pgTable('ph_diagnostic_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  diagnosticRunId: uuid('diagnostic_run_id')
    .notNull()
    .references(() => phDiagnosticRuns.id, { onDelete: 'cascade' }),
  testKey: text('test_key').notNull(),
  testName: text('test_name').notNull(),
  serviceCategory: phServiceCategoryEnum('service_category'),
  status: phDiagnosticStatusEnum('status').notNull().default('pending'),
  message: text('message'),
  durationMs: integer('duration_ms'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const phPerformanceInsights = pgTable('ph_performance_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  insightType: text('insight_type').notNull(),
  severity: phInsightSeverityEnum('severity').notNull().default('info'),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  metricValue: real('metric_value'),
  thresholdValue: real('threshold_value'),
  recommendation: text('recommendation'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const phCapacitySnapshots = pgTable('ph_capacity_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  storageUsageMb: real('storage_usage_mb'),
  databaseGrowthMb: real('database_growth_mb'),
  aiUsageCount: integer('ai_usage_count').notNull().default(0),
  apiRequestCount: integer('api_request_count').notNull().default(0),
  queueGrowthCount: integer('queue_growth_count').notNull().default(0),
  activeTenantCount: integer('active_tenant_count').notNull().default(0),
  activeUserCount: integer('active_user_count').notNull().default(0),
  backgroundJobLoad: integer('background_job_load').notNull().default(0),
  forecast: jsonb('forecast').$type<Record<string, unknown>>().notNull().default({}),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const phPlatformAlerts = pgTable('ph_platform_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: phPlatformAlertSeverityEnum('severity').notNull().default('info'),
  status: phPlatformAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  sourceIncidentId: uuid('source_incident_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const phAnalyticsSnapshots = pgTable('ph_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const phActionDrafts = pgTable('ph_action_drafts', {
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

export const phAuditLogs = pgTable('ph_audit_logs', {
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

export type PhPlatformConfig = typeof phPlatformConfig.$inferSelect;
export type PhHealthSnapshot = typeof phHealthSnapshots.$inferSelect;
export type PhDiagnosticRun = typeof phDiagnosticRuns.$inferSelect;
export type PhDiagnosticResult = typeof phDiagnosticResults.$inferSelect;
export type PhPerformanceInsight = typeof phPerformanceInsights.$inferSelect;
export type PhCapacitySnapshot = typeof phCapacitySnapshots.$inferSelect;
export type PhPlatformAlert = typeof phPlatformAlerts.$inferSelect;
export type PhAnalyticsSnapshot = typeof phAnalyticsSnapshots.$inferSelect;
export type PhActionDraft = typeof phActionDrafts.$inferSelect;
export type PhAuditLog = typeof phAuditLogs.$inferSelect;
