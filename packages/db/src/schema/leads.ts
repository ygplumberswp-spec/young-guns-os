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
import { cxCustomerProperties } from './enterprise-customer-experience';
import { jobs } from './jobs';
import { users } from './users';

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'attempted_contact',
  'contacted',
  'qualified',
  'awaiting_information',
  'quote_required',
  'ready_to_book',
  'opportunity',
  'converted',
  'lost',
  'duplicate',
]);

export const leadActivityTypeEnum = pgEnum('lead_activity_type', [
  'call',
  'email',
  'meeting',
  'follow_up',
  'note',
  'handoff',
  'status_change',
  'conversion',
  'duplicate_override',
  'other',
]);

export const leadRecommendationTypeEnum = pgEnum('lead_recommendation_type', [
  'follow_up',
  'qualification',
  'handoff',
  'engagement',
  'conversion',
  'retention',
]);

export const leadRecommendationStatusEnum = pgEnum('lead_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const leadSources = pgTable('lead_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  sourceKey: text('source_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  sourceId: uuid('source_id').references(() => leadSources.id, { onDelete: 'set null' }),
  status: leadStatusEnum('status').notNull().default('new'),
  title: text('title').notNull(),
  companyName: text('company_name'),
  contactName: text('contact_name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  contactPhoneE164: text('contact_phone_e164'),
  serviceType: text('service_type'),
  urgency: text('urgency').notNull().default('normal'),
  street: text('street'),
  suburb: text('suburb'),
  city: text('city'),
  province: text('province'),
  postalCode: text('postal_code'),
  unit: text('unit'),
  accessInstructions: text('access_instructions'),
  preferredAppointmentAt: timestamp('preferred_appointment_at', { withTimezone: true }),
  nextAction: text('next_action'),
  nextActionDueAt: timestamp('next_action_due_at', { withTimezone: true }),
  lostReason: text('lost_reason'),
  reopenReason: text('reopen_reason'),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  operationalContactPermission: boolean('operational_contact_permission').notNull().default(true),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  score: integer('score').notNull().default(0),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
  convertedByUserId: uuid('converted_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  lostAt: timestamp('lost_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leadActivities = pgTable('lead_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  activityType: leadActivityTypeEnum('activity_type').notNull().default('note'),
  subject: text('subject'),
  body: text('body').notNull(),
  authorUserId: uuid('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leadScores = pgTable('lead_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  signals: jsonb('signals').$type<Record<string, unknown>>().notNull().default({}),
  scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leadRecommendations = pgTable('lead_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  recommendationType: leadRecommendationTypeEnum('recommendation_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: leadRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leadStatusHistory = pgTable('lead_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  reason: text('reason'),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const leadConversions = pgTable('lead_conversions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  clientActionId: text('client_action_id').notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => cxCustomerProperties.id, {
    onDelete: 'set null',
  }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  createJob: boolean('create_job').notNull().default(true),
  customerMode: text('customer_mode').notNull(),
  propertyMode: text('property_mode').notNull(),
  duplicateResolution: text('duplicate_resolution'),
  duplicateOverrideReason: text('duplicate_override_reason'),
  dispatchNotificationSent: boolean('dispatch_notification_sent').notNull().default(false),
  result: jsonb('result').$type<Record<string, unknown>>().notNull().default({}),
  convertedByUserId: uuid('converted_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LeadSource = typeof leadSources.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type LeadScore = typeof leadScores.$inferSelect;
export type LeadRecommendation = typeof leadRecommendations.$inferSelect;
export type LeadStatusHistoryRow = typeof leadStatusHistory.$inferSelect;
export type LeadConversion = typeof leadConversions.$inferSelect;
