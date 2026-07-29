import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { portalUsers } from './portal-users';
import { users } from './users';

export const notificationTypeEnum = pgEnum('notification_type', [
  'job_assigned',
  'schedule_changed',
  'approval_request',
  'invoice_reminder',
  'system_alert',
  'job_update',
  'quote_update',
  'appointment_update',
  'support_update',
  'urgent_dispatch',
  'inventory_request',
  'company_announcement',
  'quality_alert',
  'comeback_update',
  'warranty_update',
  'comm_intel_alert',
  'missed_call_alert',
  'asset_alert',
  'maintenance_update',
  'ai_orchestration_alert',
  'dispatch_alert',
  'fleet_alert',
  'personal_comm_alert',
  'security_alert',
]);

export const notificationRecipientTypeEnum = pgEnum('notification_recipient_type', ['staff', 'portal']);

export const mobileSyncScopeEnum = pgEnum('mobile_sync_scope', ['owner', 'technician', 'customer']);

export const mobileQueueStatusEnum = pgEnum('mobile_queue_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recipientType: notificationRecipientTypeEnum('recipient_type').notNull(),
  recipientUserId: uuid('recipient_user_id').references(() => users.id, { onDelete: 'cascade' }),
  recipientPortalUserId: uuid('recipient_portal_user_id').references(() => portalUsers.id, {
    onDelete: 'cascade',
  }),
  notificationType: notificationTypeEnum('notification_type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id').references(() => portalUsers.id, { onDelete: 'cascade' }),
  notificationType: notificationTypeEnum('notification_type').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileSyncState = pgTable('mobile_sync_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id').references(() => portalUsers.id, { onDelete: 'cascade' }),
  scope: mobileSyncScopeEnum('scope').notNull(),
  deviceId: text('device_id'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileSyncQueue = pgTable('mobile_sync_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  portalUserId: uuid('portal_user_id').references(() => portalUsers.id, { onDelete: 'cascade' }),
  scope: mobileSyncScopeEnum('scope').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: uuid('resource_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: mobileQueueStatusEnum('status').notNull().default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  errorMessage: text('error_message'),
  clientVersion: text('client_version'),
  queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export const mobilePendingActions = pgTable('mobile_pending_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: mobileQueueStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export const mobileActionLogs = pgTable('mobile_action_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  portalUserId: uuid('portal_user_id').references(() => portalUsers.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type MobileSyncState = typeof mobileSyncState.$inferSelect;
export type MobileSyncQueueItem = typeof mobileSyncQueue.$inferSelect;
export type MobilePendingAction = typeof mobilePendingActions.$inferSelect;
export type MobileActionLog = typeof mobileActionLogs.$inferSelect;
