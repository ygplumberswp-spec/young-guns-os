import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { inventoryItems } from './inventory-items';
import { users } from './users';

export const supplierStatusEnum = pgEnum('supplier_status', ['active', 'inactive']);

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'draft',
  'pending_approval',
  'approved',
  'ordered',
  'received',
  'completed',
  'cancelled',
]);

export const supplierActivityTypeEnum = pgEnum('supplier_activity_type', [
  'note',
  'communication',
  'performance',
  'order',
  'other',
]);

export const procurementRecommendationTypeEnum = pgEnum('procurement_recommendation_type', [
  'low_stock',
  'fast_moving',
  'slow_moving',
  'cost_reduction',
  'supplier_performance',
  'job_demand',
  'inventory_risk',
]);

export const procurementRecommendationStatusEnum = pgEnum('procurement_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  notes: text('notes'),
  status: supplierStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const supplierProducts = pgTable('supplier_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  productName: text('product_name').notNull(),
  supplierSku: text('supplier_sku'),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  leadTimeDays: integer('lead_time_days'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  referenceNumber: text('reference_number').notNull(),
  status: purchaseOrderStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  totalCostCents: integer('total_cost_cents').notNull().default(0),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  orderedAt: timestamp('ordered_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  purchaseOrderId: uuid('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
    onDelete: 'set null',
  }),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  lineTotalCents: integer('line_total_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const supplierActivities = pgTable('supplier_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  activityType: supplierActivityTypeEnum('activity_type').notNull().default('note'),
  subject: text('subject'),
  body: text('body').notNull(),
  authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const procurementRecommendations = pgTable('procurement_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recommendationType: procurementRecommendationTypeEnum('recommendation_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: procurementRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type SupplierProduct = typeof supplierProducts.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type SupplierActivity = typeof supplierActivities.$inferSelect;
export type ProcurementRecommendation = typeof procurementRecommendations.$inferSelect;
