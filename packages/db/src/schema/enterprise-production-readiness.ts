import { bigint, boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const opsServiceModuleEnum = pgEnum('ops_service_module', [
  'api_gateway',
  'authentication',
  'database',
  'cache',
  'background_workers',
  'queue_services',
  'ai_orchestration',
  'ai_provider_gateway',
  'aura_agent_runtime',
  'mission_control',
  'knowledge_graph',
  'digital_twin',
  'evolution_platform',
  'saas_platform',
  'developer_platform',
  'automation_studio',
  'integrations',
  'crm',
  'jobs',
  'scheduling',
  'dispatch',
  'fleet',
  'inventory',
  'procurement',
  'finance',
  'communications',
  'customer_portal',
]);

export const opsHealthStatusEnum = pgEnum('ops_health_status', [
  'healthy',
  'degraded',
  'unhealthy',
  'unknown',
]);

export const opsReadinessStatusEnum = pgEnum('ops_readiness_status', [
  'ready',
  'warning',
  'critical',
  'unknown',
]);

export const opsMaintenanceWindowStatusEnum = pgEnum('ops_maintenance_window_status', [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);

export const opsMaintenanceActionStatusEnum = pgEnum('ops_maintenance_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const opsBackupRunStatusEnum = pgEnum('ops_backup_run_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'verified',
]);

export const opsLogSeverityEnum = pgEnum('ops_log_severity', ['debug', 'info', 'warn', 'error', 'critical']);

export const opsDeploymentStatusEnum = pgEnum('ops_deployment_status', [
  'planned',
  'in_progress',
  'completed',
  'rolled_back',
]);

export const opsPlatformConfig = pgTable('ops_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  warningThresholds: jsonb('warning_thresholds').$type<Record<string, unknown>>().notNull().default({}),
  hardInfrastructureLimits: jsonb('hard_infrastructure_limits')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  backupRetentionDays: integer('backup_retention_days').notNull().default(30),
  logRetentionDays: integer('log_retention_days').notNull().default(90),
  recoveryPointObjectiveMinutes: integer('recovery_point_objective_minutes'),
  recoveryTimeObjectiveMinutes: integer('recovery_time_objective_minutes'),
  multiRegionEnabled: boolean('multi_region_enabled').notNull().default(false),
  readReplicaEnabled: boolean('read_replica_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsServiceHealthSnapshots = pgTable('ops_service_health_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  moduleKey: opsServiceModuleEnum('module_key').notNull(),
  status: opsHealthStatusEnum('status').notNull().default('unknown'),
  availabilityPercent: numeric('availability_percent', { precision: 5, scale: 2 }),
  latencyMs: integer('latency_ms'),
  errorRatePercent: numeric('error_rate_percent', { precision: 5, scale: 2 }),
  throughputPerMinute: integer('throughput_per_minute'),
  dependencyHealth: jsonb('dependency_health').$type<Record<string, unknown>>().notNull().default({}),
  lastSuccessfulOperationAt: timestamp('last_successful_operation_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsPerformanceSnapshots = pgTable('ops_performance_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  apiP95LatencyMs: integer('api_p95_latency_ms'),
  slowEndpointCount: integer('slow_endpoint_count').notNull().default(0),
  dbPoolUsagePercent: numeric('db_pool_usage_percent', { precision: 5, scale: 2 }),
  cacheHitRatePercent: numeric('cache_hit_rate_percent', { precision: 5, scale: 2 }),
  queueDepth: integer('queue_depth').notNull().default(0),
  workerThroughputPerMinute: integer('worker_throughput_per_minute'),
  backgroundJobFailureCount: integer('background_job_failure_count').notNull().default(0),
  memoryUsageMb: integer('memory_usage_mb'),
  cpuUsagePercent: numeric('cpu_usage_percent', { precision: 5, scale: 2 }),
  storageUsageMb: integer('storage_usage_mb'),
  webhookLatencyMs: integer('webhook_latency_ms'),
  integrationLatencyMs: integer('integration_latency_ms'),
  aiProviderLatencyMs: integer('ai_provider_latency_ms'),
  knowledgeGraphSearchMs: integer('knowledge_graph_search_ms'),
  digitalTwinSimulationMs: integer('digital_twin_simulation_ms'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsBackupPolicies = pgTable('ops_backup_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyKey: text('policy_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  scheduleCron: text('schedule_cron'),
  retentionDays: integer('retention_days').notNull().default(30),
  includesDatabase: boolean('includes_database').notNull().default(true),
  includesConfiguration: boolean('includes_configuration').notNull().default(true),
  includesCredentials: boolean('includes_credentials').notNull().default(true),
  includesKnowledgeGraph: boolean('includes_knowledge_graph').notNull().default(true),
  includesOrganizationalMemory: boolean('includes_organizational_memory').notNull().default(true),
  includesFileStorage: boolean('includes_file_storage').notNull().default(true),
  isEnabled: boolean('is_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsBackupRuns = pgTable('ops_backup_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyId: uuid('policy_id').references(() => opsBackupPolicies.id, { onDelete: 'set null' }),
  status: opsBackupRunStatusEnum('status').notNull().default('pending'),
  backupType: text('backup_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  verificationPassed: boolean('verification_passed'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const opsRecoveryTestRecords = pgTable('ops_recovery_test_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  backupRunId: uuid('backup_run_id').references(() => opsBackupRuns.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('not_performed'),
  validationNotes: text('validation_notes'),
  performedAt: timestamp('performed_at', { withTimezone: true }),
  performedByUserId: uuid('performed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsReadinessCheckRuns = pgTable('ops_readiness_check_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  overallStatus: opsReadinessStatusEnum('overall_status').notNull().default('unknown'),
  readyCount: integer('ready_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  criticalCount: integer('critical_count').notNull().default(0),
  unknownCount: integer('unknown_count').notNull().default(0),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsReadinessCheckResults = pgTable('ops_readiness_check_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => opsReadinessCheckRuns.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  checkKey: text('check_key').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: opsReadinessStatusEnum('status').notNull().default('unknown'),
  category: text('category').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});

export const opsOperationalLogEntries = pgTable('ops_operational_log_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  moduleKey: text('module_key').notNull(),
  severity: opsLogSeverityEnum('severity').notNull().default('info'),
  message: text('message').notNull(),
  correlationId: text('correlation_id'),
  sourceTable: text('source_table'),
  sourceEntityId: text('source_entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsMaintenanceWindows = pgTable('ops_maintenance_windows', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  affectedModules: jsonb('affected_modules').$type<string[]>().notNull().default([]),
  status: opsMaintenanceWindowStatusEnum('status').notNull().default('scheduled'),
  scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }).notNull(),
  scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }).notNull(),
  serviceNotice: text('service_notice'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsMaintenanceActions = pgTable('ops_maintenance_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  maintenanceWindowId: uuid('maintenance_window_id').references(() => opsMaintenanceWindows.id, {
    onDelete: 'set null',
  }),
  actionType: text('action_type').notNull(),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  status: opsMaintenanceActionStatusEnum('status').notNull().default('pending_approval'),
  checklist: jsonb('checklist').$type<string[]>().notNull().default([]),
  rollbackNotes: text('rollback_notes'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsDeploymentRecords = pgTable('ops_deployment_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  versionLabel: text('version_label').notNull(),
  status: opsDeploymentStatusEnum('status').notNull().default('planned'),
  migrationSequence: text('migration_sequence'),
  notes: text('notes'),
  deployedAt: timestamp('deployed_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsScalingConfig = pgTable('ops_scaling_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  horizontalApiScalingEnabled: boolean('horizontal_api_scaling_enabled').notNull().default(true),
  horizontalWorkerScalingEnabled: boolean('horizontal_worker_scaling_enabled').notNull().default(true),
  queueConcurrencyLimit: integer('queue_concurrency_limit').notNull().default(10),
  queuePartitionCount: integer('queue_partition_count').notNull().default(1),
  dbPoolMaxConnections: integer('db_pool_max_connections').notNull().default(20),
  aiRequestQueueConcurrency: integer('ai_request_queue_concurrency').notNull().default(5),
  searchIndexShards: integer('search_index_shards').notNull().default(1),
  webhookConcurrency: integer('webhook_concurrency').notNull().default(5),
  multiRegionReady: boolean('multi_region_ready').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
