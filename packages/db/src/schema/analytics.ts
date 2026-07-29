import { date, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const reportTypeEnum = pgEnum('report_type', [
  'revenue',
  'customer',
  'job_performance',
  'technician_performance',
  'finance',
  'fleet',
  'inventory',
]);

export const reportRunStatusEnum = pgEnum('report_run_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const analyticsPeriodEnum = pgEnum('analytics_period', ['daily', 'weekly', 'monthly']);

export const reportDefinitions = pgTable('report_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  reportType: reportTypeEnum('report_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reportRuns = pgTable('report_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  reportDefinitionId: uuid('report_definition_id').references(() => reportDefinitions.id, {
    onDelete: 'set null',
  }),
  reportType: reportTypeEnum('report_type').notNull(),
  status: reportRunStatusEnum('status').notNull().default('pending'),
  parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb('result').$type<Record<string, unknown>>(),
  summary: text('summary'),
  errorMessage: text('error_message'),
  generatedByUserId: uuid('generated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsSnapshots = pgTable('analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  snapshotType: text('snapshot_type').notNull(),
  period: analyticsPeriodEnum('period').notNull(),
  snapshotDate: date('snapshot_date').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ReportDefinition = typeof reportDefinitions.$inferSelect;
export type ReportRun = typeof reportRuns.$inferSelect;
export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
