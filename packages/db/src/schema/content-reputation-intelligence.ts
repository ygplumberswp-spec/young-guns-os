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
import { mktAgentContentDrafts } from './marketing-agent';

/**
 * Content & Reputation Intelligence — quality scores, suggestions, reviews,
 * competitor observations, AURA insight handoffs.
 * No auto-publish / auto-reply. No demo data.
 */

export const criContentCategoryEnum = pgEnum('cri_content_category', [
  'content_idea',
  'caption',
  'hashtags',
  'campaign_idea',
  'seasonal',
  'education',
  'customer_focused',
  'maintenance_reminder',
  'geyser_education',
  'before_after',
  'trust_building',
  'video_review',
  'trend',
  'improvement',
]);

export const criSuggestionStatusEnum = pgEnum('cri_suggestion_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]);

export const criSentimentEnum = pgEnum('cri_sentiment', [
  'positive',
  'neutral',
  'negative',
  'mixed',
  'unavailable',
]);

export const criReviewSourceEnum = pgEnum('cri_review_source', [
  'owner_entered',
  'social_monitoring',
  'cx',
  'google_business',
  'other',
]);

export const criObservationKindEnum = pgEnum('cri_observation_kind', [
  'industry_trend',
  'market_observation',
  'pricing_observation',
  'competitor_note',
  'other',
]);

export const criInsightTargetEnum = pgEnum('cri_insight_target', [
  'command_centre',
  'executive_dashboard',
  'marketing_agent',
  'social_media',
  'communication_timeline',
  'customer_360',
  'cx',
]);

export const criInsightStatusEnum = pgEnum('cri_insight_status', [
  'open',
  'acknowledged',
  'dismissed',
]);

export const criChannelEnum = pgEnum('cri_channel', [
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'google_business',
  'website',
  'email',
  'other',
]);

export const criContentSuggestions = pgTable('cri_content_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  category: criContentCategoryEnum('category').notNull(),
  channel: criChannelEnum('channel'),
  status: criSuggestionStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
  marketingDraftId: uuid('marketing_draft_id').references(() => mktAgentContentDrafts.id, {
    onDelete: 'set null',
  }),
  qualityScore: integer('quality_score'),
  qualityAvailability: text('quality_availability').notNull().default('unavailable'),
  qualityDetails: jsonb('quality_details').$type<Record<string, unknown>>().notNull().default({}),
  /** Invariant: always false. */
  autoPublish: boolean('auto_publish').notNull().default(false),
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

export const criReviews = pgTable('cri_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  source: criReviewSourceEnum('source').notNull().default('owner_entered'),
  platform: text('platform'),
  authorName: text('author_name'),
  rating: integer('rating'),
  body: text('body').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }),
  sentiment: criSentimentEnum('sentiment').notNull().default('unavailable'),
  sentimentConfidence: integer('sentiment_confidence'),
  /** Optional link to social_media_items when Social Media Integration has ingested a review. */
  socialItemId: uuid('social_item_id'),
  /** Optional CRM customer id — never invent customers. */
  customerId: uuid('customer_id'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const criReviewResponseDrafts = pgTable('cri_review_response_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => criReviews.id, { onDelete: 'cascade' }),
  status: criSuggestionStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  /** Invariant: always false. */
  autoReply: boolean('auto_reply').notNull().default(false),
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

export const criCompetitors = pgTable('cri_competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  website: text('website'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const criCompetitorObservations = pgTable('cri_competitor_observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  competitorId: uuid('competitor_id').references(() => criCompetitors.id, {
    onDelete: 'set null',
  }),
  kind: criObservationKindEnum('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const criAuraInsights = pgTable('cri_aura_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  target: criInsightTargetEnum('target').notNull(),
  status: criInsightStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  insight: text('insight').notNull(),
  href: text('href'),
  sourceSuggestionId: uuid('source_suggestion_id').references(() => criContentSuggestions.id, {
    onDelete: 'set null',
  }),
  sourceReviewId: uuid('source_review_id').references(() => criReviews.id, {
    onDelete: 'set null',
  }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
