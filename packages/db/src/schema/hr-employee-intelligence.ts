import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const heiInsightTargetEnum = pgEnum('hei_insight_target', [
  'command_centre','executive_dashboard','workforce_intelligence','technician_intelligence','timesheets','payroll','jobs','scheduling','recruitment','compliance','hr',
]);
export const heiInsightStatusEnum = pgEnum('hei_insight_status', ['open','acknowledged','dismissed']);
export const heiRecommendationKindEnum = pgEnum('hei_recommendation_kind', [
  'skills_shortage','training_opportunity','skill_gap','capacity_issue','workforce_improvement',
]);
export const heiRecommendationStatusEnum = pgEnum('hei_recommendation_status', ['draft','acknowledged','dismissed']);

export const heiSettings = pgTable('hei_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  insightsEnabled: boolean('insights_enabled').notNull().default(true),
  selfViewEnabled: boolean('self_view_enabled').notNull().default(true),
  recommendationDraftsEnabled: boolean('recommendation_drafts_enabled').notNull().default(true),
  autoPayrollMutationEnabled: boolean('auto_payroll_mutation_enabled').notNull().default(false),
  inventEmployeesEnabled: boolean('invent_employees_enabled').notNull().default(false),
  autoHrActionsEnabled: boolean('auto_hr_actions_enabled').notNull().default(false),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const heiAuraInsights = pgTable('hei_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  target: heiInsightTargetEnum('target').notNull(),
  status: heiInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  subjectUserId: uuid('subject_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const heiRecommendationDrafts = pgTable('hei_recommendation_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  kind: heiRecommendationKindEnum('kind').notNull(),
  status: heiRecommendationStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  skillKey: text('skill_key'),
  subjectUserId: uuid('subject_user_id').references(() => users.id, { onDelete: 'set null' }),
  autoExecuted: boolean('auto_executed').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type HeiSettings = typeof heiSettings.$inferSelect;
export type HeiAuraInsight = typeof heiAuraInsights.$inferSelect;
export type HeiRecommendationDraft = typeof heiRecommendationDrafts.$inferSelect;
