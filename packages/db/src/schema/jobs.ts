import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';
import { jobExecutionPhaseEnum } from './job-execution-enums';

export const jobStatusEnum = pgEnum('job_status', [
  'new',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);

export const jobPriorityEnum = pgEnum('job_priority', ['low', 'normal', 'high', 'urgent']);

export const jobNumberCounters = pgTable('job_number_counters', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  lastValue: integer('last_value').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  /** FK enforced in SQL (0095); kept untyped here to avoid circular import with CX schema. */
  propertyId: uuid('property_id'),
  jobNumber: text('job_number'),
  title: text('title').notNull(),
  jobType: text('job_type'),
  description: text('description'),
  status: jobStatusEnum('status').notNull().default('new'),
  priority: jobPriorityEnum('priority').notNull().default('normal'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  parentJobId: uuid('parent_job_id'),
  notes: text('notes'),
  customerVisibleNotes: text('customer_visible_notes'),
  accessInstructions: text('access_instructions'),
  siteContactDiffers: boolean('site_contact_differs').notNull().default(false),
  snapshotStreet: text('snapshot_street'),
  snapshotSuburb: text('snapshot_suburb'),
  snapshotCity: text('snapshot_city'),
  snapshotProvince: text('snapshot_province'),
  snapshotPostalCode: text('snapshot_postal_code'),
  snapshotUnit: text('snapshot_unit'),
  snapshotSiteContactName: text('snapshot_site_contact_name'),
  snapshotSiteContactMobile: text('snapshot_site_contact_mobile'),
  snapshotSiteContactEmail: text('snapshot_site_contact_email'),
  snapshotCustomerName: text('snapshot_customer_name'),
  executionPhase: jobExecutionPhaseEnum('execution_phase').notNull().default('assigned'),
  executionPhaseUpdatedAt: timestamp('execution_phase_updated_at', { withTimezone: true }),
  reopenReason: text('reopen_reason'),
  reopenAt: timestamp('reopen_at', { withTimezone: true }),
  reopenByUserId: uuid('reopen_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobNumberCounter = typeof jobNumberCounters.$inferSelect;
