import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

export const miWorkflowStatusEnum = pgEnum('mi_workflow_status', [
  'draft',
  'review',
  'pending_approval',
  'approved',
  'executed',
  'cancelled',
]);

export const miAdapterStatusEnum = pgEnum('mi_adapter_status', [
  'active',
  'inactive',
  'testing',
  'error',
]);

export const miMarketingProviderTypeEnum = pgEnum('mi_marketing_provider_type', [
  'meta_ads',
  'google_ads',
  'microsoft_ads',
  'linkedin_ads',
  'tiktok_ads',
  'x_ads',
  'youtube_ads',
  'mailchimp',
  'hubspot',
  'brevo',
  'activecampaign',
  'klaviyo',
  'sendgrid',
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'x',
  'youtube',
  'google_business',
  'google_analytics',
  'search_console',
  'wordpress',
  'webflow',
  'shopify',
  'csv_import',
  'sftp',
  'generic_rest',
  'webhook',
  'custom',
]);

export const miCampaignLifecycleStatusEnum = pgEnum('mi_campaign_lifecycle_status', [
  'idea',
  'draft',
  'planning',
  'content_creation',
  'creative_review',
  'brand_review',
  'legal_review',
  'budget_approval',
  'scheduled',
  'active',
  'paused',
  'completed',
  'archived',
]);

export const miAlertSeverityEnum = pgEnum('mi_alert_severity', ['info', 'warning', 'critical']);

export const miAlertStatusEnum = pgEnum('mi_alert_status', [
  'open',
  'acknowledged',
  'resolved',
  'dismissed',
]);

export const miContentStatusEnum = pgEnum('mi_content_status', [
  'draft',
  'review',
  'approved',
  'scheduled',
  'published',
  'archived',
]);

