import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { bankAccounts } from './bank-transaction-control';

export const bankFeedConnections = pgTable('bank_feed_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  bankName: text('bank_name').notNull().default('FNB'),
  provider: text('provider').notNull().default('manual_statement'),
  mode: text('mode').notNull().default('CONTROLLED_STATEMENT_IMPORT'),
  status: text('status').notNull().default('NOT_CONFIGURED'),
  consentProviderReference: text('consent_provider_reference'),
  maskedAccountIdentity: text('masked_account_identity'),
  currency: text('currency').default('ZAR'),
  sourceType: text('source_type').notNull().default('none'),
  lastAttemptedIntakeAt: timestamp('last_attempted_intake_at', { withTimezone: true }),
  lastSuccessfulIntakeAt: timestamp('last_successful_intake_at', { withTimezone: true }),
  statusReason: text('status_reason'),
  serverTokenReference: text('server_token_reference'),
  bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id, {
    onDelete: 'set null',
  }),
  idempotencyKey: text('idempotency_key'),
  clientActionId: text('client_action_id'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bankFeedIntakeEvents = pgTable('bank_feed_intake_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => bankFeedConnections.id, {
    onDelete: 'set null',
  }),
  stage: text('stage').notNull(),
  filename: text('filename'),
  fileHashSha256: text('file_hash_sha256'),
  mimeType: text('mime_type'),
  formatSupported: boolean('format_supported').notNull().default(false),
  rowCount: integer('row_count'),
  originalFilePreserved: boolean('original_file_preserved').notNull().default(true),
  autoMatchingPerformed: boolean('auto_matching_performed').notNull().default(false),
  reconciliationMutated: boolean('reconciliation_mutated').notNull().default(false),
  jpePosted: boolean('jpe_posted').notNull().default(false),
  xeroWrites: integer('xero_writes').notNull().default(0),
  paymentInitiated: boolean('payment_initiated').notNull().default(false),
  balanceFabricated: boolean('balance_fabricated').notNull().default(false),
  warnings: jsonb('warnings').notNull().default([]),
  errorMessage: text('error_message'),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BankFeedConnection = typeof bankFeedConnections.$inferSelect;
export type BankFeedIntakeEvent = typeof bankFeedIntakeEvents.$inferSelect;
