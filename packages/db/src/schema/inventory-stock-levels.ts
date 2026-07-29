import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { inventoryItems } from './inventory-items';
import { inventoryLocations } from './inventory-locations';

export const inventoryStockLevels = pgTable('inventory_stock_levels', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id')
    .notNull()
    .references(() => inventoryItems.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id')
    .notNull()
    .references(() => inventoryLocations.id, { onDelete: 'cascade' }),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type InventoryStockLevel = typeof inventoryStockLevels.$inferSelect;
export type NewInventoryStockLevel = typeof inventoryStockLevels.$inferInsert;
