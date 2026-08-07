import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationConnections } from './integration-connections';
import { integrationSyncJobs } from './integration-sync-jobs';

/** Read-only Xero bank transaction import — never drives automatic accounting mutations. */
export const xeroBankTransactions = pgTable('xero_bank_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  xeroBankTransactionId: text('xero_bank_transaction_id').notNull(),
  transactionDate: date('transaction_date'),
  amountCents: integer('amount_cents').notNull().default(0),
  currency: text('currency').notNull().default('ZAR'),
  reference: text('reference'),
  description: text('description'),
  category: text('category'),
  bankAccountCode: text('bank_account_code'),
  contactName: text('contact_name'),
  xeroContactId: text('xero_contact_id'),
  status: text('status'),
  type: text('type'),
  isReconciled: boolean('is_reconciled').notNull().default(false),
  sourceProvider: text('source_provider').notNull().default('xero'),
  sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
  sourceImportJobId: uuid('source_import_job_id').references(() => integrationSyncJobs.id, {
    onDelete: 'set null',
  }),
  rawSummary: jsonb('raw_summary').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type XeroBankTransaction = typeof xeroBankTransactions.$inferSelect;
export type NewXeroBankTransaction = typeof xeroBankTransactions.$inferInsert;
