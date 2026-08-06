import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

/**
 * Technician Intelligence — draft AURA insights only.
 * Lifecycle history is sourced from existing job_workflow_events (no duplicate timeline table).
 * Metrics are live-aggregated from jobs / timesheets / quality / CX — no demo fact tables.
 */

export const tiAuraInsightTypeEnum = pgEnum('ti_aura_insight_type', [
  'delay',
  'trend',
  'improvement',
]);

export const tiAuraInsightStatusEnum = pgEnum('ti_aura_insight_status', [
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const tiAuraInsights = pgTable('ti_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  insightType: tiAuraInsightTypeEnum('insight_type').notNull(),
  status: tiAuraInsightStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  technicianId: uuid('technician_id').references(() => users.id, { onDelete: 'set null' }),
  supportingSignals: jsonb('supporting_signals').$type<string[]>().notNull().default([]),
  /** Always false — insights never auto-execute operational changes. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TiAuraInsight = typeof tiAuraInsights.$inferSelect;
export type NewTiAuraInsight = typeof tiAuraInsights.$inferInsert;
