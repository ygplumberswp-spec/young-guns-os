import { boolean, integer, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const bankHealthSnapshots = pgTable(
  'bank_health_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    operatingMode: text('operating_mode').notNull(),
    connectionImportStatus: text('connection_import_status').notNull(),
    lastSuccessfulIntakeAt: timestamp('last_successful_intake_at', { withTimezone: true }),
    lastAttemptedIntakeAt: timestamp('last_attempted_intake_at', { withTimezone: true }),
    statementBatchCount: integer('statement_batch_count').notNull().default(0),
    unmatchedCount: integer('unmatched_count').notNull().default(0),
    possibleMatchCount: integer('possible_match_count').notNull().default(0),
    reviewRequiredCount: integer('review_required_count').notNull().default(0),
    partiallyReconciledCount: integer('partially_reconciled_count').notNull().default(0),
    providerImportErrorCount: integer('provider_import_error_count').notNull().default(0),
    staleIntake: boolean('stale_intake').notNull().default(false),
    staleIntakeWarning: text('stale_intake_warning'),
    bankBalanceCents: integer('bank_balance_cents'),
    balanceFabricated: boolean('balance_fabricated').notNull().default(false),
    connectedClaim: boolean('connected_claim').notNull().default(false),
    fabricatedHealth: boolean('fabricated_health').notNull().default(false),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('bank_health_snapshots_company_idx').on(table.companyId, table.capturedAt),
  }),
);

export type BankHealthSnapshotRow = typeof bankHealthSnapshots.$inferSelect;
