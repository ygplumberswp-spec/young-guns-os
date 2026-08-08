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
import { users } from './users';

export const jobProfitabilityTruthSnapshots = pgTable('job_profitability_truth_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  completeness: text('completeness').notNull().default('INCOMPLETE'),
  lifecycleStatus: text('lifecycle_status').notNull().default('UNKNOWN'),
  revenueExVatCents: integer('revenue_ex_vat_cents'),
  materialCostCents: integer('material_cost_cents'),
  labourCostCents: integer('labour_cost_cents'),
  otherJobCostCents: integer('other_job_cost_cents'),
  totalKnownJobCostCents: integer('total_known_job_cost_cents'),
  grossProfitCents: integer('gross_profit_cents'),
  grossMarginBps: integer('gross_margin_bps'),
  jobOperatingContributionCents: integer('job_operating_contribution_cents'),
  estimatedRevenueExVatCents: integer('estimated_revenue_ex_vat_cents'),
  estimatedDirectCostCents: integer('estimated_direct_cost_cents'),
  estimatedGpCents: integer('estimated_gp_cents'),
  estimatedMarginBps: integer('estimated_margin_bps'),
  revenueVarianceCents: integer('revenue_variance_cents'),
  costVarianceCents: integer('cost_variance_cents'),
  gpVarianceCents: integer('gp_variance_cents'),
  marginVarianceBps: integer('margin_variance_bps'),
  overheadAllocated: boolean('overhead_allocated').notNull().default(false),
  profitableOrLossLabelled: boolean('profitable_or_loss_labelled').notNull().default(false),
  warnings: jsonb('warnings').notNull().default([]),
  missingInputs: jsonb('missing_inputs').notNull().default([]),
  alerts: jsonb('alerts').notNull().default([]),
  provenance: jsonb('provenance').notNull().default({}),
  idempotencyKey: text('idempotency_key'),
  clientActionId: text('client_action_id'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type JobProfitabilityTruthSnapshot = typeof jobProfitabilityTruthSnapshots.$inferSelect;
export type NewJobProfitabilityTruthSnapshot = typeof jobProfitabilityTruthSnapshots.$inferInsert;
