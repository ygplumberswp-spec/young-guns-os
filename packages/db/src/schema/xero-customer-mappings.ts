import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { integrationConnections } from './integration-connections';
import { xeroSyncEntityStatusEnum } from './xero-sync-entity-status';

export const xeroCustomerMappings = pgTable('xero_customer_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  xeroContactId: text('xero_contact_id'),
  syncStatus: xeroSyncEntityStatusEnum('sync_status').notNull().default('pending'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type XeroCustomerMapping = typeof xeroCustomerMappings.$inferSelect;
export type NewXeroCustomerMapping = typeof xeroCustomerMappings.$inferInsert;
