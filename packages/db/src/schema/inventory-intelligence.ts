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
import { inventoryItems } from './inventory-items';
import { inventoryLocations } from './inventory-locations';
import { jobs } from './jobs';
import { purchaseOrders } from './procurement';

/**
 * Inventory Intelligence Foundation — alert drafts, usage signals, settings,
 * AURA insight handoffs. Extends existing inventory/procurement; no fake stock.
 */

export const iiAlertKindEnum = pgEnum('ii_alert_kind', [
  'shortage',
  'below_reorder',
  'zero_stock',
  'usage_spike',
  'slow_moving',
  'warehouse_visibility',
]);

export const iiAlertStatusEnum = pgEnum('ii_alert_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const iiUsageKindEnum = pgEnum('ii_usage_kind', [
  'job_issue',
  'job_return',
  'po_receipt',
  'adjustment',
  'waste',
  'net_consumption',
]);

export const iiInsightTargetEnum = pgEnum('ii_insight_target', [
  'command_centre',
  'executive_dashboard',
  'procurement',
  'operations',
  'jobs',
  'inventory',
]);

export const iiInsightStatusEnum = pgEnum('ii_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const iiShortageThresholdModeEnum = pgEnum('ii_shortage_threshold_mode', [
  'reorder_level',
  'zero_only',
]);

export const iiSettings = pgTable('ii_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** Invariant: always false. */
  autoReorderEnabled: boolean('auto_reorder_enabled').notNull().default(false),
  /** Invariant: always false. */
  autoStockMutationEnabled: boolean('auto_stock_mutation_enabled').notNull().default(false),
  alertDraftsEnabled: boolean('alert_drafts_enabled').notNull().default(true),
  usageSignalsEnabled: boolean('usage_signals_enabled').notNull().default(true),
  shortageThresholdMode: iiShortageThresholdModeEnum('shortage_threshold_mode')
    .notNull()
    .default('reorder_level'),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const iiAlertDrafts = pgTable('ii_alert_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: iiAlertKindEnum('kind').notNull(),
  status: iiAlertStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  locationId: uuid('location_id').references(() => inventoryLocations.id, {
    onDelete: 'set null',
  }),
  quantityOnHand: integer('quantity_on_hand'),
  reorderLevel: integer('reorder_level'),
  /** Invariant: always false. */
  autoReorder: boolean('auto_reorder').notNull().default(false),
  /** Invariant: always false. */
  autoStockMutation: boolean('auto_stock_mutation').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const iiUsageSignals = pgTable('ii_usage_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: iiUsageKindEnum('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
    onDelete: 'set null',
  }),
  movementCount: integer('movement_count').notNull().default(0),
  netQuantityDelta: integer('net_quantity_delta').notNull().default(0),
  windowDays: integer('window_days').notNull().default(30),
  availability: text('availability').notNull().default('unavailable'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const iiAuraInsights = pgTable('ii_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: iiInsightTargetEnum('target').notNull(),
  status: iiInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceAlertId: uuid('source_alert_id').references(() => iiAlertDrafts.id, {
    onDelete: 'set null',
  }),
  sourceUsageSignalId: uuid('source_usage_signal_id').references(() => iiUsageSignals.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
