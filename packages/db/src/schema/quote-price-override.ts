import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';
import { quotes } from './quotes';

/**
 * Row 93 — quote-specific one-off price override proposals / approvals / executions.
 */
export const quoteLinePriceOverrides = pgTable(
  'quote_line_price_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('DRAFT_PROPOSAL'),
    reason: text('reason').notNull(),
    previewHash: text('preview_hash').notNull(),
    quoteUpdatedAt: timestamp('quote_updated_at', { withTimezone: true }).notNull(),
    lineIds: jsonb('line_ids').$type<string[]>().notNull().default([]),
    baselineSnapshot: jsonb('baseline_snapshot').$type<unknown[]>().notNull().default([]),
    proposedSellByLineId: jsonb('proposed_sell_by_line_id')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    beforeTotalCents: integer('before_total_cents').notNull(),
    afterTotalCents: integer('after_total_cents').notNull(),
    priceRuleSetId: text('price_rule_set_id'),
    priceRuleVersion: integer('price_rule_version'),
    proposedBy: uuid('proposed_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    executedBy: uuid('executed_by').references(() => users.id, { onDelete: 'set null' }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by').references(() => users.id, { onDelete: 'set null' }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyQuoteIdx: index('quote_line_price_overrides_company_quote_idx').on(
      table.companyId,
      table.quoteId,
    ),
    companyStatusIdx: index('quote_line_price_overrides_company_status_idx').on(
      table.companyId,
      table.status,
    ),
    oneOpenUidx: uniqueIndex('quote_line_price_overrides_one_open_uidx')
      .on(table.companyId, table.quoteId)
      .where(sql`${table.status} IN ('DRAFT_PROPOSAL', 'OWNER_APPROVED')`),
  }),
);

export type QuoteLinePriceOverride = typeof quoteLinePriceOverrides.$inferSelect;
export type NewQuoteLinePriceOverride = typeof quoteLinePriceOverrides.$inferInsert;
