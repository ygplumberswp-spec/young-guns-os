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

export const salesOpportunityStatusEnum = pgEnum('sales_opportunity_status', [
  'open',
  'won',
  'lost',
  'on_hold',
]);

export const salesOpportunitySourceEnum = pgEnum('sales_opportunity_source', [
  'manual',
  'detected',
  'quote',
  'job',
  'customer',
]);

export const salesOpportunityTypeEnum = pgEnum('sales_opportunity_type', [
  'recurring_service',
  'unconverted_quote',
  'incomplete_work',
  'maintenance_due',
  'high_value_customer',
  'follow_up',
  'custom',
]);

export const salesActivityTypeEnum = pgEnum('sales_activity_type', [
  'call',
  'email',
  'meeting',
  'follow_up',
  'quote_sent',
  'note',
  'other',
]);

export const salesRecommendationTypeEnum = pgEnum('sales_recommendation_type', [
  'follow_up',
  'quote_conversion',
  'maintenance',
  'recurring_service',
  'high_value',
  'engagement',
]);

export const salesRecommendationStatusEnum = pgEnum('sales_recommendation_status', [
  'pending',
  'accepted',
  'dismissed',
  'completed',
]);

export const salesPipelineStages = pgTable('sales_pipeline_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  stageKey: text('stage_key').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  probabilityPercent: integer('probability_percent').notNull().default(0),
  isClosedWon: boolean('is_closed_won').notNull().default(false),
  isClosedLost: boolean('is_closed_lost').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const salesOpportunities = pgTable('sales_opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  stageId: uuid('stage_id').references(() => salesPipelineStages.id, { onDelete: 'set null' }),
  opportunityType: salesOpportunityTypeEnum('opportunity_type').notNull().default('custom'),
  source: salesOpportunitySourceEnum('source').notNull().default('manual'),
  status: salesOpportunityStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  estimatedValueCents: integer('estimated_value_cents'),
  currency: text('currency').notNull().default('USD'),
  quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  detectedReason: jsonb('detected_reason').$type<Record<string, unknown>>().notNull().default({}),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const salesActivities = pgTable('sales_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => salesOpportunities.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  activityType: salesActivityTypeEnum('activity_type').notNull().default('note'),
  subject: text('subject'),
  body: text('body').notNull(),
  authorUserId: uuid('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'no action' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const salesRecommendations = pgTable('sales_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  recommendationType: salesRecommendationTypeEnum('recommendation_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: salesRecommendationStatusEnum('status').notNull().default('pending'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SalesPipelineStage = typeof salesPipelineStages.$inferSelect;
export type SalesOpportunity = typeof salesOpportunities.$inferSelect;
export type SalesActivity = typeof salesActivities.$inferSelect;
export type SalesRecommendation = typeof salesRecommendations.$inferSelect;