export const miPlatformConfig = pgTable('mi_platform_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: 'cascade' }),
  marketingStandards: jsonb('marketing_standards')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  providerAdapterTemplates: jsonb('provider_adapter_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  brandTemplates: jsonb('brand_templates').$type<Record<string, unknown>>().notNull().default({}),
  campaignTemplates: jsonb('campaign_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  contentTemplates: jsonb('content_templates')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  attributionStandards: jsonb('attribution_standards')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  auditRetentionDays: integer('audit_retention_days').notNull().default(365),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miMarketingProviderAdapters = pgTable('mi_marketing_provider_adapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerType: miMarketingProviderTypeEnum('provider_type').notNull(),
  name: text('name').notNull(),
  status: miAdapterStatusEnum('status').notNull().default('inactive'),
  syncDirection: text('sync_direction').notNull().default('bidirectional'),
  syncFrequency: text('sync_frequency'),
  fieldMappings: jsonb('field_mappings').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miMarketingStrategies = pgTable('mi_marketing_strategies', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  strategyKey: text('strategy_key').notNull(),
  workflowStatus: miWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  goals: jsonb('goals').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miBrands = pgTable('mi_brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  brandKey: text('brand_key').notNull(),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miBrandAssets = pgTable('mi_brand_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id')
    .notNull()
    .references(() => miBrands.id, { onDelete: 'cascade' }),
  assetType: text('asset_type').notNull(),
  name: text('name').notNull(),
  assetKey: text('asset_key').notNull(),
  fileUrl: text('file_url'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miAudiences = pgTable('mi_audiences', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  audienceKey: text('audience_key').notNull(),
  audienceType: text('audience_type'),
  criteria: jsonb('criteria').$type<Record<string, unknown>>().notNull().default({}),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miSuppressionLists = pgTable('mi_suppression_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  listKey: text('list_key').notNull(),
  listType: text('list_type'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miCampaignPlans = pgTable('mi_campaign_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  strategyId: uuid('strategy_id').references(() => miMarketingStrategies.id, {
    onDelete: 'set null',
  }),
  brandId: uuid('brand_id').references(() => miBrands.id, { onDelete: 'set null' }),
  audienceId: uuid('audience_id').references(() => miAudiences.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  planKey: text('plan_key').notNull(),
  lifecycleStatus: miCampaignLifecycleStatusEnum('lifecycle_status').notNull().default('draft'),
  workflowStatus: miWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  budgetCents: integer('budget_cents'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miContentItems = pgTable('mi_content_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  contentType: text('content_type').notNull(),
  contentStatus: miContentStatusEnum('content_status').notNull().default('draft'),
  body: text('body'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miCreativeRequests = pgTable('mi_creative_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  requestType: text('request_type').notNull(),
  workflowStatus: miWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  brief: text('brief'),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miSocialAccounts = pgTable('mi_social_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').references(() => miBrands.id, { onDelete: 'set null' }),
  providerType: miMarketingProviderTypeEnum('provider_type').notNull(),
  accountName: text('account_name').notNull(),
  accountHandle: text('account_handle'),
  externalId: text('external_id'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miSocialPosts = pgTable('mi_social_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  socialAccountId: uuid('social_account_id').references(() => miSocialAccounts.id, {
    onDelete: 'set null',
  }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  title: text('title'),
  body: text('body').notNull(),
  contentStatus: miContentStatusEnum('content_status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miSocialMentions = pgTable('mi_social_mentions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  socialAccountId: uuid('social_account_id').references(() => miSocialAccounts.id, {
    onDelete: 'set null',
  }),
  mentionType: text('mention_type'),
  author: text('author'),
  content: text('content'),
  sentiment: text('sentiment'),
  url: text('url'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miReviews = pgTable('mi_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  rating: numeric('rating', { precision: 3, scale: 1 }),
  reviewText: text('review_text'),
  author: text('author'),
  responseText: text('response_text'),
  workflowStatus: miWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miAdAccounts = pgTable('mi_ad_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  providerType: miMarketingProviderTypeEnum('provider_type').notNull(),
  name: text('name').notNull(),
  externalAccountId: text('external_account_id'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miAdCampaigns = pgTable('mi_ad_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  adAccountId: uuid('ad_account_id').references(() => miAdAccounts.id, { onDelete: 'set null' }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  externalCampaignId: text('external_campaign_id'),
  lifecycleStatus: miCampaignLifecycleStatusEnum('lifecycle_status').notNull().default('draft'),
  budgetCents: integer('budget_cents'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miAdBudgets = pgTable('mi_ad_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  adCampaignId: uuid('ad_campaign_id')
    .notNull()
    .references(() => miAdCampaigns.id, { onDelete: 'cascade' }),
  budgetType: text('budget_type').notNull(),
  amountCents: integer('amount_cents').notNull().default(0),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miSeoKeywords = pgTable('mi_seo_keywords', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  keyword: text('keyword').notNull(),
  searchVolume: integer('search_volume'),
  difficulty: numeric('difficulty', { precision: 5, scale: 2 }),
  currentRank: integer('current_rank'),
  targetUrl: text('target_url'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miLocalPresenceProfiles = pgTable('mi_local_presence_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  locationKey: text('location_key').notNull(),
  address: text('address'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miWebsites = pgTable('mi_websites', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miLandingPages = pgTable('mi_landing_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  websiteId: uuid('website_id').references(() => miWebsites.id, { onDelete: 'set null' }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  contentStatus: miContentStatusEnum('content_status').notNull().default('draft'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miEmailCampaigns = pgTable('mi_email_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  subject: text('subject'),
  contentStatus: miContentStatusEnum('content_status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miMessagingCampaigns = pgTable('mi_messaging_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  channel: text('channel').notNull(),
  contentStatus: miContentStatusEnum('content_status').notNull().default('draft'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miCustomerJourneys = pgTable('mi_customer_journeys', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  journeyKey: text('journey_key').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miAttributionRecords = pgTable('mi_attribution_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  channel: text('channel').notNull(),
  touchpointType: text('touchpoint_type'),
  attributedValueCents: integer('attributed_value_cents'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miRoiSnapshots = pgTable('mi_roi_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  spendCents: integer('spend_cents').notNull().default(0),
  revenueCents: integer('revenue_cents').notNull().default(0),
  roiPercent: numeric('roi_percent', { precision: 7, scale: 2 }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miReferralCampaigns = pgTable('mi_referral_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  campaignKey: text('campaign_key').notNull(),
  lifecycleStatus: miCampaignLifecycleStatusEnum('lifecycle_status').notNull().default('draft'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miCalendarEvents = pgTable('mi_calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  campaignPlanId: uuid('campaign_plan_id').references(() => miCampaignPlans.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  eventType: text('event_type'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miExperiments = pgTable('mi_experiments', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  experimentKey: text('experiment_key').notNull(),
  experimentType: text('experiment_type'),
  workflowStatus: miWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miMarketIntelligenceRecords = pgTable('mi_market_intelligence_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  recordType: text('record_type').notNull(),
  title: text('title').notNull(),
  source: text('source'),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miMarketingAlerts = pgTable('mi_marketing_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  alertType: text('alert_type').notNull(),
  severity: miAlertSeverityEnum('severity').notNull().default('warning'),
  status: miAlertStatusEnum('status').notNull().default('open'),
  title: text('title').notNull(),
  description: text('description'),
  sourceModule: text('source_module'),
  sourceEntityId: uuid('source_entity_id'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miMarketingActionDrafts = pgTable('mi_marketing_action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  draftType: text('draft_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  workflowStatus: miWorkflowStatusEnum('workflow_status').notNull().default('draft'),
  sourceRecords: jsonb('source_records').$type<Record<string, unknown>>().notNull().default({}),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  requiresHumanReview: boolean('requires_human_review').notNull().default(true),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miAnalyticsSnapshots = pgTable('mi_analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  activeCampaignCount: integer('active_campaign_count').notNull().default(0),
  scheduledContentCount: integer('scheduled_content_count').notNull().default(0),
  openAlertCount: integer('open_alert_count').notNull().default(0),
  totalSpendCents: integer('total_spend_cents').notNull().default(0),
  attributedRevenueCents: integer('attributed_revenue_cents').notNull().default(0),
  socialPostCount: integer('social_post_count').notNull().default(0),
  emailCampaignCount: integer('email_campaign_count').notNull().default(0),
  currency: text('currency').notNull().default('ZAR'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const miAuditLogs = pgTable('mi_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MiPlatformConfig = typeof miPlatformConfig.$inferSelect;
export type MiCampaignPlan = typeof miCampaignPlans.$inferSelect;
export type MiMarketingStrategy = typeof miMarketingStrategies.$inferSelect;
export type MiMarketingAlert = typeof miMarketingAlerts.$inferSelect;
export type MiAnalyticsSnapshot = typeof miAnalyticsSnapshots.$inferSelect;
