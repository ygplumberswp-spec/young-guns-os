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
import { integrationConnections } from './integration-connections';
import { integrationProviderEnum } from './integration-connections';
import { users } from './users';

export const integrationConnectorCategoryEnum = pgEnum('integration_connector_category', [
  'accounting',
  'payments',
  'fleet',
  'crm',
  'marketing',
  'email',
  'calendar',
  'messaging',
  'storage',
  'ai',
  'erp',
  'hr_payroll',
  'ecommerce',
  'custom',
]);

export const integrationConnectorAuthTypeEnum = pgEnum('integration_connector_auth_type', [
  'oauth2',
  'api_key',
  'basic_auth',
  'bearer_token',
  'webhook',
  'custom',
]);

export const integrationConnectorSyncModeEnum = pgEnum('integration_connector_sync_mode', [
  'scheduled',
  'manual',
  'event_driven',
]);

export const integrationConnectorStatusEnum = pgEnum('integration_connector_status', [
  'disconnected',
  'pending',
  'connected',
  'error',
]);

export const integrationSyncScopeTypeEnum = pgEnum('integration_sync_scope_type', [
  'incremental',
  'full',
  'event_driven',
]);

export const integrationSyncConflictStatusEnum = pgEnum('integration_sync_conflict_status', [
  'detected',
  'resolved',
  'ignored',
]);

export const integrationPlatformActionTypeEnum = pgEnum('integration_platform_action_type', [
  'integration_repair',
  'reconnect_recommendation',
  'sync_retry',
  'credential_rotation',
]);

export const integrationPlatformActionStatusEnum = pgEnum('integration_platform_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const integrationDiagnosticStatusEnum = pgEnum('integration_diagnostic_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const integrationConnectors = pgTable('integration_connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectorKey: text('connector_key').notNull(),
  provider: integrationProviderEnum('provider').notNull(),
  name: text('name').notNull(),
  category: integrationConnectorCategoryEnum('category').notNull(),
  authType: integrationConnectorAuthTypeEnum('auth_type').notNull(),
  syncMode: integrationConnectorSyncModeEnum('sync_mode').notNull().default('manual'),
  status: integrationConnectorStatusEnum('status').notNull().default('disconnected'),
  connectionId: uuid('connection_id').references(() => integrationConnections.id, {
    onDelete: 'set null',
  }),
  supportsWebhooks: boolean('supports_webhooks').notNull().default(false),
  supportsScheduledSync: boolean('supports_scheduled_sync').notNull().default(true),
  apiVersion: text('api_version').default('v1'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationApiGatewayTraces = pgTable('integration_api_gateway_traces', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  traceId: text('trace_id').notNull(),
  routeKey: text('route_key').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  statusCode: integer('status_code'),
  durationMs: integer('duration_ms'),
  apiVersion: text('api_version'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationSyncSchedules = pgTable('integration_sync_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectorId: uuid('connector_id')
    .notNull()
    .references(() => integrationConnectors.id, { onDelete: 'cascade' }),
  syncScope: integrationSyncScopeTypeEnum('sync_scope').notNull().default('incremental'),
  frequencyMinutes: integer('frequency_minutes').notNull().default(60),
  enabled: boolean('enabled').notNull().default(false),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationSyncConflicts = pgTable('integration_sync_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectorId: uuid('connector_id')
    .notNull()
    .references(() => integrationConnectors.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  conflictType: text('conflict_type').notNull(),
  status: integrationSyncConflictStatusEnum('status').notNull().default('detected'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const integrationPlatformActions = pgTable('integration_platform_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: integrationPlatformActionTypeEnum('action_type').notNull(),
  status: integrationPlatformActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationDeveloperDiagnostics = pgTable('integration_developer_diagnostics', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectorId: uuid('connector_id').references(() => integrationConnectors.id, {
    onDelete: 'set null',
  }),
  diagnosticType: text('diagnostic_type').notNull(),
  status: integrationDiagnosticStatusEnum('status').notNull().default('pending'),
  summary: text('summary').notNull().default(''),
  results: jsonb('results').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
