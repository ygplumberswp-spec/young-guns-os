import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { jobs } from './jobs';
import { users } from './users';

export const companySchedulingSettings = pgTable('company_scheduling_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  schedulingBufferMinutes: integer('scheduling_buffer_minutes').notNull().default(15),
  defaultTravelMinutes: integer('default_travel_minutes').notNull().default(30),
  workDayStartHour: integer('work_day_start_hour').notNull().default(7),
  workDayEndHour: integer('work_day_end_hour').notNull().default(18),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const schedulingOverrideAudits = pgTable('scheduling_override_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  conflictSummary: jsonb('conflict_summary')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CompanySchedulingSettings = typeof companySchedulingSettings.$inferSelect;
export type SchedulingOverrideAudit = typeof schedulingOverrideAudits.$inferInsert;
