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
import { commPlatformAccounts } from './communications-platform';

/**
 * Personal WhatsApp Connection Layer — owner pairing, session health, privacy.
 * Extends Communications Platform `personal_whatsapp` accounts; does not replace them.
 * Never stores plaintext access tokens (credentials remain on comm_platform_accounts).
 */

export const personalWaConnectionStatusEnum = pgEnum('personal_wa_connection_status', [
  'not_configured',
  'awaiting_credentials',
  'pairing',
  'connected',
  'degraded',
  'reconnect_required',
  'disconnected',
  'error',
]);

export const personalWaPairingModeEnum = pgEnum('personal_wa_pairing_mode', [
  'credential',
  'device_link_future',
]);

export const personalWaConnections = pgTable('personal_wa_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => commPlatformAccounts.id, {
    onDelete: 'set null',
  }),
  linkedPhoneE164: text('linked_phone_e164'),
  displayLabel: text('display_label').notNull().default('Personal WhatsApp'),
  status: personalWaConnectionStatusEnum('status').notNull().default('not_configured'),
  pairingMode: personalWaPairingModeEnum('pairing_mode').notNull().default('credential'),
  pairingStartedAt: timestamp('pairing_started_at', { withTimezone: true }),
  pairingExpiresAt: timestamp('pairing_expires_at', { withTimezone: true }),
  pairedAt: timestamp('paired_at', { withTimezone: true }),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
  lastDisconnectedAt: timestamp('last_disconnected_at', { withTimezone: true }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
  lastHealthStatus: text('last_health_status'),
  lastHealthMessage: text('last_health_message'),
  lastError: text('last_error'),
  reconnectAttempts: integer('reconnect_attempts').notNull().default(0),
  reconnectRequestedAt: timestamp('reconnect_requested_at', { withTimezone: true }),
  /** Non-secret session refs only — never plaintext tokens. */
  sessionMetadata: jsonb('session_metadata').$type<Record<string, unknown>>().notNull().default({}),
  privateByDefault: boolean('private_by_default').notNull().default(true),
  excludeFromBusinessSearch: boolean('exclude_from_business_search').notNull().default(true),
  neverAutoImport: boolean('never_auto_import').notNull().default(true),
  requireApprovalToSend: boolean('require_approval_to_send').notNull().default(true),
  syncEnabled: boolean('sync_enabled').notNull().default(false),
  retentionDays: integer('retention_days'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const personalWaConnectionEvents = pgTable('personal_wa_connection_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => personalWaConnections.id, {
    onDelete: 'set null',
  }),
  eventType: text('event_type').notNull(),
  statusBefore: text('status_before'),
  statusAfter: text('status_after'),
  message: text('message'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PersonalWaConnection = typeof personalWaConnections.$inferSelect;
export type NewPersonalWaConnection = typeof personalWaConnections.$inferInsert;
export type PersonalWaConnectionEvent = typeof personalWaConnectionEvents.$inferSelect;
