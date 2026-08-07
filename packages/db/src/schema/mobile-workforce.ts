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
import { inventoryItems } from './inventory-items';
import { jobMaterialSourceEnum } from './job-execution-enums';
import { jobs } from './jobs';
import { mobileSyncQueue } from './mobile';
import { users } from './users';

export const mobileWorkforceRequestTypeEnum = pgEnum('mobile_workforce_request_type', [
  'inventory_allocation',
  'inventory_request',
  'inventory_shortage',
  'overtime_request',
  'schedule_change',
  'general_request',
]);

export const mobileWorkforceRequestStatusEnum = pgEnum('mobile_workforce_request_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const mobileTimeEntryTypeEnum = pgEnum('mobile_time_entry_type', [
  'clock_in',
  'clock_out',
  'break_start',
  'break_end',
  'travel',
  'job_time',
]);

export const mobileDocumentationTypeEnum = pgEnum('mobile_documentation_type', [
  'photo',
  'video',
  'document',
  'inspection_form',
  'safety_checklist',
  'customer_signature',
]);

export const mobileInventoryUsageStatusEnum = pgEnum('mobile_inventory_usage_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
]);

export const mobileSyncConflictStatusEnum = pgEnum('mobile_sync_conflict_status', [
  'pending',
  'resolved',
  'failed',
]);

export const mobileWorkforceRequests = pgTable('mobile_workforce_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  requestType: mobileWorkforceRequestTypeEnum('request_type').notNull(),
  status: mobileWorkforceRequestStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileTimeEntries = pgTable('mobile_time_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  entryType: mobileTimeEntryTypeEnum('entry_type').notNull(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes'),
  notes: text('notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  clientActionId: text('client_action_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileJobInventoryUsage = pgTable('mobile_job_inventory_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  inventoryItemId: uuid('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(),
  unit: text('unit'),
  materialSource: jobMaterialSourceEnum('material_source'),
  supplierReference: text('supplier_reference'),
  status: mobileInventoryUsageStatusEnum('status').notNull().default('pending_approval'),
  scanCode: text('scan_code'),
  notes: text('notes'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileJobDocumentation = pgTable('mobile_job_documentation', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  documentationType: mobileDocumentationTypeEnum('documentation_type').notNull(),
  title: text('title').notNull(),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  content: text('content'),
  storageKey: text('storage_key'),
  checksumSha256: text('checksum_sha256'),
  clientActionId: text('client_action_id'),
  evidencePhase: text('evidence_phase'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mobileSyncConflicts = pgTable('mobile_sync_conflicts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  queueItemId: uuid('queue_item_id').references(() => mobileSyncQueue.id, { onDelete: 'set null' }),
  resourceType: text('resource_type').notNull(),
  resourceId: uuid('resource_id'),
  clientVersion: text('client_version'),
  serverVersion: text('server_version'),
  clientPayload: jsonb('client_payload').$type<Record<string, unknown>>().notNull().default({}),
  serverPayload: jsonb('server_payload').$type<Record<string, unknown>>().notNull().default({}),
  status: mobileSyncConflictStatusEnum('status').notNull().default('pending'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const mobileCompanyAnnouncements = pgTable('mobile_company_announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  announcementType: text('announcement_type').notNull().default('general'),
  isActive: boolean('is_active').notNull().default(true),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MobileWorkforceRequest = typeof mobileWorkforceRequests.$inferSelect;
export type MobileTimeEntry = typeof mobileTimeEntries.$inferSelect;
export type MobileJobInventoryUsage = typeof mobileJobInventoryUsage.$inferSelect;
export type MobileJobDocumentation = typeof mobileJobDocumentation.$inferSelect;
export type MobileSyncConflict = typeof mobileSyncConflicts.$inferSelect;
export type MobileCompanyAnnouncement = typeof mobileCompanyAnnouncements.$inferSelect;
