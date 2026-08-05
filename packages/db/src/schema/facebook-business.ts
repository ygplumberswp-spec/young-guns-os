import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';
import { leads } from './leads';
import { mktAgentContentDrafts } from './marketing-agent';

/**
 * Facebook Business Integration (Phase 3).
 *
 * Every table is company-scoped. Tokens live only in `credentials_encrypted`
 * (AES-256-GCM via INTEGRATIONS_ENCRYPTION_KEY) and are never mirrored into
 * metadata, events or audit rows.
 *
 * The `fb_` prefix keeps this separate from the generic `social_media_*`
 * foundation (migration 0137), which stays in place unchanged.
 */

export const fbConnectionStateEnum = pgEnum('fb_connection_state', [
  'configuration_required',
  'disconnected',
  'connected',
  'partial',
  'missing_permission',
  'reauthorisation_required',
  'expired',
  'provider_unavailable',
]);

export const fbContentStatusEnum = pgEnum('fb_content_status', [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
]);

export const fbContentTypeEnum = pgEnum('fb_content_type', [
  'text',
  'link',
  'photo',
  'multi_photo',
]);

export const fbCommentClassificationEnum = pgEnum('fb_comment_classification', [
  'enquiry',
  'complaint',
  'praise',
  'question',
  'spam',
  'general',
]);

export const fbReplyStatusEnum = pgEnum('fb_reply_status', [
  'draft',
  'in_review',
  'approved',
  'sending',
  'sent',
  'failed',
  'cancelled',
]);

export const fbLeadSourceEnum = pgEnum('fb_lead_source', [
  'lead_ad',
  'messenger',
  'comment',
  'utm_link',
]);

export const fbLeadStageEnum = pgEnum('fb_lead_stage', [
  'imported',
  'matched',
  'classified',
  'assigned',
  'reply_drafted',
  'reply_approved',
  'responded',
  'converted',
  'closed',
]);

export const fbSyncStatusEnum = pgEnum('fb_sync_status', [
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
]);

export const fbInsightSourceEnum = pgEnum('fb_insight_source', [
  'organic',
  'paid',
  'combined',
  'unknown',
]);

/** One connected Facebook Page per company. */
export const fbConnections = pgTable(
  'fb_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' })
      .unique(),
    state: fbConnectionStateEnum('state').notNull().default('disconnected'),
    pageId: text('page_id'),
    pageName: text('page_name'),
    pageUrl: text('page_url'),
    pageCategory: text('page_category'),
    /** Encrypted long-lived Page access token. Never returned by any route. */
    credentialsEncrypted: text('credentials_encrypted'),
    /** Null when Meta issued a non-expiring Page token. */
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    /** Exactly what Meta reported granted — not what TITAN requested. */
    grantedPermissions: jsonb('granted_permissions').$type<string[]>().notNull().default([]),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    lastVerificationOk: boolean('last_verification_ok'),
    lastVerificationAuthError: boolean('last_verification_auth_error')
      .notNull()
      .default(false),
    lastVerificationPermissionError: boolean('last_verification_permission_error')
      .notNull()
      .default(false),
    lastVerificationProviderUnavailable: boolean('last_verification_provider_unavailable')
      .notNull()
      .default(false),
    lastVerificationMessage: text('last_verification_message'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    webhookVerifyTokenHash: text('webhook_verify_token_hash'),
    webhookSubscribedAt: timestamp('webhook_subscribed_at', { withTimezone: true }),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    connectedByUserId: uuid('connected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pageIdx: index('fb_connections_page_idx').on(table.companyId, table.pageId),
  }),
);

/** Short-lived CSRF state for the Meta OAuth redirect. */
export const fbOauthStates = pgTable(
  'fb_oauth_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stateHash: text('state_hash').notNull().unique(),
    returnPath: text('return_path'),
    initiatorRoleName: text('initiator_role_name'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    expiryIdx: index('fb_oauth_states_expiry_idx').on(table.expiresAt),
  }),
);

/**
 * Connection lifecycle trail. Separate from content audit so a reviewer can
 * read the connection story on its own.
 */
export const fbConnectionEvents = pgTable(
  'fb_connection_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => fbConnections.id, {
      onDelete: 'cascade',
    }),
    eventType: text('event_type').notNull(),
    stateBefore: fbConnectionStateEnum('state_before'),
    stateAfter: fbConnectionStateEnum('state_after'),
    message: text('message'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('fb_connection_events_company_idx').on(table.companyId, table.createdAt),
  }),
);

