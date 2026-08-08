import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const inventoryItemStatusEnum = pgEnum('inventory_item_status', ['active', 'inactive']);

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  unit: text('unit').notNull().default('each'),
  reorderLevel: integer('reorder_level').notNull().default(0),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  sellPriceCents: integer('sell_price_cents').notNull().default(0),
  status: inventoryItemStatusEnum('status').notNull().default('active'),
  /**
   * Row 91 — stable Young Guns internal business code.
   * Distinct from supplierSku / xeroItemCode / sourceExternalId.
   */
  ygpCode: text('ygp_code'),
  /** Row 91 — product/service taxonomy (e.g. Geysers). Not quote_line_category. */
  catalogueCategory: text('catalogue_category'),
  /** Row 91 — PHYSICAL_ITEM | SERVICE | LABOUR | CALL_OUT | OTHER */
  itemType: text('item_type').notNull().default('OTHER'),
  /** Row 91 — CLASSIFIED | UNCATEGORISED | REVIEW_REQUIRED */
  classificationStatus: text('classification_status').notNull().default('UNCATEGORISED'),
  /**
   * Row 91 — false for labour/service/call-out / price-book-only.
   * Physical qty remains inventory_stock_levels.
   */
  isStockable: boolean('is_stockable').notNull().default(true),
  sourceExternalId: text('source_external_id'),
  xeroItemId: text('xero_item_id'),
  xeroItemCode: text('xero_item_code'),
  supplierSku: text('supplier_sku'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;
