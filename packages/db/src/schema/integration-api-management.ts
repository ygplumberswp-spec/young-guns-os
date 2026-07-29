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
import { integrationConnections, integrationProviderEnum } from './integration-connections';
import { integrationWebhookEndpoints, integrationWebhookDirectionEnum } from './integration-webhook-endpoints';
import { users } from './users';

export const integrationAuthTypeEnum = pgEnum('integration_auth_type', [
  'oauth',
  'api_key',
  'bearer_token',
  'webhook_secret',
  'basic_auth',
]);

export const integrationHealthStatusEnum = pgEnum('integration_health_status', [
  'healthy',
  'degraded',
  'unhealthy',
  'unknown',
]);

export const integrationLogDirectionEnum = pgEnum('integration_log_direction', [
  'inbound',
  'outbound',
]);

export const integrationWebhookDeliveryStatusEnum = pgEnum('integration_webhook_delivery_status', [
  'pending',
  'delivered',
  'failed',
  'dead_letter',
  'retry',
]);

export const integrationRegistrySettings = pgTable('integration_registry_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  provider: integrationProviderEnum('provider').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  version: text('version'),
  authType: integrationAuthTypeEnum('auth_type'),
  healthStatus: integrationHealthStatusEnum('health_status').notNull().default('unknown'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  nextSyncAt: timestamp('next_sync_at', { withTimezone: true }),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationCredentialMetadata = pgTable('integration_credential_metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  provider: integrationProviderEnum('provider').notNull(),
  connectionId: uuid('connection_id').references(() => integrationConnections.id, {
    onDelete: 'set null',
  }),
  authType: integrationAuthTypeEnum('auth_type').notNull(),
  credentialHint: text('credential_hint'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
  usageCount: integer('usage_count').notNull().default(0),
  rotationRequired: boolean('rotation_required').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationApiUsage = pgTable('integration_api_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  provider: integrationProviderEnum('provider'),
  endpointKey: text('endpoint_key').notNull(),
  requestCount: integer('request_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  avgResponseMs: integer('avg_response_ms'),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationHealthSnapshots = pgTable('integration_health_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  provider: integrationProviderEnum('provider').notNull(),
  healthStatus: integrationHealthStatusEnum('health_status').notNull(),
  authHealthy: boolean('auth_healthy').notNull().default(false),
  apiAvailable: boolean('api_available').notNull().default(false),
  webhookHealthy: boolean('webhook_healthy').notNull().default(false),
  avgLatencyMs: integer('avg_latency_ms'),
  summary: text('summary').notNull(),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationRequestLogs = pgTable('integration_request_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  provider: integrationProviderEnum('provider'),
  direction: integrationLogDirectionEnum('direction').notNull(),
  method: text('method'),
  endpoint: text('endpoint').notNull(),
  statusCode: integer('status_code'),
  durationMs: integer('duration_ms'),
  errorMessage: text('error_message'),
  requestSummary: text('request_summary'),
  responseSummary: text('response_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationWebhookDeliveries = pgTable('integration_webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  webhookEndpointId: uuid('webhook_endpoint_id').references(() => integrationWebhookEndpoints.id, {
    onDelete: 'set null',
  }),
  direction: integrationWebhookDirectionEnum('direction').notNull(),
  status: integrationWebhookDeliveryStatusEnum('status').notNull().default('pending'),
  eventType: text('event_type').notNull(),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  payloadSummary: text('payload_summary'),
  errorMessage: text('error_message'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrationRecommendations = pgTable('integration_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  provider: integrationProviderEnum('provider'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developerApiKeys = pgTable('developer_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IntegrationRegistrySetting = typeof integrationRegistrySettings.$inferSelect;
export type IntegrationCredentialMetadataRow = typeof integrationCredentialMetadata.$inferSelect;
export type IntegrationApiUsageRow = typeof integrationApiUsage.$inferSelect;
export type IntegrationHealthSnapshot = typeof integrationHealthSnapshots.$inferSelect;
export type IntegrationRequestLog = typeof integrationRequestLogs.$inferSelect;
export type IntegrationWebhookDelivery = typeof integrationWebhookDeliveries.$inferSelect;
export type IntegrationRecommendation = typeof integrationRecommendations.$inferSelect;
export type DeveloperApiKey = typeof developerApiKeys.$inferSelect;
