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

export const pdpWorkflowStatusEnum = pgEnum('pdp_workflow_status', [
  'draft',
  'review',
  'published',
  'deprecated',
  'archived',
]);

export const pdpAlertSeverityEnum = pgEnum('pdp_alert_severity', ['info', 'warning', 'critical']);

export const pdpAlertStatusEnum = pgEnum('pdp_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const pdpPlatformConfig = pgTable('pdp_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  apiPolicy: jsonb('api_policy').$type<Record<string, unknown>>().notNull().default({}),
  webhookPolicy: jsonb('webhook_policy').$type<Record<string, unknown>>().notNull().default({}),
  authPolicy: jsonb('auth_policy').$type<Record<string, unknown>>().notNull().default({}),
  rateLimitPolicy: jsonb('rate_limit_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  sandboxPolicy: jsonb('sandbox_policy').$type<Record<string, unknown>>().notNull().default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpApiVersions = pgTable('pdp_api_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  versionKey: text('version_key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  basePath: text('base_path').notNull(),
  status: pdpWorkflowStatusEnum('status').notNull().default('published'),
  deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
  sunsetAt: timestamp('sunset_at', { withTimezone: true }),
  compatibility: jsonb('compatibility').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpApiScopes = pgTable('pdp_api_scopes', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  scopeKey: text('scope_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  resourceType: text('resource_type').notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  isSystemScope: boolean('is_system_scope').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpWebhookEventTypes = pgTable('pdp_webhook_event_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  eventKey: text('event_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  payloadSchema: jsonb('payload_schema').$type<Record<string, unknown>>().notNull().default({}),
  isSystemEvent: boolean('is_system_event').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpRateLimitPolicies = pgTable('pdp_rate_limit_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  policyKey: text('policy_key').notNull(),
  name: text('name').notNull(),
  tenantLimitPerMinute: integer('tenant_limit_per_minute'),
  applicationLimitPerMinute: integer('application_limit_per_minute'),
  burstLimit: integer('burst_limit'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  workflowStatus: pdpWorkflowStatusEnum('workflow_status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpSandboxConfig = pgTable('pdp_sandbox_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  sandboxBaseUrl: text('sandbox_base_url'),
  testKeyPolicy: jsonb('test_key_policy').$type<Record<string, unknown>>().notNull().default({}),
  webhookTestPolicy: jsonb('webhook_test_policy')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpSdkGenerationRecords = pgTable('pdp_sdk_generation_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  version: text('version').notNull(),
  packageName: text('package_name').notNull(),
  openapiVersion: text('openapi_version'),
  sdkPackageId: uuid('sdk_package_id'),
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpApiStatusSnapshots = pgTable('pdp_api_status_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  overallStatus: text('overall_status').notNull(),
  apiAvailability: text('api_availability'),
  webhookHealth: text('webhook_health'),
  sdkStatus: text('sdk_status'),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpDeveloperAlerts = pgTable('pdp_developer_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: pdpAlertSeverityEnum('severity').notNull().default('warning'),
  status: pdpAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpActionDrafts = pgTable('pdp_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  workflowStatus: pdpWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpAnalyticsSnapshots = pgTable('pdp_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pdpAuditLogs = pgTable('pdp_audit_logs', {
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

export type PdpPlatformConfig = typeof pdpPlatformConfig.$inferSelect;
export type PdpDeveloperAlert = typeof pdpDeveloperAlerts.$inferSelect;
