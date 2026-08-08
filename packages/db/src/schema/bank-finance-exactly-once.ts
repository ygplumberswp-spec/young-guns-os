import { integer, jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { bankTransactions } from './bank-transaction-control';

export const bankEconomicEventFeeds = pgTable(
  'bank_economic_event_feeds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    economicEventKey: text('economic_event_key').notNull(),
    fedFromTransactionId: uuid('fed_from_transaction_id')
      .notNull()
      .references(() => bankTransactions.id, { onDelete: 'cascade' }),
    feedTarget: text('feed_target').notNull(),
    skippedDuplicateTransactionIds: jsonb('skipped_duplicate_transaction_ids')
      .notNull()
      .default([]),
    xeroWrites: integer('xero_writes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKeyTargetUidx: uniqueIndex('bank_econ_feed_company_key_target_uidx').on(
      table.companyId,
      table.economicEventKey,
      table.feedTarget,
    ),
  }),
);

export type BankEconomicEventFeed = typeof bankEconomicEventFeeds.$inferSelect;
