import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { inventoryItems } from './inventory-items';
import { inventoryLocations } from './inventory-locations';
import { jobs } from './jobs';
import { purchaseOrderItems, purchaseOrders } from './procurement';
import { users } from './users';

export const inventoryStockMovementTypeEnum = pgEnum('inventory_stock_movement_type', [
  'receipt',
  'issue',
  'return_to_stock',
  'adjustment',
  'correction',
  'waste',
]);

export const inventoryStockMovements = pgTable('inventory_stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id')
    .notNull()
    .references(() => inventoryItems.id, { onDelete: 'restrict' }),
  locationId: uuid('location_id')
    .notNull()
    .references(() => inventoryLocations.id, { onDelete: 'restrict' }),
  movementType: inventoryStockMovementTypeEnum('movement_type').notNull(),
  quantityDelta: integer('quantity_delta').notNull(),
  quantityBefore: integer('quantity_before').notNull(),
  quantityAfter: integer('quantity_after').notNull(),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
    onDelete: 'set null',
  }),
  purchaseOrderItemId: uuid('purchase_order_item_id').references(() => purchaseOrderItems.id, {
    onDelete: 'set null',
  }),
  jobMaterialLineId: uuid('job_material_line_id'),
  reason: text('reason'),
  notes: text('notes'),
  clientActionId: text('client_action_id'),
  recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type InventoryStockMovement = typeof inventoryStockMovements.$inferSelect;
export type NewInventoryStockMovement = typeof inventoryStockMovements.$inferInsert;
