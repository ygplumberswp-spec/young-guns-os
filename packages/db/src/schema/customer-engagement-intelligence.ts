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

export const ceiDraftKindEnum = pgEnum('cei_draft_kind', [
  'notification',
  'eta_update',
  'review_request',
  'satisfaction_follow_up',
  'follow_up',
  'maintenance_reminder',
]);
export const ceiDraftStatusEnum = pgEnum('cei_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);
export const ceiChannelEnum = pgEnum('cei_channel', [
  'email',
  'sms',
  'portal',
  'whatsapp_business',
  'other',
]);
export const ceiOutreachDrafts = pgTable('cei_outreach_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  kind: ceiDraftKindEnum('kind').notNull(),
  status: ceiDraftStatusEnum('status').notNull().default('draft'),
  channel: ceiChannelEnum('channel').notNull().default('email'),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  maintenancePlanId: uuid('maintenance_plan_id'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  autoSend: boolean('auto_send').notNull().default(false),
  etaSuggestionAt: timestamp('eta_suggestion_at', { withTimezone: true }),
  etaAvailability: text('eta_availability').notNull().default('unavailable'),
  linkedCommAuraScoreId: uuid('linked_comm_aura_score_id'),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const ceiEngagementSettings = pgTable('cei_engagement_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().unique().references(() => companies.id, { onDelete: 'cascade' }),
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  etaUpdatesEnabled: boolean('eta_updates_enabled').notNull().default(true),
  reviewRequestsEnabled: boolean('review_requests_enabled').notNull().default(true),
  autoSendEnabled: boolean('auto_send_enabled').notNull().default(false),
  defaultChannel: ceiChannelEnum('default_channel').notNull().default('email'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const ceiCommScoreSnapshots = pgTable('cei_comm_score_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  availability: text('availability').notNull().default('unavailable'),
  averageScore: integer('average_score'),
  messageCount: integer('message_count').notNull().default(0),
  dominantSentiment: text('dominant_sentiment').notNull().default('unavailable'),
  lastCommunicationAt: timestamp('last_communication_at', { withTimezone: true }),
  source: text('source').notNull().default('unavailable'),
  summary: text('summary').notNull().default(''),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const ceiRelationshipScores = pgTable('cei_relationship_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  availability: text('availability').notNull().default('unavailable'),
  relationshipScore: integer('relationship_score'),
  band: text('band').notNull().default('unavailable'),
  jobCount: integer('job_count').notNull().default(0),
  reviewCount: integer('review_count').notNull().default(0),
  openMaintenancePlans: integer('open_maintenance_plans').notNull().default(0),
  components: jsonb('components').$type<Record<string, unknown>>().notNull().default({}),
  summary: text('summary').notNull().default(''),
  lastJobAt: timestamp('last_job_at', { withTimezone: true }),
  lastCommunicationAt: timestamp('last_communication_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export type CeiOutreachDraft = typeof ceiOutreachDrafts.$inferSelect;
export type CeiEngagementSettings = typeof ceiEngagementSettings.$inferSelect;
export type CeiCommScoreSnapshot = typeof ceiCommScoreSnapshots.$inferSelect;
export type CeiRelationshipScore = typeof ceiRelationshipScores.$inferSelect;
