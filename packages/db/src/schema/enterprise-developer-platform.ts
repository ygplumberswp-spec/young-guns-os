import {
  doublePrecision,
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

export const developerExtensionTypeEnum = pgEnum('developer_extension_type', [
  'frontend',
  'backend',
  'ai_agent',
  'workflow',
  'dashboard_widget',
  'report',
  'integration',
  'automation',
]);

export const developerExtensionStatusEnum = pgEnum('developer_extension_status', [
  'draft',
  'pending_approval',
  'approved',
  'installed',
  'disabled',
  'rejected',
]);

export const developerMarketplaceStatusEnum = pgEnum('developer_marketplace_status', [
  'draft',
  'pending_review',
  'published',
  'rejected',
  'archived',
]);

export const developerTokenTypeEnum = pgEnum('developer_token_type', [
  'api_key',
  'personal_token',
  'service_account',
]);

export const developerWebhookSubscriptionStatusEnum = pgEnum(
  'developer_webhook_subscription_status',
  ['active', 'paused', 'disabled'],
);

export const developerPlatformActionTypeEnum = pgEnum('developer_platform_action_type', [
  'extension_install',
  'extension_publish',
  'webhook_subscription',
  'oauth_app_create',
  'sdk_generate',
  'integration_guide',
]);

export const developerPlatformActionStatusEnum = pgEnum('developer_platform_action_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const developerPlatformExtensions = pgTable('developer_platform_extensions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  extensionKey: text('extension_key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  extensionType: developerExtensionTypeEnum('extension_type').notNull(),
  status: developerExtensionStatusEnum('status').notNull().default('draft'),
  version: text('version').notNull().default('1.0.0'),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull().default({}),
  installedAt: timestamp('installed_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developerPlatformExtensionVersions = pgTable('developer_platform_extension_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  extensionId: uuid('extension_id')
    .notNull()
    .references(() => developerPlatformExtensions.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  changelog: text('changelog'),
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull().default({}),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developerPlatformMarketplaceListings = pgTable(
  'developer_platform_marketplace_listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    extensionId: uuid('extension_id').references(() => developerPlatformExtensions.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    status: developerMarketplaceStatusEnum('status').notNull().default('draft'),
    version: text('version').notNull().default('1.0.0'),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    averageRating: doublePrecision('average_rating'),
    reviewCount: integer('review_count').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const developerPlatformOauthApplications = pgTable('developer_platform_oauth_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  clientId: text('client_id').notNull(),
  clientSecretHash: text('client_secret_hash').notNull(),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull().default([]),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developerPlatformPersonalAccessTokens = pgTable(
  'developer_platform_personal_access_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'no action' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const developerPlatformServiceAccounts = pgTable('developer_platform_service_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  tokenPrefix: text('token_prefix').notNull(),
  tokenHash: text('token_hash').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developerPlatformWebhookSubscriptions = pgTable(
  'developer_platform_webhook_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetUrl: text('target_url').notNull(),
    eventTypes: jsonb('event_types').$type<string[]>().notNull().default([]),
    secretHash: text('secret_hash').notNull(),
    secretPrefix: text('secret_prefix').notNull(),
    status: developerWebhookSubscriptionStatusEnum('status').notNull().default('active'),
    maxRetries: integer('max_retries').notNull().default(3),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const developerPlatformWebhookDeadLetter = pgTable(
  'developer_platform_webhook_dead_letter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(
      () => developerPlatformWebhookSubscriptions.id,
      {
        onDelete: 'set null',
      },
    ),
    eventType: text('event_type').notNull(),
    payloadSummary: text('payload_summary'),
    errorMessage: text('error_message'),
    attempts: integer('attempts').notNull().default(0),
    failedAt: timestamp('failed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const developerPlatformApiChangelog = pgTable('developer_platform_api_changelog', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  changeType: text('change_type').notNull(),
  releasedAt: timestamp('released_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developerPlatformSdkPackages = pgTable('developer_platform_sdk_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  version: text('version').notNull(),
  packageName: text('package_name').notNull(),
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull().default({}),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developerPlatformOpenapiSpecs = pgTable('developer_platform_openapi_specs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  title: text('title').notNull(),
  spec: jsonb('spec').$type<Record<string, unknown>>().notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developerPlatformAuthAuditLog = pgTable('developer_platform_auth_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  tokenType: developerTokenTypeEnum('token_type').notNull(),
  actionType: text('action_type').notNull(),
  subject: text('subject').notNull(),
  performedByUserId: uuid('performed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const developerPlatformAnalyticsSnapshots = pgTable(
  'developer_platform_analytics_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    apiRequestCount: integer('api_request_count').notNull().default(0),
    apiErrorCount: integer('api_error_count').notNull().default(0),
    avgLatencyMs: integer('avg_latency_ms'),
    webhookDeliveryCount: integer('webhook_delivery_count').notNull().default(0),
    webhookFailureCount: integer('webhook_failure_count').notNull().default(0),
    extensionUsageCount: integer('extension_usage_count').notNull().default(0),
    sdkDownloadCount: integer('sdk_download_count').notNull().default(0),
    metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const developerPlatformActions = pgTable('developer_platform_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  actionType: developerPlatformActionTypeEnum('action_type').notNull(),
  status: developerPlatformActionStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  extensionId: uuid('extension_id').references(() => developerPlatformExtensions.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DeveloperPlatformExtensionRow = typeof developerPlatformExtensions.$inferSelect;