/** The content workspace: Draft → In Review → Approved → Scheduled → Publishing → Published. */
export const fbContent = pgTable(
  'fb_content',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => fbConnections.id, {
      onDelete: 'set null',
    }),
    status: fbContentStatusEnum('status').notNull().default('draft'),
    contentType: fbContentTypeEnum('content_type').notNull().default('text'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    linkUrl: text('link_url'),
    /** Marketing Agent draft this content came from, when applicable. */
    marketingDraftId: uuid('marketing_draft_id').references(() => mktAgentContentDrafts.id, {
      onDelete: 'set null',
    }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** Publishing is refused unless both approval columns are set. */
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedByUserId: uuid('rejected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    decisionNotes: text('decision_notes'),
    /** Written only after Facebook confirms a post id. */
    externalPostId: text('external_post_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishAttempts: integer('publish_attempts').notNull().default(0),
    /** True when a request left TITAN, so a retry reuses the attempt number. */
    lastAttemptReachedProvider: boolean('last_attempt_reached_provider').notNull().default(false),
    lastPublishError: text('last_publish_error'),
    brandCheckWarnings: jsonb('brand_check_warnings').$type<string[]>().notNull().default([]),
    privacyAcknowledgedByUserId: uuid('privacy_acknowledged_by_user_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    privacyAcknowledgedAt: timestamp('privacy_acknowledged_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('fb_content_status_idx').on(table.companyId, table.status),
    scheduleIdx: index('fb_content_schedule_idx').on(table.status, table.scheduledFor),
    externalPostUnique: unique('fb_content_external_post_unique').on(
      table.companyId,
      table.externalPostId,
    ),
  }),
);

export const fbContentMedia = pgTable(
  'fb_content_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    contentId: uuid('content_id')
      .notNull()
      .references(() => fbContent.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    storageKey: text('storage_key'),
    sourceUrl: text('source_url'),
    sourceContext: text('source_context').notNull().default('upload'),
    privacyReviewRequired: boolean('privacy_review_required').notNull().default(true),
    privacyNotes: jsonb('privacy_notes').$type<string[]>().notNull().default([]),
    /** Facebook photo id after upload. */
    externalMediaId: text('external_media_id'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    contentIdx: index('fb_content_media_content_idx').on(table.contentId, table.position),
  }),
);

/**
 * One row per publish request. The idempotency key is unique so a retry that
 * races a slow provider response cannot create a second Facebook post.
 */
export const fbPublishAttempts = pgTable(
  'fb_publish_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    contentId: uuid('content_id')
      .notNull()
      .references(() => fbContent.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    succeeded: boolean('succeeded'),
    reachedProvider: boolean('reached_provider').notNull().default(false),
    externalPostId: text('external_post_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    keyUnique: unique('fb_publish_attempts_key_unique').on(table.idempotencyKey),
    contentIdx: index('fb_publish_attempts_content_idx').on(table.contentId, table.attempt),
  }),
);

export const fbComments = pgTable(
  'fb_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => fbConnections.id, {
      onDelete: 'set null',
    }),
    contentId: uuid('content_id').references(() => fbContent.id, { onDelete: 'set null' }),
    externalCommentId: text('external_comment_id').notNull(),
    externalPostId: text('external_post_id'),
    parentExternalCommentId: text('parent_external_comment_id'),
    authorName: text('author_name'),
    /** Meta's page-scoped id. Not a real identity and never treated as one. */
    authorExternalId: text('author_external_id'),
    body: text('body').notNull(),
    classification: fbCommentClassificationEnum('classification').notNull().default('general'),
    classificationConfident: boolean('classification_confident').notNull().default(false),
    leadCandidate: boolean('lead_candidate').notNull().default(false),
    answered: boolean('answered').notNull().default(false),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    externalUnique: unique('fb_comments_external_unique').on(
      table.companyId,
      table.externalCommentId,
    ),
    unansweredIdx: index('fb_comments_unanswered_idx').on(table.companyId, table.answered),
  }),
);

/** Replies to comments and Messenger threads. Nothing leaves without approval. */
export const fbReplies = pgTable(
  'fb_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => fbComments.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id'),
    status: fbReplyStatusEnum('status').notNull().default('draft'),
    body: text('body').notNull(),
    /** True when AURA produced the text, so the audit trail shows its origin. */
    auraGenerated: boolean('aura_generated').notNull().default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    externalReplyId: text('external_reply_id'),
    lastError: text('last_error'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('fb_replies_status_idx').on(table.companyId, table.status),
  }),
);

/**
 * Facebook-originated leads. Links to the existing `leads` table rather than
 * duplicating the CRM — `lead_id` is null while a match needs human review.
 */
