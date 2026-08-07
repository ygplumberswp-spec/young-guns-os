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

/**
 * Marketing Agent Foundation — campaigns, content drafts, goals, recommendations.
 * Drafts require Owner approval before any publish path. No auto-publish.
 * Social publish remains gated until platform integrations exist.
 */

export const mktAgentChannelEnum = pgEnum('mkt_agent_channel', [
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'google_business',
  'website',
  'email',
  'other',
]);

export const mktAgentCampaignStatusEnum = pgEnum('mkt_agent_campaign_status', [
  'draft',
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled',
]);

export const mktAgentContentKindEnum = pgEnum('mkt_agent_content_kind', [
  'post_idea',
  'caption',
  'hashtags',
  'campaign_idea',
  'seasonal_promo',
  'educational',
  'plumbing_tip',
]);

export const mktAgentDraftStatusEnum = pgEnum('mkt_agent_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'publish_gated',
]);

export const mktAgentGoalStatusEnum = pgEnum('mkt_agent_goal_status', [
  'active',
  'completed',
  'cancelled',
]);

export const mktAgentRecommendationKindEnum = pgEnum('mkt_agent_recommendation_kind', [
  'campaign_idea',
  'content_plan',
  'seasonal_promo',
  'channel_focus',
  'performance_review',
  'aura_handoff',
]);

export const mktAgentRecommendationStatusEnum = pgEnum('mkt_agent_recommendation_status', [
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const mktAgentCampaigns = pgTable('mkt_agent_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  objective: text('objective').notNull(),
  status: mktAgentCampaignStatusEnum('status').notNull().default('draft'),
  channels: jsonb('channels').$type<string[]>().notNull().default([]),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  goalId: uuid('goal_id'),
  notes: text('notes'),
  /** Invariant: always false — never auto-publish. */
  autoPublish: boolean('auto_publish').notNull().default(false),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mktAgentContentDrafts = pgTable('mkt_agent_content_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => mktAgentCampaigns.id, {
    onDelete: 'set null',
  }),
  contentKind: mktAgentContentKindEnum('content_kind').notNull(),
  channel: mktAgentChannelEnum('channel').notNull(),
  status: mktAgentDraftStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
  /** Invariant: always false — never auto-publish. */
  autoPublish: boolean('auto_publish').notNull().default(false),
  /** Social integrations not live. */
  socialPublishAvailable: boolean('social_publish_available').notNull().default(false),
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

export const mktAgentGoals = pgTable('mkt_agent_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: mktAgentGoalStatusEnum('status').notNull().default('active'),
  targetMetric: text('target_metric'),
  /** Null when no real measured value — never invent. */
  currentValue: integer('current_value'),
  targetValue: integer('target_value'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mktAgentRecommendations = pgTable('mkt_agent_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  kind: mktAgentRecommendationKindEnum('kind').notNull(),
  status: mktAgentRecommendationStatusEnum('status').notNull().default('pending_approval'),
  title: text('title').notNull(),
  recommendation: text('recommendation').notNull(),
  channel: mktAgentChannelEnum('channel'),
  campaignId: uuid('campaign_id').references(() => mktAgentCampaigns.id, {
    onDelete: 'set null',
  }),
  /** Invariant: always false — never auto-execute. */
  autoExecuted: boolean('auto_executed').notNull().default(false),
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
