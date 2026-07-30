import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { integrationProviderEnum } from './integration-connections';
import { users } from './users';

export const integrationOauthStates = pgTable('integration_oauth_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: integrationProviderEnum('provider').notNull(),
  stateHash: text('state_hash').notNull(),
  returnPath: text('return_path'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IntegrationOauthState = typeof integrationOauthStates.$inferSelect;
