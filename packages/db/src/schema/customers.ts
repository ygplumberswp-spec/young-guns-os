import { boolean, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const customerStatusEnum = pgEnum('customer_status', ['active', 'inactive', 'lead']);

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  email: text('email'),
  phone: text('phone'),
  status: customerStatusEnum('status').notNull().default('active'),
  isSupplierOnly: boolean('is_supplier_only').notNull().default(false),
  doNotContact: boolean('do_not_contact').notNull().default(false),
  notes: text('notes'),
  /** Set when this record was merged into another surviving customer (M7). */
  mergedIntoCustomerId: uuid('merged_into_customer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
