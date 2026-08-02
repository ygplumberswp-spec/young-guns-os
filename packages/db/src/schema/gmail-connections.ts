import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const gmailConnectionStatusEnum = pgEnum('gmail_connection_status', [
  'disconnected',
  'pending',
  'connected',
  'error',
]);

export type GmailOAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
};

export const gmailConnections = pgTable('gmail_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' })
    .unique(),
  email: text('email'),
  credentialsEncrypted: text('credentials_encrypted'),
  tokensEncrypted: text('tokens_encrypted'),
  status: gmailConnectionStatusEnum('status').notNull().default('disconnected'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GmailConnection = typeof gmailConnections.$inferSelect;
export type NewGmailConnection = typeof gmailConnections.$inferInsert;
