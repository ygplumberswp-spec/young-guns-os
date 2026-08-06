import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { recruitingCandidates } from './recruiting-candidates';

/**
 * Recruitment & Performance Intelligence — settings, interview workflow drafts,
 * Owner-gated hiring drafts, recommendation drafts (incl. AURA capacity/risk),
 * AURA handoffs. Facts stay on recruiting / workforce / jobs / quality / TI / timesheets.
 * No automatic hiring. No invented scores. No automatic HR decisions.
 */

export const rpiHiringDraftStatusEnum = pgEnum('rpi_hiring_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'executed',
]);

export const rpiInterviewStatusEnum = pgEnum('rpi_interview_status', [
  'draft',
  'scheduled',
  'completed',
  'cancelled',
  'pending_approval',
  'approved',
  'rejected',
]);

export const rpiRecommendationKindEnum = pgEnum('rpi_recommendation_kind', [
  'performance_insight',
  'training',
  'skill_gap',
  'development_plan',
  'capacity_improvement',
  'workforce_risk',
  'workforce_planning',
]);

export const rpiRecommendationStatusEnum = pgEnum('rpi_recommendation_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'acknowledged',
]);

export const rpiAuraInsightTargetEnum = pgEnum('rpi_aura_insight_target', [
  'command_centre',
  'executive_dashboard',
  'hr_employee_intelligence',
  'payroll_timesheet_intelligence',
  'workforce_intelligence',
  'technician_intelligence',
  'recruiting',
  'jobs',
  'training',
  'performance',
  'timesheets',
]);

export const rpiAuraInsightStatusEnum = pgEnum('rpi_aura_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const rpiSettings = pgTable('rpi_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recruitmentEnabled: boolean('recruitment_enabled').notNull().default(true),
  performanceInsightsEnabled: boolean('performance_insights_enabled').notNull().default(true),
  selfPerformanceViewEnabled: boolean('self_performance_view_enabled').notNull().default(true),
  interviewWorkflowEnabled: boolean('interview_workflow_enabled').notNull().default(true),
  auraSuggestionsEnabled: boolean('aura_suggestions_enabled').notNull().default(true),
  /** Invariant: always false. */
  autoHiringEnabled: boolean('auto_hiring_enabled').notNull().default(false),
  /** Invariant: always false. */
  inventScoresEnabled: boolean('invent_scores_enabled').notNull().default(false),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rpiInterviewDrafts = pgTable('rpi_interview_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => recruitingCandidates.id, { onDelete: 'cascade' }),
  status: rpiInterviewStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  interviewerUserId: uuid('interviewer_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  outcomeNotes: text('outcome_notes'),
  /** Invariant: always false. */
  autoHiringDecision: boolean('auto_hiring_decision').notNull().default(false),
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

export const rpiHiringDrafts = pgTable('rpi_hiring_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => recruitingCandidates.id, { onDelete: 'cascade' }),
  fromStage: text('from_stage'),
  toStage: text('to_stage').notNull(),
  status: rpiHiringDraftStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  /** Invariant: always false. */
  autoHiringDecision: boolean('auto_hiring_decision').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rpiRecommendationDrafts = pgTable('rpi_recommendation_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: rpiRecommendationKindEnum('kind').notNull(),
  status: rpiRecommendationStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  subjectUserId: uuid('subject_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
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

export const rpiAuraInsights = pgTable('rpi_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: rpiAuraInsightTargetEnum('target').notNull(),
  status: rpiAuraInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceHiringDraftId: uuid('source_hiring_draft_id').references(() => rpiHiringDrafts.id, {
    onDelete: 'set null',
  }),
  sourceRecommendationId: uuid('source_recommendation_id').references(
    () => rpiRecommendationDrafts.id,
    { onDelete: 'set null' },
  ),
  sourceInterviewDraftId: uuid('source_interview_draft_id').references(
    () => rpiInterviewDrafts.id,
    { onDelete: 'set null' },
  ),
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

export type RpiSettingsRow = typeof rpiSettings.$inferSelect;
export type RpiInterviewDraftRow = typeof rpiInterviewDrafts.$inferSelect;
export type RpiHiringDraftRow = typeof rpiHiringDrafts.$inferSelect;
export type RpiRecommendationDraftRow = typeof rpiRecommendationDrafts.$inferSelect;
export type RpiAuraInsightRow = typeof rpiAuraInsights.$inferSelect;
