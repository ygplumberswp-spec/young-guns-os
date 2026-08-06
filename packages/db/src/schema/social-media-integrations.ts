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
 * Social Media Integration Layer — connection settings, sync foundation,
 * monitored items (real synced only), and approval-gated outbound drafts.
 * No auto-post / auto-reply. No demo social data.
 */

export const socialPlatformEnum = pgEnum('social_platform', [
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'google_business',
]);

export const socialConnectionStatusEnum = pgEnum('social_connection_status', [
  'not_configured',
  'awaiting_credentials',
  'connected',
  'degraded',
  'disconnected',
  'error',
]);

export const socialItemKindEnum = pgEnum('social_item_kind', [
  'comment',
  'message',
  'mention',
  'review',
  'engagement_event',
]);

export const socialSyncStatusEnum = pgEnum('social_sync_status', [
  'idle',
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
]);

export const socialOutboundKindEnum = pgEnum('social_outbound_kind', [
  'publish_post',
  'reply_comment',
  'reply_message',
  'reply_review',
]);

export const socialOutboundDraftStatusEnum = pgEnum('social_outbound_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'publish_gated',
]);

export const socialMediaConnections = pgTable('social_media_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  platform: socialPlatformEnum('platform').notNull(),
  displayName: text('display_name').notNull(),
  externalAccountId: text('external_account_id'),
  pageOrProfileUrl: text('page_or_profile_url'),
  status: socialConnectionStatusEnum('status').notNull().default('not_configured'),
  credentialsEncrypted: text('credentials_encrypted'),
  syncEnabled: boolean('sync_enabled').notNull().default(false),
  readComments: boolean('read_comments').notNull().default(true),
  readMessages: boolean('read_messages').notNull().default(true),
  readMentions: boolean('read_mentions').notNull().default(true),
  readReviews: boolean('read_reviews').notNull().default(true),
  readEngagement: boolean('read_engagement').notNull().default(true),
  allowOutboundPublish: boolean('allow_outbound_publish').notNull().default(false),
  allowAutoReply: boolean('allow_auto_reply').notNull().default(false),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  lastHealthMessage: text('last_health_message'),
  lastError: text('last_error'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const socialMediaConnectionEvents = pgTable('social_media_connection_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => socialMediaConnections.id, {
    onDelete: 'set null',
  }),
  platform: socialPlatformEnum('platform'),
  eventType: text('event_type').notNull(),
  statusBefore: text('status_before'),
  statusAfter: text('status_after'),
  message: text('message'),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const socialMediaSyncRuns = pgTable('social_media_sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => socialMediaConnections.id, {
    onDelete: 'set null',
  }),
  platform: socialPlatformEnum('platform').notNull(),
  status: socialSyncStatusEnum('status').notNull().default('queued'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  itemsIngested: integer('items_ingested').notNull().default(0),
  message: text('message').notNull().default(''),
  requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const socialMediaItems = pgTable('social_media_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => socialMediaConnections.id, {
    onDelete: 'set null',
  }),
  platform: socialPlatformEnum('platform').notNull(),
  itemKind: socialItemKindEnum('item_kind').notNull(),
  externalItemId: text('external_item_id'),
  authorName: text('author_name'),
  body: text('body').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }),
  engagementScore: integer('engagement_score'),
  syncRunId: uuid('sync_run_id').references(() => socialMediaSyncRuns.id, {
    onDelete: 'set null',
  }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const socialMediaOutboundDrafts = pgTable('social_media_outbound_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => socialMediaConnections.id, {
    onDelete: 'set null',
  }),
  platform: socialPlatformEnum('platform').notNull(),
  outboundKind: socialOutboundKindEnum('outbound_kind').notNull(),
  status: socialOutboundDraftStatusEnum('status').notNull().default('draft'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  targetItemId: uuid('target_item_id').references(() => socialMediaItems.id, {
    onDelete: 'set null',
  }),
  marketingDraftId: uuid('marketing_draft_id').references(() => mktAgentContentDrafts.id, {
    onDelete: 'set null',
  }),
  autoPublish: boolean('auto_publish').notNull().default(false),
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
