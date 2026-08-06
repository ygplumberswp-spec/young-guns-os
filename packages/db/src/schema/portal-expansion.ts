import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { documents } from './documents';
import { users } from './users';

/**
 * Customer Portal Expansion (Department 7.1)
 * Explicit document shares for customer-visible portal documents.
 * Extends existing portal / documents / CX modules — no rebuild.
 */

export const cpeDocumentShares = pgTable(
  'cpe_document_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    sharedByUserId: uuid('shared_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    sharedAt: timestamp('shared_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCustomerDocumentUnique: uniqueIndex('cpe_document_shares_company_customer_doc_uidx').on(
      table.companyId,
      table.customerId,
      table.documentId,
    ),
  }),
);

export type CpeDocumentShare = typeof cpeDocumentShares.$inferSelect;
export type NewCpeDocumentShare = typeof cpeDocumentShares.$inferInsert;
