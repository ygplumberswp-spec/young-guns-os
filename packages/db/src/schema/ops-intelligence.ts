import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { jobs } from './jobs';
import { users } from './users';

export const opsReminderTypeEnum = pgEnum('ops_reminder_type', [
  'next_job_approaching',
  'leave_now',
  'running_late',
  'on_arrival',
  'post_completion_next_job',
  'morning_brief',
]);

export const opsReminderStateStatusEnum = pgEnum('ops_reminder_state_status', [
  'pending',
  'notified',
  'acknowledged',
  'dismissed',
  'suppressed',
]);

/** Persisted reminder/ack state — prevents spam and duplicate reminders per tenant/job/type. */
export const opsIntelligenceReminderStates = pgTable(
  'ops_intelligence_reminder_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    reminderType: opsReminderTypeEnum('reminder_type').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    technicianId: uuid('technician_id').references(() => users.id, { onDelete: 'set null' }),
    planDate: text('plan_date').notNull(),
    status: opsReminderStateStatusEnum('status').notNull().default('pending'),
    payloadSummary: text('payload_summary'),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyDedupeUidx: uniqueIndex('ops_intel_reminder_company_dedupe_uidx').on(
      table.companyId,
      table.dedupeKey,
    ),
  }),
);

export type OpsIntelligenceReminderState = typeof opsIntelligenceReminderStates.$inferSelect;
export type NewOpsIntelligenceReminderState = typeof opsIntelligenceReminderStates.$inferInsert;
