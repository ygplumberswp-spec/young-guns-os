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
import { quotes } from './quotes';
import { users } from './users';

/**
 * Sales Follow-up Intelligence — quote follow-ups, objection drafts, reactivation drafts.
 * Extends Sales Intelligence Agent Foundation. Drafts only; never auto-send.
 */

export const sfiDraftKindEnum = pgEnum('sfi_draft_kind', [
  'quote_reminder',
  'quote_follow_up',
  'objection_response',
  'price_objection',
  'value_explanation',
  'reactivation',
  'maintenance_opportunity',
  'service_opportunity',
]);

export const sfiDraftStatusEnum = pgEnum('sfi_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const sfiChannelEnum = pgEnum('sfi_channel', [
  'email',
  'sms',
  'portal',
  'whatsapp_business',
  'other',
]);

export const sfiCustomerResponseStatusEnum = pgEnum('sfi_customer_response_status', [
  'none',
  'awaiting',
  'responded',
  'no_response',
  'unavailable',
]);

export const sfiObjectionCategoryEnum = pgEnum('sfi_objection_category', [
  'price',
  'timing',
  'scope',
  'trust',
  'competitor',
  'other',
  'unavailable',
]);

export const sfiOutreachDrafts = pgTable('sfi_outreach_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: sfiDraftKindEnum('kind').notNull(),
  status: sfiDraftStatusEnum('status').notNull().default('draft'),
  channel: sfiChannelEnum('channel').notNull().default('email'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  maintenancePlanId: uuid('maintenance_plan_id'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  scheduledFollowUpAt: timestamp('scheduled_follow_up_at', { withTimezone: true }),
  customerResponseStatus: sfiCustomerResponseStatusEnum('customer_response_status')
    .notNull()
    .default('none'),
  objectionCategory: sfiObjectionCategoryEnum('objection_category'),
  /** Invariant: always false — never auto-send. */
  autoSend: boolean('auto_send').notNull().default(false),
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

export const sfiQuoteResponseTracking = pgTable('sfi_quote_response_tracking', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  responseStatus: sfiCustomerResponseStatusEnum('response_status').notNull().default('none'),
  scheduledFollowUpAt: timestamp('scheduled_follow_up_at', { withTimezone: true }),
  lastResponseAt: timestamp('last_response_at', { withTimezone: true }),
  notes: text('notes'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sfiFollowupSettings = pgTable('sfi_followup_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  quoteRemindersEnabled: boolean('quote_reminders_enabled').notNull().default(true),
  objectionDraftsEnabled: boolean('objection_drafts_enabled').notNull().default(true),
  reactivationDraftsEnabled: boolean('reactivation_drafts_enabled').notNull().default(true),
  /** Invariant: always false. */
  autoSendEnabled: boolean('auto_send_enabled').notNull().default(false),
  defaultChannel: sfiChannelEnum('default_channel').notNull().default('email'),
  staleQuoteDays: integer('stale_quote_days').notNull().default(7),
  reactivationIdleDays: integer('reactivation_idle_days').notNull().default(90),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
