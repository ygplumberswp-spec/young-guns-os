import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationConnections } from './integration-connections';
import { payments } from './payments';
import { xeroSyncEntityStatusEnum } from './xero-sync-entity-status';

export const xeroPaymentMappings = pgTable('xero_payment_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, { onDelete: 'cascade' }),
  xeroPaymentId: text('xero_payment_id'),
  syncStatus: xeroSyncEntityStatusEnum('sync_status').notNull().default('pending'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastSuccessfulSyncAt: timestamp('last_successful_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type XeroPaymentMapping = typeof xeroPaymentMappings.$inferSelect;
export type NewXeroPaymentMapping = typeof xeroPaymentMappings.$inferInsert;
