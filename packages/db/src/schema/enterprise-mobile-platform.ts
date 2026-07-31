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
import { jobs } from './jobs';
import { users } from './users';

export const mobileDevicePlatformEnum = pgEnum('mobile_device_platform', [
  'ios',
  'android',
  'web',
  'pwa',
  'tablet',
]);

export const mobileDeviceStatusEnum = pgEnum('mobile_device_status', [
  'active',
  'inactive',
  'revoked',
  'lost',
]);

export const mobileFleetProviderTypeEnum = pgEnum('mobile_fleet_provider_type', [
  'cartrack',
  'netstar',
  'ctrack',
  'tracker',
  'mix_telematics',
  'geotab',
  'samsara',
  'verizon_connect',
  'wialon',
  'traccar',
  'generic_rest',
  'generic_mqtt',
]);

export const mobileSyncHistoryStatusEnum = pgEnum('mobile_sync_history_status', [
  'completed',
  'partial',
  'failed',
]);

export const mobileMediaTypeEnum = pgEnum('mobile_media_type', [
  'photo',
  'video',
  'document',
  'barcode',
  'qr_code',
  'signature',
  'voice_note',
]);

export const mobileOfflineResourceTypeEnum = pgEnum('mobile_offline_resource_type', [
  'job',
  'customer',
  'quote',
  'invoice',
  'asset',
  'inventory',
  'vehicle',
  'timesheet',
  'inspection',
  'checklist',
  'document',
  'photo',
  'signature',
  'note',
  'form',
]);

export const mobilePlatformConfig = pgTable('mobile_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  offlineRetentionDays: integer('offline_retention_days').notNull().default(7),
  syncFrequencyMinutes: integer('sync_frequency_minutes').notNull().default(15),
  pushNotificationsEnabled: boolean('push_notifications_enabled').notNull().default(true),
  biometricLoginRequired: boolean('biometric_login_required').notNull().default(false),
  pwaEnabled: boolean('pwa_enabled').notNull().default(true),
  backgroundSyncEnabled: boolean('background_sync_enabled').notNull().default(true),
  notificationPolicies: jsonb('notification_policies')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  mobilePolicies: jsonb('mobile_policies').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileDevices = pgTable('mobile_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  deviceKey: text('device_key').notNull(),
  deviceName: text('device_name'),
  platform: mobileDevicePlatformEnum('platform').notNull().default('web'),
  status: mobileDeviceStatusEnum('status').notNull().default('active'),
  appVersion: text('app_version'),
  osVersion: text('os_version'),
  encryptionVerified: boolean('encryption_verified').notNull().default(false),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobilePushTokens = pgTable('mobile_push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id')
    .notNull()
    .references(() => mobileDevices.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  token: text('token').notNull(),
  provider: text('provider').notNull().default('web_push'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileMediaAssets = pgTable('mobile_media_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  mediaType: mobileMediaTypeEnum('media_type').notNull(),
  title: text('title').notNull(),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  storageKey: text('storage_key'),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileSyncHistory = pgTable('mobile_sync_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  deviceId: uuid('device_id').references(() => mobileDevices.id, { onDelete: 'set null' }),
  status: mobileSyncHistoryStatusEnum('status').notNull().default('completed'),
  processedCount: integer('processed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  conflictCount: integer('conflict_count').notNull().default(0),
  retriedCount: integer('retried_count').notNull().default(0),
  triggerType: text('trigger_type').notNull().default('manual'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
});

export const mobileFleetTrackingProviders = pgTable('mobile_fleet_tracking_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerType: mobileFleetProviderTypeEnum('provider_type').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  credentialsVaultKey: text('credentials_vault_key'),
  endpointUrl: text('endpoint_url'),
  vehicleMapping: jsonb('vehicle_mapping').$type<Record<string, unknown>>().notNull().default({}),
  lastTestAt: timestamp('last_test_at', { withTimezone: true }),
  lastTestStatus: text('last_test_status'),
  lastTestMessage: text('last_test_message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileFieldIntelligenceSnapshots = pgTable('mobile_field_intelligence_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  technicianProductivityScore: numeric('technician_productivity_score', { precision: 5, scale: 2 }),
  travelEfficiencyScore: numeric('travel_efficiency_score', { precision: 5, scale: 2 }),
  avgJobDurationMinutes: numeric('avg_job_duration_minutes', { precision: 10, scale: 2 }),
  firstTimeFixRate: numeric('first_time_fix_rate', { precision: 5, scale: 2 }),
  offlineUsageCount: integer('offline_usage_count').notNull().default(0),
  syncHealthScore: numeric('sync_health_score', { precision: 5, scale: 2 }),
  deviceHealthScore: numeric('device_health_score', { precision: 5, scale: 2 }),
  fleetUtilizationPercent: numeric('fleet_utilization_percent', { precision: 5, scale: 2 }),
  safetyComplianceScore: numeric('safety_compliance_score', { precision: 5, scale: 2 }),
  metrics: jsonb('metrics').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileAuditLogs = pgTable('mobile_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  deviceId: uuid('device_id').references(() => mobileDevices.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MobilePlatformConfig = typeof mobilePlatformConfig.$inferSelect;
export type MobileDevice = typeof mobileDevices.$inferSelect;
export type MobilePushToken = typeof mobilePushTokens.$inferSelect;
export type MobileMediaAsset = typeof mobileMediaAssets.$inferSelect;
export type MobileSyncHistoryRecord = typeof mobileSyncHistory.$inferSelect;
export type MobileFleetTrackingProvider = typeof mobileFleetTrackingProviders.$inferSelect;
export type MobileFieldIntelligenceSnapshot = typeof mobileFieldIntelligenceSnapshots.$inferSelect;
export type MobileAuditLog = typeof mobileAuditLogs.$inferSelect;