export const fbLeads = pgTable(
  'fb_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => fbConnections.id, {
      onDelete: 'set null',
    }),
    source: fbLeadSourceEnum('source').notNull(),
    stage: fbLeadStageEnum('stage').notNull().default('imported'),
    externalLeadId: text('external_lead_id'),
    externalFormId: text('external_form_id'),
    commentId: uuid('comment_id').references(() => fbComments.id, { onDelete: 'set null' }),
    contentId: uuid('content_id').references(() => fbContent.id, { onDelete: 'set null' }),
    fullName: text('full_name'),
    email: text('email'),
    phone: text('phone'),
    message: text('message'),
    urgency: text('urgency').notNull().default('normal'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmContent: text('utm_content'),
    /** Set once linked to the CRM. Null while duplicate review is outstanding. */
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    duplicateOfLeadId: uuid('duplicate_of_lead_id').references(() => leads.id, {
      onDelete: 'set null',
    }),
    duplicateOutcome: text('duplicate_outcome'),
    duplicateReason: text('duplicate_reason'),
    /** True when a name-only match needs a person to decide. */
    reviewRequired: boolean('review_required').notNull().default(false),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    externalUnique: unique('fb_leads_external_unique').on(table.companyId, table.externalLeadId),
    stageIdx: index('fb_leads_stage_idx').on(table.companyId, table.stage),
  }),
);

/** Real Graph insight rows only. Absent data stays absent — never zero-filled. */
export const fbInsights = pgTable(
  'fb_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    contentId: uuid('content_id').references(() => fbContent.id, { onDelete: 'cascade' }),
    externalPostId: text('external_post_id'),
    metricName: text('metric_name').notNull(),
    metricValue: integer('metric_value').notNull(),
    source: fbInsightSourceEnum('source').notNull().default('unknown'),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    metricUnique: unique('fb_insights_metric_unique').on(
      table.companyId,
      table.externalPostId,
      table.metricName,
      table.periodStart,
    ),
  }),
);

/** Post → Enquiry → Lead → Quote → Job → Invoice → Payment, one evidenced step per row. */
export const fbAttributionLinks = pgTable(
  'fb_attribution_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    contentId: uuid('content_id').references(() => fbContent.id, { onDelete: 'cascade' }),
    fbLeadId: uuid('fb_lead_id').references(() => fbLeads.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    entityId: uuid('entity_id'),
    /** `observed` when TITAN recorded the link; `reported` when Facebook did. */
    evidence: text('evidence').notNull().default('observed'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    stepUnique: unique('fb_attribution_step_unique').on(
      table.companyId,
      table.contentId,
      table.fbLeadId,
      table.step,
    ),
  }),
);

export const fbSyncRuns = pgTable(
  'fb_sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => fbConnections.id, {
      onDelete: 'set null',
    }),
    trigger: text('trigger').notNull().default('manual'),
    status: fbSyncStatusEnum('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    commentsIngested: integer('comments_ingested').notNull().default(0),
    leadsIngested: integer('leads_ingested').notNull().default(0),
    insightsIngested: integer('insights_ingested').notNull().default(0),
    /** Names the capabilities skipped for missing permissions, so gaps are visible. */
    skippedCapabilities: jsonb('skipped_capabilities').$type<string[]>().notNull().default([]),
    message: text('message').notNull().default(''),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('fb_sync_runs_company_idx').on(table.companyId, table.createdAt),
  }),
);

/** Received webhook envelopes. The unique key makes Meta's redeliveries harmless. */
export const fbWebhookEvents = pgTable(
  'fb_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    externalPageId: text('external_page_id'),
    field: text('field').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingError: text('processing_error'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dedupeUnique: unique('fb_webhook_events_dedupe_unique').on(table.dedupeKey),
    receivedIdx: index('fb_webhook_events_received_idx').on(table.receivedAt),
  }),
);

/** Dedupe state so an unresolved provider error is raised once, not every poll. */
export const fbNotifications = pgTable(
  'fb_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    subjectId: text('subject_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    sendCount: integer('send_count').notNull().default(0),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dedupeUnique: unique('fb_notifications_dedupe_unique').on(table.dedupeKey),
  }),
);

export type FbConnectionRow = typeof fbConnections.$inferSelect;
export type FbContentRow = typeof fbContent.$inferSelect;
export type FbCommentRow = typeof fbComments.$inferSelect;
export type FbLeadRow = typeof fbLeads.$inferSelect;
export type FbSyncRunRow = typeof fbSyncRuns.$inferSelect;
