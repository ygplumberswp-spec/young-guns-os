import { boolean, jsonb, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { bankTransactions } from './bank-transaction-control';

export const bankTransactionLineageEvents = pgTable(
  'bank_transaction_lineage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    originalTransactionId: uuid('original_transaction_id')
      .notNull()
      .references(() => bankTransactions.id, { onDelete: 'cascade' }),
    relatedTransactionId: uuid('related_transaction_id')
      .notNull()
      .references(() => bankTransactions.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    changedFields: jsonb('changed_fields').notNull().default([]),
    silentOverwrite: boolean('silent_overwrite').notNull().default(false),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyOrigIdx: index('bank_tx_lineage_company_orig_idx').on(
      table.companyId,
      table.originalTransactionId,
      table.createdAt,
    ),
  }),
);

export type BankTransactionLineageEvent = typeof bankTransactionLineageEvents.$inferSelect;
