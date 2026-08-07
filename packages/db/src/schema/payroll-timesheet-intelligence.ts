import { boolean, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { jobs } from './jobs';
import { users } from './users';

/**
 * Payroll & Timesheet Intelligence — settings, insight drafts, AURA handoffs.
 * Hours / attendance / payroll prep stay on existing wi_* + mobile tables.
 * No invented wages. No auto payroll mutation.
 */

export const ptiInsightKindEnum = pgEnum('pti_insight_kind', [
  'overtime',
  'attendance',
  'approval_backlog',
  'job_time',
  'labour_cost',
  'cost_forecast',
  'payroll_summary',
]);

export const ptiInsightStatusEnum = pgEnum('pti_insight_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const ptiAuraInsightTargetEnum = pgEnum('pti_aura_insight_target', [
  'command_centre',
  'executive_dashboard',
  'hr_employee_intelligence',
  'workforce_intelligence',
  'technician_intelligence',
  'scheduling',
  'jobs',
  'payroll',
  'timesheets',
]);

export const ptiAuraInsightStatusEnum = pgEnum('pti_aura_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const ptiSettings = pgTable('pti_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  insightsEnabled: boolean('insights_enabled').notNull().default(true),
  selfTimesheetViewEnabled: boolean('self_timesheet_view_enabled').notNull().default(true),
  standardWeeklyHours: numeric('standard_weekly_hours', { precision: 6, scale: 2 })
    .notNull()
    .default('40'),
  overtimeDailyThresholdHours: numeric('overtime_daily_threshold_hours', {
    precision: 6,
    scale: 2,
  })
    .notNull()
    .default('8'),
  /** Invariant: always false. */
  inventWagesEnabled: boolean('invent_wages_enabled').notNull().default(false),
  /** Invariant: always false. */
  autoPayrollMutationEnabled: boolean('auto_payroll_mutation_enabled').notNull().default(false),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ptiInsightDrafts = pgTable('pti_insight_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: ptiInsightKindEnum('kind').notNull(),
  status: ptiInsightStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  subjectUserId: uuid('subject_user_id').references(() => users.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  /** Invariant: always false. */
  inventedWages: boolean('invented_wages').notNull().default(false),
  /** Invariant: always false. */
  autoPayrollMutation: boolean('auto_payroll_mutation').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ptiAuraInsights = pgTable('pti_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: ptiAuraInsightTargetEnum('target').notNull(),
  status: ptiAuraInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceInsightDraftId: uuid('source_insight_draft_id').references(() => ptiInsightDrafts.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PtiSettingsRow = typeof ptiSettings.$inferSelect;
export type NewPtiSettingsRow = typeof ptiSettings.$inferInsert;
export type PtiInsightDraftRow = typeof ptiInsightDrafts.$inferSelect;
export type NewPtiInsightDraftRow = typeof ptiInsightDrafts.$inferInsert;
export type PtiAuraInsightRow = typeof ptiAuraInsights.$inferSelect;
export type NewPtiAuraInsightRow = typeof ptiAuraInsights.$inferInsert;
