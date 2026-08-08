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
import { jobs } from './jobs';
import { quotes } from './quotes';
import { invoices } from './invoices';
import { users } from './users';

export const estimatedActualGpComparisons = pgTable('estimated_actual_gp_comparisons', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  level: text('level').notNull(),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  quoteLineId: uuid('quote_line_id'),
  invoiceLineId: uuid('invoice_line_id'),
  status: text('status').notNull().default('INCOMPLETE'),
  estimatedRevenueExVatCents: integer('estimated_revenue_ex_vat_cents'),
  estimatedCostExVatCents: integer('estimated_cost_ex_vat_cents'),
  estimatedGpCents: integer('estimated_gp_cents'),
  estimatedMarginBps: integer('estimated_margin_bps'),
  actualRevenueExVatCents: integer('actual_revenue_ex_vat_cents'),
  actualDirectCostExVatCents: integer('actual_direct_cost_ex_vat_cents'),
  actualGpCents: integer('actual_gp_cents'),
  actualMarginBps: integer('actual_margin_bps'),
  gpVarianceCents: integer('gp_variance_cents'),
  marginVarianceBps: integer('margin_variance_bps'),
  estimateSource: text('estimate_source'),
  revenueSource: text('revenue_source'),
  costSource: text('cost_source'),
  warnings: jsonb('warnings').notNull().default([]),
  provenance: jsonb('provenance').notNull().default({}),
  estimateBaselineUnchanged: boolean('estimate_baseline_unchanged').notNull().default(true),
  profitableOrLossLabelled: boolean('profitable_or_loss_labelled').notNull().default(false),
  idempotencyKey: text('idempotency_key'),
  clientActionId: text('client_action_id'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EstimatedActualGpComparison = typeof estimatedActualGpComparisons.$inferSelect;
export type NewEstimatedActualGpComparison = typeof estimatedActualGpComparisons.$inferInsert;
