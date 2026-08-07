import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { documents } from './documents';
import { inventoryItems } from './inventory-items';
import { jobs } from './jobs';
import { purchaseOrders, suppliers } from './procurement';
import { users } from './users';

export const jobProfitabilityAdjustmentKindEnum = pgEnum('job_profitability_adjustment_kind', [
  'revenue',
  'material_cost',
  'labour_cost',
  'other_direct_cost',
  'total_cost',
]);

export const jobDirectCostCategoryEnum = pgEnum('job_direct_cost_category', [
  'fuel',
  'delivery',
  'parking',
  'tolls',
  'subcontractor',
  'equipment_hire',
  'consumables',
  'permits',
  'dump_disposal',
  'courier',
  'specialist',
  'travel_accommodation',
  'miscellaneous',
]);

export const jobDirectCostSourceTypeEnum = pgEnum('job_direct_cost_source_type', [
  'manual',
  'purchase_order',
  'material_line',
  'bank_transaction',
  'receipt',
  'supplier_invoice',
  'adjustment',
]);

export const jobProfitabilityAdjustments = pgTable('job_profitability_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  kind: jobProfitabilityAdjustmentKindEnum('kind').notNull(),
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason').notNull(),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobDirectCostEntries = pgTable('job_direct_cost_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  category: jobDirectCostCategoryEnum('category').notNull().default('miscellaneous'),
  description: text('description').notNull(),
  amountCents: integer('amount_cents').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }),
  unitCostCents: integer('unit_cost_cents'),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  sourceType: jobDirectCostSourceTypeEnum('source_type').notNull().default('manual'),
  sourceId: text('source_id').notNull(),
  costDate: timestamp('cost_date', { withTimezone: true }),
  enteredByUserId: uuid('entered_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  isPaid: boolean('is_paid').notNull().default(false),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  notes: text('notes'),
  receiptDocumentId: uuid('receipt_document_id').references(() => documents.id, {
    onDelete: 'set null',
  }),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceIdempotency: unique('job_direct_cost_entries_company_source_unique').on(
    table.companyId,
    table.sourceType,
    table.sourceId,
  ),
}));

export const jobProfitabilitySnapshots = pgTable('job_profitability_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  calculationVersion: integer('calculation_version').notNull().default(1),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  completenessStatus: text('completeness_status').notNull().default('incomplete_multiple'),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  companyJobUnique: unique('job_profitability_snapshots_company_job_unique').on(
    table.companyId,
    table.jobId,
  ),
}));

export type JobProfitabilityAdjustment = typeof jobProfitabilityAdjustments.$inferSelect;
export type JobDirectCostEntry = typeof jobDirectCostEntries.$inferSelect;
export type JobProfitabilitySnapshot = typeof jobProfitabilitySnapshots.$inferSelect;
