import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './users';

/**
 * OAuth state storage for J-6.7F social connection foundation.
 * Separate from fb_oauth_states and integration_oauth_states to avoid
 * overwriting existing provider connection work.
 */

export const socialConnectionProviderEnum = pgEnum('social_connection_provider', [
  'facebook',
  'instagram',
  'google_business',
  'whatsapp_business',
  'tiktok',
]);

export const socialOauthStates = pgTable(
  'social_oauth_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: socialConnectionProviderEnum('provider').notNull(),
    stateHash: text('state_hash').notNull().unique(),
    returnPath: text('return_path'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    expiryIdx: index('social_oauth_states_expiry_idx').on(table.expiresAt),
    companyProviderIdx: index('social_oauth_states_company_provider_idx').on(
      table.companyId,
      table.provider,
    ),
  }),
);

export type SocialOauthState = typeof socialOauthStates.$inferSelect;
export type NewSocialOauthState = typeof socialOauthStates.$inferInsert;
