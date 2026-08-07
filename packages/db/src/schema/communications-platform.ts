import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';
import { jobs } from './jobs';
import { integrationConnections } from './integration-connections';
import { whatsappConnections } from './whatsapp-connections';

export const commPlatformAccountKindEnum = pgEnum('comm_platform_account_kind', [
  'business_gmail',
  'business_whatsapp',
  'personal_whatsapp',
]);

export const commPlatformChannelEnum = pgEnum('comm_platform_channel', ['email', 'whatsapp']);

export const commPlatformCapabilityStateEnum = pgEnum('comm_platform_capability_state', [
  'not_configured',
  'disconnected',
  'pending',
  'connected',
  'error',
  'degraded',
]);

export const commPlatformLinkTargetTypeEnum = pgEnum('comm_platform_link_target_type', [
  'customer',
  'lead',
  'job',
  'quote',
  'invoice',
  'property',
  'supplier',
  'staff',
]);

export const commPlatformParticipantKindEnum = pgEnum('comm_platform_participant_kind', [
  'customer',
  'supplier',
  'staff',
  'unknown',
]);

export const commPlatformImportDecisionActionEnum = pgEnum('comm_platform_import_decision_action', [
  'import',
  'import_from',
  'create_customer',
  'link',
  'keep_private',
]);

export const commPlatformDraftStatusEnum = pgEnum('comm_platform_draft_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const commPlatformAccounts = pgTable('comm_platform_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  accountKind: commPlatformAccountKindEnum('account_kind').notNull(),
  label: text('label').notNull(),
  externalAddress: text('external_address'),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  integrationConnectionId: uuid('integration_connection_id').references(
    () => integrationConnections.id,
    { onDelete: 'set null' },
  ),
  whatsappConnectionId: uuid('whatsapp_connection_id').references(() => whatsappConnections.id, {
    onDelete: 'set null',
  }),
  credentialsEncrypted: text('credentials_encrypted'),
  status: commPlatformCapabilityStateEnum('status').notNull().default('not_configured'),
  privateByDefault: boolean('private_by_default').notNull().default(false),
  syncEnabled: boolean('sync_enabled').notNull().default(false),
  retentionDays: integer('retention_days'),
  lastTestAt: timestamp('last_test_at', { withTimezone: true }),
  lastTestStatus: text('last_test_status'),
  lastTestMessage: text('last_test_message'),
  lastError: text('last_error'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commPlatformInboxIndex = pgTable(
  'comm_platform_inbox_index',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => commPlatformAccounts.id, {
      onDelete: 'set null',
    }),
    accountKind: commPlatformAccountKindEnum('account_kind').notNull(),
    channel: commPlatformChannelEnum('channel').notNull(),
    externalThreadId: text('external_thread_id'),
    externalMessageId: text('external_message_id'),
    subject: text('subject'),
    preview: text('preview'),
    participantLabel: text('participant_label'),
    participantKind: commPlatformParticipantKindEnum('participant_kind')
      .notNull()
      .default('unknown'),
    folder: text('folder').notNull().default('inbox'),
    unread: boolean('unread').notNull().default(false),
    urgent: boolean('urgent').notNull().default(false),
    direction: text('direction').notNull().default('inbound'),
    linkTargetType: commPlatformLinkTargetTypeEnum('link_target_type'),
    linkTargetId: uuid('link_target_id'),
    assignedJobId: uuid('assigned_job_id').references(() => jobs.id, { onDelete: 'set null' }),
    attachmentCount: integer('attachment_count').notNull().default(0),
    labels: jsonb('labels').$type<string[]>().notNull().default([]),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('comm_platform_inbox_company_kind_external_uidx')
      .on(table.companyId, table.accountKind, table.externalMessageId)
      .where(sql`${table.externalMessageId} IS NOT NULL`),
  ],
);

export const commPlatformPersonalThreads = pgTable('comm_platform_personal_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id')
    .notNull()
    .references(() => commPlatformAccounts.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  contactPhone: text('contact_phone'),
  contactName: text('contact_name'),
  threadKey: text('thread_key').notNull(),
  lastMessagePreview: text('last_message_preview'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  unread: boolean('unread').notNull().default(false),
  attachmentCount: integer('attachment_count').notNull().default(0),
  privateByDefault: boolean('private_by_default').notNull().default(true),
  excludedFromBusinessSearch: boolean('excluded_from_business_search').notNull().default(true),
  importConsentGranted: boolean('import_consent_granted').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commPlatformImportDecisions = pgTable('comm_platform_import_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  decidedByUserId: uuid('decided_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  personalThreadId: uuid('personal_thread_id').references(() => commPlatformPersonalThreads.id, {
    onDelete: 'set null',
  }),
  contactPhone: text('contact_phone'),
  contactName: text('contact_name'),
  action: commPlatformImportDecisionActionEnum('action').notNull(),
  linkTargetType: commPlatformLinkTargetTypeEnum('link_target_type'),
  linkTargetId: uuid('link_target_id'),
  importFromAt: timestamp('import_from_at', { withTimezone: true }),
  notes: text('notes'),
  autoImported: boolean('auto_imported').notNull().default(false),
  executedImport: boolean('executed_import').notNull().default(false),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commPlatformGmailDrafts = pgTable('comm_platform_gmail_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => commPlatformAccounts.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: commPlatformDraftStatusEnum('status').notNull().default('draft'),
  toAddresses: jsonb('to_addresses').$type<string[]>().notNull().default([]),
  ccAddresses: jsonb('cc_addresses').$type<string[]>().notNull().default([]),
  bccAddresses: jsonb('bcc_addresses').$type<string[]>().notNull().default([]),
  subject: text('subject').notNull().default(''),
  bodyText: text('body_text').notNull().default(''),
  replyToMessageId: text('reply_to_message_id'),
  forwardOfMessageId: text('forward_of_message_id'),
  labelIds: jsonb('label_ids').$type<string[]>().notNull().default([]),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CommPlatformAccount = typeof commPlatformAccounts.$inferSelect;
export type NewCommPlatformAccount = typeof commPlatformAccounts.$inferInsert;
export type CommPlatformInboxItem = typeof commPlatformInboxIndex.$inferSelect;
export type CommPlatformPersonalThread = typeof commPlatformPersonalThreads.$inferSelect;
export type CommPlatformImportDecision = typeof commPlatformImportDecisions.$inferSelect;
export type CommPlatformGmailDraft = typeof commPlatformGmailDrafts.$inferSelect;
