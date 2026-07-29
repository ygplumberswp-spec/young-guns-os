import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { customers } from './customers';
import { users } from './users';

export const marketingCampaignStatusEnum = pgEnum('marketing_campaign_status', [
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
]);

export const marketingCampaignTypeEnum = pgEnum('marketing_campaign_type', [
  'retention',
  'maintenance',
  'seasonal',
  'engagement',
  'acquisition',
  'custom',
]);

export const marketingActivityTypeEnum = pgEnum('marketing_activity_type', [
  'email_draft',
  'content',
  'outreach',
  'social_draft',
  'note',
  'other',
]);

export const marketingRecommendationTypeEnum = pgEnum('marketing_recommendation_type', [
  'maintenance_reminder',
  'service_interest',
  'follow_up_campaign',
  'seasonal',
  'retention',
  'engagement',
  'content',
]);

export const marketingRecommendationStatusEnum = pgEnum('marketing_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const marketingSegmentTypeEnum = pgEnum('marketing_segment_type', [
  'high_value',
  'repeat_service',
  'dormant',
  'new_customer',
  'high_engagement',
  'custom',
]);

export const marketingSegments = pgTable('marketing_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  segmentKey: text('segment_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  segmentType: marketingSegmentTypeEnum('segment_type').notNull().default('custom'),
  criteria: jsonb('criteria').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketingCampaigns = pgTable('marketing_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: marketingCampaignStatusEnum('status').notNull().default('draft'),
  campaignType: marketingCampaignTypeEnum('campaign_type').notNull().default('custom'),
  targetSegmentKey: text('target_segment_key'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketingActivities = pgTable('marketing_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').references(() => marketingCampaigns.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  activityType: marketingActivityTypeEnum('activity_type').notNull().default('note'),
  subject: text('subject'),
  body: text('body').notNull(),
  authorUserId: uuid('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketingRecommendations = pgTable('marketing_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  recommendationType: marketingRecommendationTypeEnum('recommendation_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: marketingRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MarketingSegment = typeof marketingSegments.$inferSelect;
export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type MarketingActivity = typeof marketingActivities.$inferSelect;
export type MarketingRecommendation = typeof marketingRecommendations.$inferSelect;
