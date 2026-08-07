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
import { users } from './users';
import { customers } from './customers';
import { leads } from './leads';
import { jobs } from './jobs';
import { commPlatformInboxIndex } from './communications-platform';

/**
 * Communication AURA Intelligence — prioritisation, honest sentiment, drafts,
 * follow-ups, scoring, and CRM/timeline link proposals over business inbox rows.
 * Does not store fabricated messages. Never auto-sends.
 */

export const commAuraSourceKindEnum = pgEnum('comm_aura_source_kind', [
  'business_gmail',
  'business_whatsapp',
]);

export const commAuraChannelEnum = pgEnum('comm_aura_channel', ['email', 'whatsapp']);

export const commAuraPriorityEnum = pgEnum('comm_aura_priority', [
  'critical',
  'high',
  'normal',
  'low',
]);

export const commAuraSentimentEnum = pgEnum('comm_aura_sentiment', [
  'positive',
  'neutral',
  'negative',
  'mixed',
  'unavailable',
]);

export const commAuraProposalStatusEnum = pgEnum('comm_aura_proposal_status', [
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const commAuraDraftTypeEnum = pgEnum('comm_aura_draft_type', [
  'smart_reply',
  'follow_up',
]);

export const commAuraLinkTargetEnum = pgEnum('comm_aura_link_target', [
  'customer',
  'lead',
  'job',
  'quote',
  'invoice',
  'property',
  'supplier',
  'staff',
  'timeline',
]);

export const commAuraMessageScores = pgTable('comm_aura_message_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  inboxItemId: uuid('inbox_item_id')
    .notNull()
    .references(() => commPlatformInboxIndex.id, { onDelete: 'cascade' }),
  sourceKind: commAuraSourceKindEnum('source_kind').notNull(),
  channel: commAuraChannelEnum('channel').notNull(),
  priority: commAuraPriorityEnum('priority').notNull().default('normal'),
  communicationScore: integer('communication_score').notNull().default(0),
  scoreBreakdown: jsonb('score_breakdown').$type<Record<string, unknown>>().notNull().default({}),
  sentiment: commAuraSentimentEnum('sentiment').notNull().default('unavailable'),
  sentimentConfidence: integer('sentiment_confidence'),
  sentimentSignals: jsonb('sentiment_signals').$type<string[]>().notNull().default([]),
  sentimentRationale: text('sentiment_rationale'),
  linkedCustomerId: uuid('linked_customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  linkedLeadId: uuid('linked_lead_id').references(() => leads.id, { onDelete: 'set null' }),
  linkedJobId: uuid('linked_job_id').references(() => jobs.id, { onDelete: 'set null' }),
  timelineLinked: boolean('timeline_linked').notNull().default(false),
  followUpSuggested: boolean('follow_up_suggested').notNull().default(false),
  analysedByUserId: uuid('analysed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commAuraDrafts = pgTable('comm_aura_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  inboxItemId: uuid('inbox_item_id').references(() => commPlatformInboxIndex.id, {
    onDelete: 'set null',
  }),
  draftType: commAuraDraftTypeEnum('draft_type').notNull(),
  status: commAuraProposalStatusEnum('status').notNull().default('pending_approval'),
  channel: commAuraChannelEnum('channel').notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  /** Invariant: always false — AURA never auto-sends. */
  autoSend: boolean('auto_send').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commAuraFollowUps = pgTable('comm_aura_follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  inboxItemId: uuid('inbox_item_id').references(() => commPlatformInboxIndex.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  status: commAuraProposalStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  dueHint: text('due_hint'),
  /** Invariant: always false — never auto-contact. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionNotes: text('decision_notes'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commAuraLinkProposals = pgTable('comm_aura_link_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  inboxItemId: uuid('inbox_item_id').references(() => commPlatformInboxIndex.id, {
    onDelete: 'set null',
  }),
  linkTargetType: commAuraLinkTargetEnum('link_target_type').notNull(),
  linkTargetId: uuid('link_target_id'),
  status: commAuraProposalStatusEnum('status').notNull().default('pending_approval'),
  subject: text('subject').notNull(),
  recommendation: text('recommendation').notNull(),
  notes: text('notes'),
  /** Invariant: always false — never auto-link. */
  autoLinked: boolean('auto_linked').notNull().default(false),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commAuraCustomerInsights = pgTable('comm_aura_customer_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  messageCount: integer('message_count').notNull().default(0),
  unreadCount: integer('unread_count').notNull().default(0),
  averageScore: integer('average_score'),
  dominantSentiment: commAuraSentimentEnum('dominant_sentiment')
    .notNull()
    .default('unavailable'),
  sentimentAvailability: text('sentiment_availability').notNull().default('unavailable'),
  openFollowUps: integer('open_follow_ups').notNull().default(0),
  pendingDrafts: integer('pending_drafts').notNull().default(0),
  linkedJobCount: integer('linked_job_count').notNull().default(0),
  lastCommunicationAt: timestamp('last_communication_at', { withTimezone: true }),
  summary: text('summary').notNull().default(''),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CommAuraMessageScoreRow = typeof commAuraMessageScores.$inferSelect;
export type CommAuraDraftRow = typeof commAuraDrafts.$inferSelect;
export type CommAuraFollowUpRow = typeof commAuraFollowUps.$inferSelect;
export type CommAuraLinkProposalRow = typeof commAuraLinkProposals.$inferSelect;
export type CommAuraCustomerInsightRow = typeof commAuraCustomerInsights.$inferSelect;
