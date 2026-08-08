import { boolean, jsonb, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { bankTransactions } from './bank-transaction-control';

export const bankReconciliationReviews = pgTable(
  'bank_reconciliation_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    bankTransactionId: uuid('bank_transaction_id')
      .notNull()
      .references(() => bankTransactions.id, { onDelete: 'cascade' }),
    previousState: text('previous_state'),
    state: text('state').notNull(),
    reviewedByUserId: uuid('reviewed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    evidence: jsonb('evidence').notNull().default({}),
    auraSuggestion: jsonb('aura_suggestion'),
    humanConfirmed: boolean('human_confirmed').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTxIdx: index('bank_recon_reviews_company_tx_idx').on(
      table.companyId,
      table.bankTransactionId,
      table.reviewedAt,
    ),
  }),
);

export type BankReconciliationReviewRow = typeof bankReconciliationReviews.$inferSelect;
