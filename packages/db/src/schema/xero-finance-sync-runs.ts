import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationConnections } from './integration-connections';
import { integrationSyncJobs } from './integration-sync-jobs';

/** Owner-facing finance pipeline sync run — future-ready for scheduled jobs. */
export const xeroFinanceSyncRuns = pgTable('xero_finance_sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  syncJobId: uuid('sync_job_id').references(() => integrationSyncJobs.id, { onDelete: 'set null' }),
  trigger: text('trigger').notNull().default('manual'),
  status: text('status').notNull().default('queued'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  contactsImported: integer('contacts_imported').notNull().default(0),
  quotesImported: integer('quotes_imported').notNull().default(0),
  invoicesImported: integer('invoices_imported').notNull().default(0),
  paymentsImported: integer('payments_imported').notNull().default(0),
  bankTransactionsImported: integer('bank_transactions_imported').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  errorSummary: text('error_summary'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type XeroFinanceSyncRun = typeof xeroFinanceSyncRuns.$inferSelect;
export type NewXeroFinanceSyncRun = typeof xeroFinanceSyncRuns.$inferInsert;
