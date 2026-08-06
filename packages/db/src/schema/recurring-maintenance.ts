import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { jobs } from './jobs';
import { users } from './users';
import {
  assetEquipment,
  assetMaintenanceRecords,
  assetMaintenanceSchedules,
} from './asset-equipment';
import { alPreventiveMaintenanceDue } from './enterprise-asset-lifecycle';
import { cxCustomerProperties } from './enterprise-customer-experience';

/** Honest plumbing kinds — asset_type remains `equipment`; category lives here. */
export const opsPlumbingEquipmentKindEnum = pgEnum('ops_plumbing_equipment_kind', [
  'geyser',
  'prv',
  'tank',
  'installed_equipment',
  'other',
]);

export const opsMaintenancePlanStatusEnum = pgEnum('ops_maintenance_plan_status', [
  'draft',
  'active',
  'paused',
  'archived',
]);

export const opsMaintenanceRunStatusEnum = pgEnum('ops_maintenance_run_status', [
  'completed',
  'skipped',
  'missed',
]);

export const opsMaintenanceReminderStatusEnum = pgEnum('ops_maintenance_reminder_status', [
  'pending',
  'acknowledged',
  'dismissed',
  'snoozed',
]);

export const opsMaintenanceCommStatusEnum = pgEnum('ops_maintenance_comm_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const opsMaintenanceAuraKindEnum = pgEnum('ops_maintenance_aura_kind', [
  'upcoming_alert',
  'missed_maintenance',
  'customer_opportunity',
]);

export const opsMaintenanceAuraStatusEnum = pgEnum('ops_maintenance_aura_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const opsRecurringMaintenancePlans = pgTable('ops_recurring_maintenance_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assetEquipment.id, { onDelete: 'cascade' }),
  scheduleId: uuid('schedule_id').references(() => assetMaintenanceSchedules.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  plumbingKind: opsPlumbingEquipmentKindEnum('plumbing_kind')
    .notNull()
    .default('installed_equipment'),
  intervalDays: integer('interval_days').notNull(),
  nextDueAt: timestamp('next_due_at', { withTimezone: true }),
  lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }),
  reminderDaysBefore: integer('reminder_days_before').notNull().default(7),
  status: opsMaintenancePlanStatusEnum('status').notNull().default('draft'),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsMaintenanceRuns = pgTable('ops_maintenance_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => opsRecurringMaintenancePlans.id, { onDelete: 'cascade' }),
  dueId: uuid('due_id').references(() => alPreventiveMaintenanceDue.id, {
    onDelete: 'set null',
  }),
  maintenanceRecordId: uuid('maintenance_record_id').references(() => assetMaintenanceRecords.id, {
    onDelete: 'set null',
  }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  status: opsMaintenanceRunStatusEnum('status').notNull().default('completed'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
  documentIds: jsonb('document_ids').$type<string[]>().notNull().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsMaintenanceReminders = pgTable('ops_maintenance_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => opsRecurringMaintenancePlans.id, { onDelete: 'cascade' }),
  dueId: uuid('due_id').references(() => alPreventiveMaintenanceDue.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  remindAt: timestamp('remind_at', { withTimezone: true }).notNull(),
  status: opsMaintenanceReminderStatusEnum('status').notNull().default('pending'),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsMaintenanceCommRequests = pgTable('ops_maintenance_comm_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => opsRecurringMaintenancePlans.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: opsMaintenanceCommStatusEnum('status').notNull().default('draft'),
  emailDraftId: text('email_draft_id'),
  autoExecuted: boolean('auto_executed').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const opsMaintenanceAuraSuggestions = pgTable('ops_maintenance_aura_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => opsRecurringMaintenancePlans.id, {
    onDelete: 'set null',
  }),
  assetId: uuid('asset_id').references(() => assetEquipment.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  kind: opsMaintenanceAuraKindEnum('kind').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: opsMaintenanceAuraStatusEnum('status').notNull().default('draft'),
  supportingSignals: jsonb('supporting_signals')
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default([]),
  autoExecuted: boolean('auto_executed').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type OpsRecurringMaintenancePlan = typeof opsRecurringMaintenancePlans.$inferSelect;
export type OpsMaintenanceRun = typeof opsMaintenanceRuns.$inferSelect;
export type OpsMaintenanceReminder = typeof opsMaintenanceReminders.$inferSelect;
export type OpsMaintenanceCommRequest = typeof opsMaintenanceCommRequests.$inferSelect;
export type OpsMaintenanceAuraSuggestion = typeof opsMaintenanceAuraSuggestions.$inferSelect;
