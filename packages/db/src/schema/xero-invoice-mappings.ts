import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationConnections } from './integration-connections';
import { invoices } from './invoices';
import { xeroSyncEntityStatusEnum } from './xero-sync-entity-status';

export const xeroInvoiceMappings = pgTable('xero_invoice_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  xeroInvoiceId: text('xero_invoice_id'),
  xeroInvoiceNumber: text('xero_invoice_number'),
  xeroReference: text('xero_reference'),
  syncStatus: xeroSyncEntityStatusEnum('sync_status').notNull().default('pending'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type XeroInvoiceMapping = typeof xeroInvoiceMappings.$inferSelect;
export type NewXeroInvoiceMapping = typeof xeroInvoiceMappings.$inferInsert;
