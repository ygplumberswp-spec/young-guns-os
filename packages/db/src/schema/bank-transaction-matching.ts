import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { bankTransactions } from './bank-transaction-control';

export const bankTransactionMatchCandidates = pgTable(
  'bank_transaction_match_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    bankTransactionId: uuid('bank_transaction_id')
      .notNull()
      .references(() => bankTransactions.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    targetLabel: text('target_label'),
    confidence: text('confidence').notNull(),
    amountCents: integer('amount_cents').notNull(),
    amountDifferenceCents: integer('amount_difference_cents').notNull().default(0),
    reason: text('reason'),
    evidence: jsonb('evidence').notNull().default([]),
    disposition: text('disposition').notNull().default('REVIEW_REQUIRED'),
    sequenceUsedAsProof: boolean('sequence_used_as_proof').notNull().default(false),
    autoMatched: boolean('auto_matched').notNull().default(false),
    jpePosted: boolean('jpe_posted').notNull().default(false),
    xeroWrites: integer('xero_writes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTxIdx: index('bank_tx_match_company_tx_idx').on(
      table.companyId,
      table.bankTransactionId,
    ),
  }),
);

export type BankTransactionMatchCandidateRow = typeof bankTransactionMatchCandidates.$inferSelect;
